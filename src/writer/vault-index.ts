import type { App, EventRef, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';

import { isRealIsbn10, isRealIsbn13, splitIsbnPair } from '../util/isbn';

/**
 * In-memory index of book notes in the vault, keyed by ISBN10 / ISBN13.
 *
 * Purpose: `NoteWriter.create()` checks this index before writing so we can
 * surface a "you already have this book" UX instead of silently creating a
 * near-duplicate under a slightly different filename.
 *
 * Only notes whose frontmatter has `type: reference` AND some form of ISBN
 * are indexed — anything else is ignored (foreign-key contract with the
 * plugin's own `renderDefaultFrontmatter`). We also index ISBN10 alone
 * because Kakao returns a space-joined pair and older bongho notes may
 * carry only one of the two.
 *
 * Lifecycle:
 *   1. `plugin.onload()` constructs the index and defers `build()` until
 *      workspace layout is ready (avoid blocking startup on 5k+ note vaults).
 *   2. `metadataCache.on('changed')` triggers incremental refresh per file.
 *   3. `vault.on('delete')` and `vault.on('rename')` keep the map consistent.
 *   4. Callers that need the index BEFORE `build()` completes get an empty
 *      result — the sync-fallback discipline of scanning again is a future
 *      optimization we haven't needed yet.
 */
export class VaultBookIndex {
	private byIsbn13 = new Map<string, TFile>();
	private byIsbn10 = new Map<string, TFile>();
	private built = false;
	private eventRefs: EventRef[] = [];

	constructor(private readonly app: App) {}

	isReady(): boolean {
		return this.built;
	}

	findByIsbn(isbn: string | undefined | null): TFile | null {
		if (!isbn) return null;
		const trimmed = isbn.trim();
		if (!trimmed) return null;
		// Frontmatter carries space-joined pairs like "9788934985068 8934985062"
		// — split those BEFORE the strip-non-digit step, otherwise the pair
		// concatenates into a 22-char blob that matches neither regex.
		if (/\s/.test(trimmed)) {
			const pair = splitIsbnPair(trimmed);
			if (pair.isbn13) return this.byIsbn13.get(pair.isbn13) ?? null;
			if (pair.isbn10) return this.byIsbn10.get(pair.isbn10) ?? null;
			return null;
		}
		const clean = trimmed.replace(/[^0-9Xx]/g, '');
		if (isRealIsbn13(clean)) return this.byIsbn13.get(clean) ?? null;
		if (isRealIsbn10(clean)) return this.byIsbn10.get(clean) ?? null;
		return null;
	}

	/**
	 * Scan every markdown file's frontmatter cache and populate the maps.
	 * Idempotent — clears prior state first so it can be called again after
	 * settings changes affecting which notes are considered book notes.
	 */
	build(): void {
		this.byIsbn13.clear();
		this.byIsbn10.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.indexOne(file);
		}
		this.built = true;
	}

	private indexOne(file: TFile): void {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm) return;
		if (fm['type'] !== 'reference') return;
		const raw: unknown = fm['isbn'];
		if (typeof raw !== 'string' || !raw.trim()) return;
		const { isbn10, isbn13 } = splitIsbnPair(raw);
		if (isbn13) this.byIsbn13.set(isbn13, file);
		if (isbn10) this.byIsbn10.set(isbn10, file);
	}

	private removeOne(file: TFile): void {
		for (const [k, v] of this.byIsbn13) {
			if (v === file) this.byIsbn13.delete(k);
		}
		for (const [k, v] of this.byIsbn10) {
			if (v === file) this.byIsbn10.delete(k);
		}
	}

	/**
	 * Wire the metadata-cache and vault event listeners. Caller (main.ts)
	 * should push the returned refs to `plugin.registerEvent(...)` so they
	 * unregister when the plugin unloads.
	 */
	registerEvents(): EventRef[] {
		this.eventRefs = [
			this.app.metadataCache.on('changed', (file: TFile) => {
				this.removeOne(file);
				this.indexOne(file);
			}),
			this.app.vault.on('delete', (file: TAbstractFile) => {
				if (file instanceof TFile) this.removeOne(file);
			}),
			this.app.vault.on('rename', (file: TAbstractFile) => {
				// TFile instance is preserved across rename in Obsidian's model,
				// so the map's file references remain valid; we only need to
				// re-scan in case rename accompanied a frontmatter change.
				if (file instanceof TFile) {
					this.removeOne(file);
					this.indexOne(file);
				}
			}),
		];
		return this.eventRefs;
	}
}

/**
 * Thrown by `NoteWriter.create()` when the incoming Book matches an existing
 * note by ISBN. Callers catch this to open a `DuplicateModal` instead of
 * treating it as a generic failure.
 */
export class DuplicateBookError extends Error {
	constructor(
		public readonly existing: TFile,
		public readonly isbnKey: string,
	) {
		super(`Duplicate by ISBN: ${existing.path} (${isbnKey})`);
		this.name = 'DuplicateBookError';
	}
}
