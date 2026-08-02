import type { Book, BookProvider, SearchOptions } from './base';

/**
 * Result of a single provider's contribution to a fanout search.
 *
 * `books` is empty when the provider returned no results OR failed.
 * `error` is set only on failure (kept as string for JSON serialization).
 */
export interface ProviderResult {
	providerId: string;
	books: Book[];
	error?: string;
}

/**
 * Manages registered providers and coordinates search strategies.
 *
 * S1 uses `sequential` (single Aladin provider). S2+ activates `fanout` when
 * Kakao, Google Books, Open Library join. Both strategies are already implemented
 * so provider addition in S2 is code-diff-free.
 */
export class ProviderRegistry {
	private readonly providers = new Map<string, BookProvider>();

	/** Add or replace a provider. `provider.id` is the map key. */
	register(provider: BookProvider): void {
		this.providers.set(provider.id, provider);
	}

	/** Remove a provider. No-op if not registered. */
	unregister(id: string): void {
		this.providers.delete(id);
	}

	/** Retrieve a provider by id. */
	get(id: string): BookProvider | undefined {
		return this.providers.get(id);
	}

	/** All registered providers, insertion order preserved. */
	list(): BookProvider[] {
		return [...this.providers.values()];
	}

	/** Providers with configured auth, in the given priority order. */
	private resolveOrdered(order: string[]): BookProvider[] {
		const seen = new Set<string>();
		const out: BookProvider[] = [];
		for (const id of order) {
			if (seen.has(id)) continue;
			const p = this.providers.get(id);
			if (p) {
				out.push(p);
				seen.add(id);
			}
		}
		// Append any providers not mentioned in order (S1 defensive default).
		for (const p of this.providers.values()) {
			if (!seen.has(p.id)) out.push(p);
		}
		return out;
	}

	/**
	 * Parallel fanout — every provider is queried simultaneously; each result
	 * (or failure) is returned independently. Callers decide how to merge or
	 * dedupe (e.g. by ISBN13). Never rejects — failures land in `error`.
	 *
	 * Used from S2 onward when 4 providers coexist.
	 */
	async fanout(
		query: string,
		opts: SearchOptions,
		order: string[],
	): Promise<ProviderResult[]> {
		const targets = this.resolveOrdered(order);
		return Promise.all(
			targets.map(async (p): Promise<ProviderResult> => {
				try {
					const books = await p.searchByQuery(query, opts);
					return { providerId: p.id, books };
				} catch (e) {
					return {
						providerId: p.id,
						books: [],
						error: e instanceof Error ? e.message : String(e),
					};
				}
			}),
		);
	}

	/**
	 * Sequential fallback — try providers in order, return the first non-empty
	 * result. Used in S1 with just Aladin registered.
	 *
	 * Silent per-provider failures move to the next provider; only the overall
	 * loop completing empty returns an empty array.
	 */
	async sequential(
		query: string,
		opts: SearchOptions,
		order: string[],
	): Promise<Book[]> {
		const targets = this.resolveOrdered(order);
		for (const p of targets) {
			try {
				const books = await p.searchByQuery(query, opts);
				if (books.length > 0) return books;
			} catch (e) {
				console.warn(`[book-metasearch] ${p.id} failed, trying next`, e);
			}
		}
		return [];
	}
}
