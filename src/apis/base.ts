/**
 * Provider abstraction — every book search provider (Aladin, Kakao, Google Books,
 * Open Library, and later Kyobo, SEOJI, data4library) implements `BookProvider`.
 *
 * The registry queries providers in parallel (fanout) or sequentially (fallback).
 * See `./registry.ts`.
 */

/**
 * Normalized book representation. Provider-agnostic — each provider's raw response
 * is mapped into this shape before hitting the note writer.
 *
 * Design decisions (see PRD §4-1 and Sprint S1 plan):
 * - `authors[]` = original authors, `translators[]` = translators (Aladin "지은이" vs "옮긴이")
 * - `isbn10` and `isbn13` stored separately here; combined into the frontmatter
 *   `isbn` field ("{isbn10} {isbn13}") by note writer, per bongho vault schema.
 * - `raw` is kept for debugging/recovery only — never persisted to frontmatter.
 * - Aladin `salesPoint` / `priceSales` are intentionally NOT in this type — they
 *   cause re-search diff noise. See S1 decision 3.
 */
export interface Book {
	// Required
	title: string;
	authors: string[];
	provider: string; // "aladin" | "kakao" | "google" | "openlibrary" | ...

	// Bibliographic
	subtitle?: string;
	translators?: string[];
	publisher?: string;
	publishYear?: string; // "2024" — matches bongho vault schema `publish: 2024`
	publishDate?: string; // "2024-01-15" — provider-native ISO date
	originalPublishDate?: string; // For translations (Aladin subInfo.originalTitle 등)
	isbn10?: string;
	isbn13?: string;
	pageCount?: number;
	language?: string; // 'ko' | 'en' | 'ja' | ...

	// Categorization (Aladin "국내도서>인문학>철학" → categoryPath + categoryLeaf)
	categories?: string[]; // full path: ["국내도서", "인문학", "철학"]
	categoryLeaf?: string; // last segment: "철학"

	// Media & links
	coverUrl?: string; // provider cover CDN URL
	description?: string; // may contain HTML — strip before rendering
	providerUrl?: string; // product/detail page (used for credit link per Aladin ToS)

	// Debug — never persisted
	raw?: unknown;
}

/**
 * Commercial pricing snapshot for a specific edition + condition.
 *
 * NOTE: Deliberately kept OUT of the `Book` interface — `Book` describes the
 * work (title, authors, ISBN, description), while prices are commercial
 * signals that fluctuate. Storing them on `Book` would mean every re-search
 * shows a diff on numeric fields; keeping them as a separate `PriceQuote[]`
 * lets the note writer emit them into an append-only `## Price Watch`
 * section (or a one-shot Notice) without touching frontmatter.
 */
export interface PriceQuote {
	provider: string;
	condition: 'new' | 'used-good' | 'used-fair' | 'ebook';
	priceKrw?: number;
	availability?: 'in-stock' | 'out-of-stock';
	link?: string;
	/** ISO timestamp when the quote was fetched. */
	fetchedAt: string;
}

/**
 * Search options passed to `BookProvider.searchByQuery`.
 */
export interface SearchOptions {
	/** Preferred locale for the provider (e.g. Google Books `langRestrict`). ISO 639-1 code. */
	locale?: string;
	/** Max results per provider. Aladin hard cap: 50. Kakao: 50. */
	maxResults?: number;
	/** Filter by media type (Aladin SearchTarget: Book/eBook/All). */
	targetType?: 'book' | 'ebook' | 'all';
	/** Abort signal for cancellation (e.g. user typing next query). */
	signal?: AbortSignal;
}

/**
 * Provider health status — returned by `healthcheck()`.
 *
 * Codes:
 * - `AUTH_MISSING` — no API key configured
 * - `AUTH_INVALID` — key configured but rejected (e.g. Aladin errorCode: 4)
 * - `API_NOT_REGISTERED` — key valid but this API not enabled (e.g. Naver SE05, historical)
 * - `RATE_LIMIT` — quota exhausted (e.g. Aladin errorCode: 7 = 5,000/day)
 * - `NETWORK` — connection failed (offline, DNS, TLS)
 * - `UNKNOWN` — anything else; include original message for debugging
 */
export type HealthStatus =
	| { ok: true }
	| {
			ok: false;
			code:
				| 'AUTH_MISSING'
				| 'AUTH_INVALID'
				| 'API_NOT_REGISTERED'
				| 'RATE_LIMIT'
				| 'NETWORK'
				| 'UNKNOWN';
			message: string;
			docsUrl?: string;
	  };

/** Health status codes as a const type for `ProviderError.code`. */
export type HealthFailureCode = Exclude<HealthStatus, { ok: true }>['code'];

/**
 * Every provider implements this interface. Register instances with
 * `ProviderRegistry.register()`.
 */
export interface BookProvider {
	/** Unique provider identifier (e.g. "aladin"). Used for `Book.provider`. */
	readonly id: string;
	/** Human-readable name shown in settings UI (e.g. "Aladin (알라딘)"). */
	readonly displayName: string;
	/** Whether the provider needs an API key/token to function. */
	readonly requiresAuth: boolean;

	/** Verify credentials and connectivity. Non-throwing — returns HealthStatus. */
	healthcheck(): Promise<HealthStatus>;

	/** Full-text keyword search. May throw ProviderError on failure. */
	searchByQuery(query: string, opts?: SearchOptions): Promise<Book[]>;

	/** ISBN10/ISBN13 lookup. Returns null if no exact match. */
	searchByISBN(isbn: string): Promise<Book | null>;

	/**
	 * Optional: download cover image bytes. Providers that don't host covers
	 * (e.g. Open Library index) can omit this — the note writer will fall back
	 * to `Book.coverUrl` for reference-only storage.
	 */
	fetchCover?(isbn: string): Promise<ArrayBuffer | null>;
}

/**
 * Thrown by providers when a request fails in a way callers should distinguish.
 * Registry catches these in `fanout` and surfaces per-provider failures.
 */
export class ProviderError extends Error {
	constructor(
		public readonly providerId: string,
		public readonly code: HealthFailureCode,
		message: string,
		public readonly cause?: unknown,
	) {
		super(`[${providerId}] ${message}`);
		this.name = 'ProviderError';
	}
}
