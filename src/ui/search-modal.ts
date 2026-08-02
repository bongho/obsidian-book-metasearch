import { App, Notice, SuggestModal } from 'obsidian';

import type { Book, SearchOptions } from '../apis/base';
import type { ProviderRegistry } from '../apis/registry';
import type { BookMetasearchSettings } from '../settings';

export type BookPickHandler = (book: Book) => void | Promise<void>;

/**
 * Debounced fuzzy search modal — one query at a time, 200ms coalesce, in-memory
 * cache keyed by exact query string.
 *
 * S2: honors `settings.searchStrategy` ('sequential' vs 'fanout') and
 * `settings.showCoverInSearch` for thumbnails.
 */
export class BookSearchModal extends SuggestModal<Book> {
	private readonly cache = new Map<string, Book[]>();
	private pendingTimer: number | null = null;
	private inflightQuery = '';

	constructor(
		app: App,
		private readonly registry: ProviderRegistry,
		private readonly settings: BookMetasearchSettings,
		private readonly onPick: BookPickHandler,
		private readonly initialQuery: string = '',
	) {
		super(app);
		this.setPlaceholder('책 제목 또는 저자를 입력하세요');
		this.setInstructions([
			{ command: '↑↓', purpose: '이동' },
			{ command: '↵', purpose: '노트 생성' },
			{ command: 'esc', purpose: '취소' },
		]);
	}

	onOpen(): void {
		void super.onOpen();
		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.inputEl.dispatchEvent(new Event('input'));
		}
	}

	async getSuggestions(query: string): Promise<Book[]> {
		const trimmed = query.trim();
		if (trimmed.length < 2) return [];

		const cached = this.cache.get(trimmed);
		if (cached) return cached;

		this.inflightQuery = trimmed;
		await this.debounce(200);
		if (this.inflightQuery !== trimmed) return [];

		try {
			const opts: SearchOptions = {
				maxResults: 20,
				locale: this.settings.localePreference,
			};

			let books: Book[];
			if (this.settings.searchStrategy === 'fanout') {
				const results = await this.registry.fanout(
					trimmed,
					opts,
					this.settings.priorityOrder,
				);
				books = dedupeByIsbn(results.flatMap((r) => r.books));
			} else {
				books = await this.registry.sequential(
					trimmed,
					opts,
					this.settings.priorityOrder,
				);
			}
			this.cache.set(trimmed, books);
			return books;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[book-metasearch] search failed', e);
			new Notice(`검색 실패: ${msg}`);
			return [];
		}
	}

	renderSuggestion(book: Book, el: HTMLElement): void {
		el.addClass('bm-suggestion');

		if (this.settings.showCoverInSearch && book.coverUrl) {
			const img = el.createEl('img', { cls: 'bm-cover' });
			img.src = book.coverUrl;
			img.alt = '';
			img.loading = 'lazy';
		}

		const body = el.createDiv({ cls: 'bm-body' });

		const titleLine = body.createDiv({ cls: 'bm-title' });
		titleLine.setText(book.title);
		if (book.subtitle) {
			titleLine.createSpan({
				text: ` — ${book.subtitle}`,
				cls: 'bm-subtitle',
			});
		}

		const meta = body.createDiv({ cls: 'bm-meta' });
		const parts = [
			book.authors.join(', '),
			book.publisher,
			book.publishYear,
			book.provider,
		].filter(Boolean);
		meta.setText(parts.join(' · '));

		if (book.isbn13) {
			body.createDiv({ text: `ISBN ${book.isbn13}`, cls: 'bm-isbn' });
		}
	}

	onChooseSuggestion(book: Book): void {
		void (async () => {
			try {
				await this.onPick(book);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				new Notice(`노트 생성 실패: ${msg}`);
			}
		})();
	}

	onClose(): void {
		if (this.pendingTimer !== null) {
			window.clearTimeout(this.pendingTimer);
			this.pendingTimer = null;
		}
		super.onClose();
	}

	private debounce(ms: number): Promise<void> {
		return new Promise((resolve) => {
			if (this.pendingTimer !== null) {
				window.clearTimeout(this.pendingTimer);
			}
			this.pendingTimer = window.setTimeout(() => {
				this.pendingTimer = null;
				resolve();
			}, ms);
		});
	}
}

/**
 * Fanout results often contain the same edition from multiple providers.
 * Prefer ISBN13 as the identity key; fall back to `<title>|<first author>`
 * when ISBN is missing. First occurrence wins — priorityOrder governs which
 * provider surfaces first.
 */
function dedupeByIsbn(books: readonly Book[]): Book[] {
	const seen = new Set<string>();
	const out: Book[] = [];
	for (const b of books) {
		const key = b.isbn13 || `${b.title.toLowerCase()}|${(b.authors[0] ?? '').toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(b);
	}
	return out;
}
