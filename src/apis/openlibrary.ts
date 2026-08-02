import { requestUrl } from 'obsidian';

import type {
	Book,
	BookProvider,
	HealthStatus,
	SearchOptions,
} from './base';
import { ProviderError } from './base';

/**
 * Open Library (openlibrary.org) — Internet Archive의 open library data.
 *
 * Docs: https://openlibrary.org/dev/docs/api/search
 *
 * Zero auth, CORS-open covers CDN (`covers.openlibrary.org`), broad foreign
 * catalog. Korean coverage is thin (usually zero hits for hangeul titles) —
 * we still register it for foreign coverage fallback (S1 upstream issue #58,
 * #149).
 *
 * Search endpoint returns `docs[]` with:
 *   title, subtitle, author_name[], publisher[], publish_date[],
 *   isbn[] (mixed 10/13, sometimes with hyphens), first_publish_year,
 *   number_of_pages_median, cover_i (integer for cover CDN URL), subject[],
 *   language[] (3-letter ISO 639-2 codes — 'eng', 'kor', etc.)
 */

const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVER = 'https://covers.openlibrary.org/b';
const OL_ISBN = 'https://openlibrary.org/isbn';

interface OLDoc {
	key?: string; // "/works/OL...W"
	title?: string;
	subtitle?: string;
	author_name?: string[];
	publisher?: string[];
	publish_date?: string[];
	first_publish_year?: number;
	isbn?: string[];
	cover_i?: number;
	subject?: string[];
	language?: string[]; // 3-letter codes
	number_of_pages_median?: number;
	edition_count?: number;
	ratings_average?: number;
	ratings_count?: number;
}

interface OLSearchResponse {
	numFound?: number;
	start?: number;
	docs?: OLDoc[];
}

// Language mapping: ISO 639-2 (Open Library) → ISO 639-1 (our canonical form).
const LANG_MAP: Record<string, string> = {
	eng: 'en',
	kor: 'ko',
	jpn: 'ja',
	chi: 'zh',
	fre: 'fr',
	fra: 'fr',
	ger: 'de',
	deu: 'de',
	spa: 'es',
	ita: 'it',
	por: 'pt',
	rus: 'ru',
	ara: 'ar',
	hin: 'hi',
	dut: 'nl',
	nld: 'nl',
	pol: 'pl',
	tur: 'tr',
	swe: 'sv',
	dan: 'da',
	fin: 'fi',
	nor: 'no',
	tha: 'th',
	vie: 'vi',
	ind: 'id',
	heb: 'he',
	gre: 'el',
	ell: 'el',
	cze: 'cs',
	ces: 'cs',
	hun: 'hu',
	rom: 'ro',
	ron: 'ro',
	ukr: 'uk',
	bul: 'bg',
	cat: 'ca',
	hrv: 'hr',
	slo: 'sk',
	slk: 'sk',
	slv: 'sl',
	srp: 'sr',
	est: 'et',
	lav: 'lv',
	lit: 'lt',
};

export class OpenLibraryProvider implements BookProvider {
	readonly id = 'openlibrary';
	readonly displayName = 'Open Library';
	readonly requiresAuth = false;

	async healthcheck(): Promise<HealthStatus> {
		try {
			await this.searchByQuery('test', { maxResults: 1 });
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
		const url = new URL(OL_SEARCH);
		url.searchParams.set('q', query);
		url.searchParams.set(
			'limit',
			String(clampLimit(opts.maxResults)),
		);
		url.searchParams.set(
			'fields',
			'key,title,subtitle,author_name,publisher,publish_date,first_publish_year,isbn,cover_i,subject,language,number_of_pages_median,edition_count',
		);
		if (opts.locale) {
			// Open Library expects 3-letter codes; approximate reverse lookup
			const three = to3LetterLang(opts.locale);
			if (three) url.searchParams.set('language', three);
		}
		const res = await requestUrl({
			url: url.toString(),
			method: 'GET',
			throw: false,
		});
		if (res.status >= 400) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Open Library HTTP ${res.status}: ${res.text.slice(0, 200)}`,
			);
		}
		let json: OLSearchResponse;
		try {
			json = JSON.parse(res.text) as OLSearchResponse;
		} catch (e) {
			throw new ProviderError(
				this.id,
				'UNKNOWN',
				`Invalid JSON (HTTP ${res.status}): ${res.text.slice(0, 200)}`,
				e,
			);
		}
		return (json.docs ?? []).map((d) => this.normalize(d));
	}

	async searchByISBN(isbn: string): Promise<Book | null> {
		const cleaned = isbn.replace(/[^0-9Xx]/g, '');
		try {
			const res = await requestUrl({
				url: `${OL_ISBN}/${cleaned}.json`,
				method: 'GET',
				throw: false,
			});
			if (res.status === 404) return null;
			if (res.status >= 400) {
				throw new ProviderError(
					this.id,
					'UNKNOWN',
					`Open Library HTTP ${res.status}`,
				);
			}
			// The /isbn endpoint returns edition-level data with a different shape;
			// simpler to just search on the full search endpoint.
			const [doc] = (
				await this.searchByQuery(cleaned, { maxResults: 1 })
			);
			return doc ?? null;
		} catch (e) {
			if (e instanceof ProviderError) throw e;
			throw new ProviderError(
				this.id,
				'NETWORK',
				e instanceof Error ? e.message : String(e),
			);
		}
	}

	private normalize(doc: OLDoc): Book {
		const isbnList = (doc.isbn ?? [])
			.map((s) => s.replace(/[^0-9Xx]/g, ''))
			.filter(Boolean);
		const isbn10 = isbnList.find(
			(x) => x.length === 10 && /^[0-9]{9}[0-9X]$/i.test(x),
		);
		const isbn13 = isbnList.find(
			(x) => x.length === 13 && /^[0-9]{13}$/.test(x),
		);
		const publishYear = doc.first_publish_year
			? String(doc.first_publish_year)
			: doc.publish_date?.[0]?.slice(0, 4);
		const language = doc.language?.[0]
			? LANG_MAP[doc.language[0]] ?? doc.language[0]
			: undefined;
		return {
			title: doc.title ?? '',
			subtitle: doc.subtitle,
			authors: doc.author_name ?? [],
			publisher: doc.publisher?.[0],
			publishYear,
			publishDate: doc.publish_date?.[0],
			isbn10,
			isbn13,
			pageCount: doc.number_of_pages_median,
			language,
			categories: doc.subject?.slice(0, 5),
			categoryLeaf: doc.subject?.[0],
			coverUrl: doc.cover_i
				? `${OL_COVER}/id/${doc.cover_i}-L.jpg`
				: undefined,
			providerUrl: doc.key ? `https://openlibrary.org${doc.key}` : undefined,
			provider: this.id,
		};
	}
}

function clampLimit(n: number | undefined): number {
	if (typeof n !== 'number' || !Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(100, Math.trunc(n)));
}

function to3LetterLang(twoLetter: string): string | undefined {
	// Reverse lookup — first entry wins for languages with multiple 3-letter codes.
	for (const [three, two] of Object.entries(LANG_MAP)) {
		if (two === twoLetter) return three;
	}
	return undefined;
}
