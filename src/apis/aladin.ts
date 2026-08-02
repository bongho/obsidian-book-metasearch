import { requestUrl } from 'obsidian';

import type {
	Book,
	BookProvider,
	HealthStatus,
	SearchOptions,
} from './base';
import { ProviderError } from './base';
import { parseAladinAuthor } from '../util/aladin-author-parser';
import { parseAladinCategory } from '../util/aladin-category-parser';

/**
 * Aladin Open API (알라딘 오픈 API).
 *
 * Docs: https://blog.aladin.co.kr/openapi/
 * TTB Key: https://www.aladin.co.kr/ttb/wblogmain.aspx
 *
 * Notable:
 * - HTTPS-only endpoints (HTTP → 301 redirect).
 * - HTTP 200 for every response — success or failure. Errors carry an
 *   `errorCode` payload. Never rely on HTTP status alone.
 * - CORS not exposed → must use Obsidian `requestUrl()`, never `fetch()`.
 * - "Book DB by Aladin" credit link is required at the note footer per ToS.
 * - Rate limit: 5,000 requests/day free tier.
 * - Data fields NOT stored per S1 decision (re-search diff noise):
 *     salesPoint, priceSales, priceStandard, customerReviewRank
 */

const ALADIN_BASE = 'https://www.aladin.co.kr/ttb/api';
const ALADIN_VERSION = '20131101'; // Documented latest API version

/** Raw Aladin item shape — subset that we care about. */
interface AladinItem {
	title: string;
	author: string; // "홍길동 (지은이), 이영희 (옮긴이)" — see parseAladinAuthor
	pubDate?: string; // "YYYY-MM-DD"
	description?: string; // May include HTML fragments
	isbn?: string; // isbn10 (Aladin field name is literally "isbn")
	isbn13?: string;
	publisher?: string;
	cover?: string; // Cover image URL
	categoryId?: number;
	categoryName?: string; // "국내도서>인문학>철학"
	link?: string; // Product page URL (used for credit link per Aladin ToS)
	subInfo?: {
		subTitle?: string;
		originalTitle?: string;
		itemPage?: number;
	};
	// Explicitly ignored (S1 decision):
	// priceSales, priceStandard, salesPoint, customerReviewRank, mallType, adult
}

interface AladinResponse {
	version?: string;
	totalResults?: number;
	item?: AladinItem[];
	// Error path
	errorCode?: number;
	errorMessage?: string;
}

export class AladinProvider implements BookProvider {
	readonly id = 'aladin';
	readonly displayName = 'Aladin (알라딘)';
	readonly requiresAuth = true;

	/**
	 * TTB Key is read lazily via callback so live settings updates are picked
	 * up immediately without re-registering the provider.
	 */
	constructor(private readonly ttbKey: () => string) {}

	async healthcheck(): Promise<HealthStatus> {
		const key = this.ttbKey();
		if (!key) {
			return {
				ok: false,
				code: 'AUTH_MISSING',
				message: 'TTB Key가 설정되지 않았습니다.',
				docsUrl: 'https://www.aladin.co.kr/ttb/wblogmain.aspx',
			};
		}
		try {
			// Minimal-cost probe: single result with common Korean word.
			const data = await this.call('ItemSearch.aspx', {
				Query: 'test',
				MaxResults: 1,
				SearchTarget: 'Book',
			});
			if (typeof data.errorCode === 'number') {
				return this.mapErrorToHealth(data.errorCode, data.errorMessage);
			}
			return { ok: true };
		} catch (e) {
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
		const key = this.ttbKey();
		if (!key) {
			throw new ProviderError(
				this.id,
				'AUTH_MISSING',
				'TTB Key not configured',
			);
		}

		const data = await this.call('ItemSearch.aspx', {
			Query: query,
			QueryType: 'Keyword',
			MaxResults: clampMaxResults(opts.maxResults),
			SearchTarget: mapTargetType(opts.targetType),
			Sort: 'Accuracy',
			start: 1,
		});

		if (typeof data.errorCode === 'number') {
			throw this.errorFromCode(data.errorCode, data.errorMessage);
		}
		return (data.item ?? []).map((it) => this.normalize(it));
	}

	async searchByISBN(isbn: string): Promise<Book | null> {
		const key = this.ttbKey();
		if (!key) {
			throw new ProviderError(
				this.id,
				'AUTH_MISSING',
				'TTB Key not configured',
			);
		}
		const cleaned = isbn.replace(/[^0-9Xx]/g, '');
		const data = await this.call('ItemLookUp.aspx', {
			ItemId: cleaned,
			ItemIdType: cleaned.length === 13 ? 'ISBN13' : 'ISBN',
			OptResult: 'subInfo',
		});
		if (typeof data.errorCode === 'number') {
			throw this.errorFromCode(data.errorCode, data.errorMessage);
		}
		const item = data.item?.[0];
		return item ? this.normalize(item) : null;
	}

	/**
	 * Aladin request. Not exposed publicly — callers use the typed methods.
	 * `throw: false` because Aladin returns HTTP 200 even on errors and we
	 * decode the errorCode payload instead.
	 */
	private async call(
		endpoint: 'ItemSearch.aspx' | 'ItemLookUp.aspx',
		params: Record<string, string | number>,
	): Promise<AladinResponse> {
		const url = new URL(`${ALADIN_BASE}/${endpoint}`);
		url.searchParams.set('ttbkey', this.ttbKey());
		url.searchParams.set('output', 'js'); // JSON
		url.searchParams.set('Version', ALADIN_VERSION);
		url.searchParams.set('Cover', 'Big'); // Highest official cover size
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, String(v));
		}
		const res = await requestUrl({
			url: url.toString(),
			method: 'GET',
			throw: false,
		});
		try {
			return JSON.parse(res.text) as AladinResponse;
		} catch (e) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Invalid JSON response (HTTP ${res.status}): ${res.text.slice(0, 200)}`,
				e,
			);
		}
	}

	private errorFromCode(code: number, msg?: string): ProviderError {
		const health = this.mapErrorToHealth(code, msg);
		if (health.ok) {
			return new ProviderError(this.id, 'UNKNOWN', 'unexpected success');
		}
		return new ProviderError(this.id, health.code, health.message);
	}

	private mapErrorToHealth(code: number, msg?: string): HealthStatus {
		switch (code) {
			case 4:
				return {
					ok: false,
					code: 'AUTH_INVALID',
					message: msg ?? 'TTB Key가 유효하지 않습니다.',
					docsUrl: 'https://www.aladin.co.kr/ttb/wblogmain.aspx',
				};
			case 7:
				return {
					ok: false,
					code: 'RATE_LIMIT',
					message: msg ?? '일일 호출 한도(5,000회)에 도달했습니다.',
				};
			default:
				return {
					ok: false,
					code: 'UNKNOWN',
					message: `Aladin errorCode ${code}: ${msg ?? 'unknown'}`,
				};
		}
	}

	private normalize(item: AladinItem): Book {
		const { authors, translators } = parseAladinAuthor(item.author ?? '');
		const { categoryLeaf, categoryPath } = parseAladinCategory(
			item.categoryName,
		);
		return {
			title: stripHtml(item.title ?? ''),
			subtitle: item.subInfo?.subTitle,
			authors,
			translators: translators.length > 0 ? translators : undefined,
			publisher: item.publisher,
			publishDate: item.pubDate,
			publishYear: item.pubDate?.slice(0, 4),
			isbn10: item.isbn,
			isbn13: item.isbn13,
			pageCount: item.subInfo?.itemPage,
			language: 'ko',
			categories: categoryPath.length > 0 ? categoryPath : undefined,
			categoryLeaf,
			coverUrl: item.cover,
			description: stripHtml(item.description ?? ''),
			providerUrl: item.link,
			provider: this.id,
			// raw omitted — kept only when Book is passed in-memory, never persisted
		};
	}
}

// ────────────────────────────────────────────────────────────
// helpers

function clampMaxResults(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(50, Math.trunc(n))); // Aladin caps at 50
}

function mapTargetType(t: SearchOptions['targetType']): string {
	switch (t) {
		case 'ebook':
			return 'eBook';
		case 'all':
			return 'All';
		default:
			return 'Book';
	}
}

function stripHtml(s: string): string {
	return s.replace(/<[^>]+>/g, '').trim();
}
