import { requestUrl } from 'obsidian';

import type {
	Book,
	BookProvider,
	HealthStatus,
	SearchOptions,
} from './base';
import { ProviderError } from './base';
import { stripHtml } from '../util/html';

/**
 * Google Books API.
 *
 * Docs: https://developers.google.com/books/docs/v1/using
 *
 * API key optional. Without a key: rate limit is severe (~1 req/sec, no daily
 * quota) and searches occasionally return HTTP 429 or 400 for high-volume
 * usage. With a free key from Google Cloud Console (Books API enabled): 1,000
 * requests/day free tier + higher burst.
 *
 * S1 upstream (anpigon) issue #159, #152, #121 all trace to Google Books
 * rate-limit / spec changes. Fanout to other providers keeps user-visible
 * failures rare.
 */

const GBOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';

interface GBookVolumeInfo {
	title?: string;
	subtitle?: string;
	authors?: string[];
	publisher?: string;
	publishedDate?: string;
	description?: string;
	industryIdentifiers?: Array<{
		type: 'ISBN_10' | 'ISBN_13' | 'OTHER' | string;
		identifier: string;
	}>;
	pageCount?: number;
	categories?: string[];
	imageLinks?: {
		smallThumbnail?: string;
		thumbnail?: string;
	};
	language?: string;
	previewLink?: string;
	infoLink?: string;
	canonicalVolumeLink?: string;
}

interface GBookItem {
	id?: string;
	volumeInfo?: GBookVolumeInfo;
}

interface GBookResponse {
	kind?: string;
	totalItems?: number;
	items?: GBookItem[];
	error?: {
		code?: number;
		message?: string;
		errors?: Array<{ reason?: string; message?: string }>;
	};
}

export class GoogleBooksProvider implements BookProvider {
	readonly id = 'google';
	readonly displayName = 'Google Books';
	readonly requiresAuth = false; // Works without key, key only raises limits

	constructor(private readonly apiKey: () => string) {}

	async healthcheck(): Promise<HealthStatus> {
		try {
			await this.call({ q: 'test', maxResults: 1 });
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
			q: query,
			maxResults: clampMax(opts.maxResults),
			langRestrict: opts.locale,
		});
		return (data.items ?? []).map((it) => this.normalize(it));
	}

	async searchByISBN(isbn: string): Promise<Book | null> {
		const cleaned = isbn.replace(/[^0-9Xx]/g, '');
		const data = await this.call({
			q: `isbn:${cleaned}`,
			maxResults: 1,
		});
		const it = data.items?.[0];
		return it ? this.normalize(it) : null;
	}

	private async call(params: {
		q: string;
		maxResults?: number;
		startIndex?: number;
		langRestrict?: string;
	}): Promise<GBookResponse> {
		const url = new URL(GBOOKS_BASE);
		url.searchParams.set('q', params.q);
		if (params.maxResults) {
			url.searchParams.set('maxResults', String(params.maxResults));
		}
		if (params.startIndex) {
			url.searchParams.set('startIndex', String(params.startIndex));
		}
		if (params.langRestrict) {
			url.searchParams.set('langRestrict', params.langRestrict);
		}
		const key = this.apiKey();
		if (key) url.searchParams.set('key', key);
		url.searchParams.set('printType', 'books');

		const res = await requestUrl({
			url: url.toString(),
			method: 'GET',
			throw: false,
		});
		let json: GBookResponse;
		try {
			json = JSON.parse(res.text) as GBookResponse;
		} catch (e) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Invalid JSON (HTTP ${res.status}): ${res.text.slice(0, 200)}`,
				e,
			);
		}
		if (res.status === 403 || json.error?.code === 403) {
			throw new ProviderError(
				this.id,
				'AUTH_INVALID',
				json.error?.message ?? 'Google Books API Key rejected or quota exceeded.',
			);
		}
		if (res.status === 429 || json.error?.code === 429) {
			throw new ProviderError(
				this.id,
				'RATE_LIMIT',
				json.error?.message ?? 'Google Books rate limit reached.',
			);
		}
		if (res.status >= 400 || json.error) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Google Books HTTP ${res.status}: ${json.error?.message ?? res.text.slice(0, 200)}`,
			);
		}
		return json;
	}

	private normalize(item: GBookItem): Book {
		const v = item.volumeInfo ?? {};
		const isbn10 = v.industryIdentifiers?.find(
			(id) => id.type === 'ISBN_10',
		)?.identifier;
		const isbn13 = v.industryIdentifiers?.find(
			(id) => id.type === 'ISBN_13',
		)?.identifier;
		const cover = pickBestCover(v.imageLinks);
		return {
			title: v.title ?? '',
			subtitle: v.subtitle,
			authors: v.authors ?? [],
			publisher: v.publisher,
			publishDate: v.publishedDate, // "2024", "2024-05", or "2024-05-01"
			publishYear: v.publishedDate?.slice(0, 4),
			isbn10,
			isbn13,
			pageCount: v.pageCount,
			language: v.language,
			categories: v.categories,
			categoryLeaf: v.categories?.[v.categories.length - 1],
			coverUrl: cover,
			description: stripHtml(v.description ?? ''),
			providerUrl: v.canonicalVolumeLink ?? v.infoLink,
			provider: this.id,
		};
	}
}

// ────────────────────────────────────────────────────────────

function clampMax(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(40, Math.trunc(n)));
}

/**
 * Prefer thumbnail over smallThumbnail. Strip `zoom=1` from Google Books
 * cover URLs — that forces a 128px render; unset uses provider default which
 * is ~512px. Also drop `edge=curl` for cleaner images. #142 addressed.
 */
function pickBestCover(links: GBookVolumeInfo['imageLinks']): string | undefined {
	const raw = links?.thumbnail ?? links?.smallThumbnail;
	if (!raw) return undefined;
	const upgraded = raw
		.replace(/([?&])zoom=\d+/g, '$1')
		.replace(/([?&])edge=curl/g, '$1')
		.replace(/\?&/, '?')
		.replace(/[?&]$/, '');
	// http → https (Obsidian requires https)
	return upgraded.replace(/^http:\/\//, 'https://');
}
