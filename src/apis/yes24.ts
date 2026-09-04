import { requestUrl } from 'obsidian';

import type {
	Book,
	BookProvider,
	HealthStatus,
	SearchOptions,
} from './base';
import { ProviderError } from './base';
import { stripHtml } from '../util/html';
import { isRealIsbn10, isRealIsbn13 } from '../util/isbn';
import { parseYes24Author } from '../util/yes24-author-parser';

/**
 * YES24 Open API.
 *
 * Docs: https://developers.yes24.com/docs
 * API Key: https://developers.yes24.com/docs/apikey (instant, no approval wait)
 * Rate: 20,000 requests/day, 10 req/s burst on the free ("기본") key tier.
 *
 * Notable:
 * - Auth header is `X-API-KEY`. A query parameter is rejected with
 *   `AUTH_001 / "X-Api-Key 헤더가 없습니다."`.
 * - **"No results" is HTTP 404**, not an empty 200 (`errorCode: "SEARCH_001"`).
 *   Treating 404 as a failure would turn every miss into an error toast.
 * - `goods/itemList` (search) is lean: no `subTitle`, no `pages`, and `isbn13`
 *   is empty on box sets. The detail fields only arrive from
 *   `goods/itemDetail?detail=Y`, so `enrich()` fetches them once the user
 *   commits to a book rather than paying N calls per keystroke.
 * - CORS not exposed → Obsidian `requestUrl()`, never `fetch()`.
 *
 * Replaces Aladin, whose Open API shuts down 2026-10-30 (new key issuance
 * ended 2026-09-04). Measured against a 12-ISBN sample: 12/12 lookups
 * resolved, `pages` on 11/12 (the miss is a foreign-language title),
 * `goodsSortNm` 12/12.
 */

const YES24_BASE = 'https://apis.yes24.com/v1';

/** Raw YES24 item shape — subset that we care about. */
export interface Yes24Item {
	itemId?: number;
	title?: string;
	subTitle?: string; // detail=Y only
	author?: string; // "유발 하라리 저/조현욱 역" — see parseYes24Author
	goodsType?: string; // "도서"
	goodsSortNm?: string; // "국내도서-자기계발" (2 levels, `-` delimited)
	publisher?: string;
	isbn10?: string;
	isbn13?: string;
	publishDate?: string; // "20260708" — no separators
	originalTitle?: string; // detail=Y only, empty for domestic titles
	pages?: number; // detail=Y only
	cover?: string;
	link?: string; // product page
	contentDetail?: {
		bookIntroduction?: string | null; // may contain HTML
		bookSummary?: string | null;
		tableOfContents?: string | null;
	};
	// Explicitly ignored (mirrors the Aladin S1 decision on diff noise):
	// shopPrice, salePrice, yesPoint, salePoint, starScore, itemStatus,
	// weight, width, length, height, adultYn, upDown
}

interface Yes24Response {
	success?: boolean;
	message?: string;
	errorCode?: string;
	data?: {
		items?: Yes24Item[];
	} | null;
}

export class Yes24Provider implements BookProvider {
	readonly id = 'yes24';
	readonly displayName = 'YES24';
	readonly requiresAuth = true;

	/**
	 * API key is read lazily via callback so live settings updates are picked
	 * up immediately without re-registering the provider.
	 */
	constructor(private readonly apiKey: () => string) {}

	async healthcheck(): Promise<HealthStatus> {
		const key = this.apiKey();
		if (!key) {
			return {
				ok: false,
				code: 'AUTH_MISSING',
				message: 'YES24 API Key가 설정되지 않았습니다.',
				docsUrl: 'https://developers.yes24.com/docs/apikey',
			};
		}
		try {
			await this.call('goods/itemList', { query: 'test', pageSize: 1 });
			return { ok: true };
		} catch (e) {
			if (e instanceof ProviderError) {
				return { ok: false, code: e.code, message: e.message };
			}
			return {
				ok: false,
				code: 'NETWORK',
				message: e instanceof Error ? e.message : String(e),
			};
		}
	}

	async searchByQuery(
		query: string,
		opts: SearchOptions = {},
	): Promise<Book[]> {
		const data = await this.call('goods/itemList', {
			query,
			pageSize: clampPageSize(opts.maxResults),
		});
		return (data.data?.items ?? []).map((it) => normalizeYes24Item(it, this.id));
	}

	async searchByISBN(isbn: string): Promise<Book | null> {
		const cleaned = isbn.replace(/[^0-9Xx]/g, '');
		const item = await this.lookupDetail('ISBN13', cleaned);
		return item ? normalizeYes24Item(item, this.id) : null;
	}

	/**
	 * Fill in the detail-only fields (`subTitle`, `pages`, `originalTitle`,
	 * book introduction) that `goods/itemList` omits. Called once, right before
	 * a note is written — a search returning 20 hits would otherwise cost 20
	 * extra requests for 19 books the user never picks.
	 *
	 * Returns the input unchanged on any failure: enrichment is an improvement,
	 * never a precondition for creating the note.
	 */
	async enrich(book: Book): Promise<Book> {
		const [searchType, query] = detailKeyFor(book);
		if (!query) return book;
		try {
			const item = await this.lookupDetail(searchType, query);
			if (!item) return book;
			return { ...book, ...normalizeYes24Item(item, this.id) };
		} catch {
			return book;
		}
	}

	private async lookupDetail(
		searchType: 'ISBN13' | 'ItemId',
		query: string,
	): Promise<Yes24Item | null> {
		const data = await this.call('goods/itemDetail', {
			searchType,
			query,
			detail: 'Y',
		});
		return data.data?.items?.[0] ?? null;
	}

	/**
	 * YES24 request. `throw: false` so the 404-means-empty case can be decoded
	 * from the body instead of surfacing as a transport error.
	 */
	private async call(
		endpoint: 'goods/itemList' | 'goods/itemDetail',
		params: Record<string, string | number>,
	): Promise<Yes24Response> {
		const key = this.apiKey();
		if (!key) {
			throw new ProviderError(
				this.id,
				'AUTH_MISSING',
				'YES24 API Key not configured',
			);
		}
		const url = new URL(`${YES24_BASE}/${endpoint}`);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, String(v));
		}
		const res = await requestUrl({
			url: url.toString(),
			method: 'GET',
			headers: { 'X-API-KEY': key, Accept: 'application/json' },
			throw: false,
		});

		let json: Yes24Response;
		try {
			json = JSON.parse(res.text) as Yes24Response;
		} catch (e) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Invalid JSON (HTTP ${res.status}): ${res.text.slice(0, 200)}`,
				e,
			);
		}

		// "No results" — a legitimate empty answer that YES24 sends as a 404.
		if (isEmptyResult(res.status, json)) return { success: true, data: { items: [] } };

		if (res.status === 401 || json.errorCode?.startsWith('AUTH')) {
			throw new ProviderError(
				this.id,
				'AUTH_INVALID',
				json.message ?? 'YES24 API Key가 유효하지 않습니다.',
			);
		}
		if (res.status === 429) {
			throw new ProviderError(
				this.id,
				'RATE_LIMIT',
				json.message ?? '일일 호출 한도(20,000회)에 도달했습니다.',
			);
		}
		if (res.status >= 400 || json.success === false) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`YES24 HTTP ${res.status}: ${json.errorCode ?? ''} ${json.message ?? res.text.slice(0, 200)}`.trim(),
			);
		}
		return json;
	}
}

// ────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing.

/** `SEARCH_001` on a 404 means the query matched nothing, not that we failed. */
export function isEmptyResult(status: number, json: Yes24Response): boolean {
	return status === 404 && json.errorCode === 'SEARCH_001';
}

/**
 * `goodsSortNm` is a `-` delimited hierarchy, shallower than Aladin's:
 *   "국내도서-자기계발"  →  path ["국내도서", "자기계발"], leaf "자기계발"
 */
export function parseGoodsSort(raw: string | undefined): {
	categoryLeaf?: string;
	categoryPath: string[];
} {
	if (!raw) return { categoryPath: [] };
	const path = raw
		.split('-')
		.map((s) => s.trim())
		.filter(Boolean);
	if (path.length === 0) return { categoryPath: [] };
	return { categoryPath: path, categoryLeaf: path[path.length - 1] };
}

/** "20260708" → "2026-07-08". Anything else passes through untouched. */
export function formatPublishDate(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const digits = raw.trim();
	if (!/^\d{8}$/.test(digits)) return digits || undefined;
	return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Prefer an ISBN13 lookup; fall back to the product id parsed out of the
 * product URL. Box sets come back from search with an empty `isbn13` but a
 * usable `link`, and without this they could never be enriched.
 */
export function detailKeyFor(book: Book): ['ISBN13' | 'ItemId', string | null] {
	if (isRealIsbn13(book.isbn13)) return ['ISBN13', book.isbn13];
	const itemId = /\/goods\/(\d+)/.exec(book.providerUrl ?? '')?.[1];
	return ['ItemId', itemId ?? null];
}

export function normalizeYes24Item(item: Yes24Item, providerId: string): Book {
	const { authors, translators } = parseYes24Author(item.author ?? '');
	const { categoryLeaf, categoryPath } = parseGoodsSort(item.goodsSortNm);
	const publishDate = formatPublishDate(item.publishDate);
	const introduction = item.contentDetail?.bookIntroduction ?? '';
	return {
		title: stripHtml(item.title ?? ''),
		subtitle: item.subTitle?.trim() || undefined,
		authors,
		translators: translators.length > 0 ? translators : undefined,
		publisher: item.publisher,
		publishDate,
		publishYear: publishDate?.slice(0, 4),
		isbn10: isRealIsbn10(item.isbn10) ? item.isbn10 : undefined,
		isbn13: isRealIsbn13(item.isbn13) ? item.isbn13 : undefined,
		pageCount: typeof item.pages === 'number' && item.pages > 0 ? item.pages : undefined,
		// `goodsSortNm` distinguishes 국내도서 from 외국도서; anything else is
		// left unset rather than guessed at.
		language: categoryPath[0] === '국내도서' ? 'ko' : undefined,
		originalPublishDate: undefined,
		categories: categoryPath.length > 0 ? categoryPath : undefined,
		categoryLeaf,
		coverUrl: item.cover,
		description: stripHtml(introduction),
		providerUrl: item.link,
		provider: providerId,
	};
}

function clampPageSize(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(50, Math.trunc(n)));
}
