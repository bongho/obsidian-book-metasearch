import { requestUrl } from 'obsidian';

import type {
	Book,
	BookProvider,
	HealthStatus,
	SearchOptions,
} from './base';
import { ProviderError } from './base';

/**
 * Kakao (다음) Book Search API.
 *
 * Docs: https://developers.kakao.com/docs/latest/ko/daum-search/book
 * Auth: REST API Key issued from https://developers.kakao.com/ (즉시 발급, 승인 대기 없음)
 * Rate: 30,000 requests/day free tier — no observed hard cutoff, quota resets 00:00 KST.
 *
 * Response shape (v3/search/book):
 *   documents: [{
 *     title, contents, url, isbn (isbn10 space isbn13),
 *     datetime (ISO 8601), authors[], publisher, translators[],
 *     price, sale_price, thumbnail, status ("정상판매" 등)
 *   }]
 *   meta: { total_count, pageable_count, is_end }
 *
 * S1 decisions carry over: price/sale_price/status are NOT stored (re-search diff noise).
 * CORS is not exposed → Obsidian requestUrl required (same as Aladin).
 */

const KAKAO_BASE = 'https://dapi.kakao.com/v3/search/book';

interface KakaoDocument {
	title: string;
	contents?: string; // "책 소개"
	url?: string; // 상품 페이지
	isbn?: string; // "isbn10 isbn13" space-separated
	datetime?: string; // "2024-01-15T00:00:00.000+09:00"
	authors?: string[];
	publisher?: string;
	translators?: string[];
	price?: number;
	sale_price?: number;
	thumbnail?: string;
	status?: string;
}

interface KakaoResponse {
	documents?: KakaoDocument[];
	meta?: {
		total_count?: number;
		pageable_count?: number;
		is_end?: boolean;
	};
	// Error path (Kakao returns HTTP error status + JSON body)
	code?: number;
	msg?: string;
	errorType?: string;
	message?: string;
}

export class KakaoProvider implements BookProvider {
	readonly id = 'kakao';
	readonly displayName = 'Kakao (다음 도서)';
	readonly requiresAuth = true;

	constructor(private readonly apiKey: () => string) {}

	async healthcheck(): Promise<HealthStatus> {
		const key = this.apiKey();
		if (!key) {
			return {
				ok: false,
				code: 'AUTH_MISSING',
				message: 'Kakao REST API Key가 설정되지 않았습니다.',
				docsUrl: 'https://developers.kakao.com/',
			};
		}
		try {
			await this.call({ query: 'test', size: 1 });
			return { ok: true };
		} catch (e) {
			if (e instanceof ProviderError) {
				return {
					ok: false,
					code: e.code,
					message: e.message,
				};
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
		const data = await this.call({
			query,
			size: clampSize(opts.maxResults),
			sort: 'accuracy',
			target: undefined,
		});
		return (data.documents ?? []).map((d) => this.normalize(d));
	}

	async searchByISBN(isbn: string): Promise<Book | null> {
		const cleaned = isbn.replace(/[^0-9Xx]/g, '');
		const data = await this.call({
			query: cleaned,
			target: 'isbn',
			size: 1,
		});
		const doc = data.documents?.[0];
		return doc ? this.normalize(doc) : null;
	}

	private async call(params: {
		query: string;
		size?: number;
		sort?: 'accuracy' | 'latest';
		target?: 'title' | 'isbn' | 'publisher' | 'person';
		page?: number;
	}): Promise<KakaoResponse> {
		const key = this.apiKey();
		if (!key) {
			throw new ProviderError(
				this.id,
				'AUTH_MISSING',
				'Kakao REST API Key not configured',
			);
		}
		const url = new URL(KAKAO_BASE);
		url.searchParams.set('query', params.query);
		if (params.size) url.searchParams.set('size', String(params.size));
		if (params.sort) url.searchParams.set('sort', params.sort);
		if (params.target) url.searchParams.set('target', params.target);
		if (params.page) url.searchParams.set('page', String(params.page));

		const res = await requestUrl({
			url: url.toString(),
			method: 'GET',
			headers: {
				Authorization: `KakaoAK ${key}`,
			},
			throw: false,
		});
		let json: KakaoResponse;
		try {
			json = JSON.parse(res.text) as KakaoResponse;
		} catch (e) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Invalid JSON (HTTP ${res.status}): ${res.text.slice(0, 200)}`,
				e,
			);
		}
		if (res.status === 401 || json.code === -401) {
			throw new ProviderError(
				this.id,
				'AUTH_INVALID',
				json.msg ?? json.message ?? 'Kakao API Key가 유효하지 않습니다.',
			);
		}
		if (res.status === 429) {
			throw new ProviderError(
				this.id,
				'RATE_LIMIT',
				json.msg ?? json.message ?? 'Kakao 일일 호출 한도(30,000)에 도달했습니다.',
			);
		}
		if (res.status >= 400 || typeof json.code === 'number') {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Kakao HTTP ${res.status}: ${json.msg ?? json.message ?? res.text.slice(0, 200)}`,
			);
		}
		return json;
	}

	private normalize(doc: KakaoDocument): Book {
		const { isbn10, isbn13 } = splitKakaoIsbn(doc.isbn);
		const publishDate = doc.datetime?.slice(0, 10); // YYYY-MM-DD
		return {
			title: doc.title,
			authors: doc.authors ?? [],
			translators:
				doc.translators && doc.translators.length > 0
					? doc.translators
					: undefined,
			publisher: doc.publisher,
			publishDate,
			publishYear: publishDate?.slice(0, 4),
			isbn10,
			isbn13,
			// Kakao doesn't expose page count or categories in search response
			language: 'ko',
			coverUrl: doc.thumbnail,
			description: doc.contents,
			providerUrl: doc.url,
			provider: this.id,
		};
	}
}

// ────────────────────────────────────────────────────────────

function clampSize(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(50, Math.trunc(n)));
}

/**
 * Kakao returns ISBN as a single space-separated field: "isbn10 isbn13".
 * Sometimes only one form is present. We split by whitespace and pick each
 * by length.
 */
function splitKakaoIsbn(raw: string | undefined): {
	isbn10?: string;
	isbn13?: string;
} {
	if (!raw) return {};
	const parts = raw
		.split(/\s+/)
		.map((s) => s.replace(/[^0-9Xx]/g, ''))
		.filter(Boolean);
	let isbn10: string | undefined;
	let isbn13: string | undefined;
	for (const p of parts) {
		if (p.length === 10 && /^[0-9]{9}[0-9X]$/i.test(p)) isbn10 = p;
		if (p.length === 13 && /^[0-9]{13}$/.test(p)) isbn13 = p;
	}
	return { isbn10, isbn13 };
}
