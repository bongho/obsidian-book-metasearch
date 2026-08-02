import { App, Notice, SuggestModal } from 'obsidian';

import type { Book, SearchOptions } from '../apis/base';
import type { ProviderRegistry } from '../apis/registry';

/**
 * Callback fired when a user picks a search result. Wired to `NoteWriter` in W3.
 */
export type BookPickHandler = (book: Book) => void | Promise<void>;

/**
 * Debounced fuzzy search modal — one query at a time, 200ms coalesce, in-memory
 * cache keyed by exact query string.
 *
 * S1: single provider (Aladin) via `registry.sequential`. S2 switches to
 * `registry.fanout` when Kakao / Google / OL join.
 */
export class BookSearchModal extends SuggestModal<Book> {
	private readonly cache = new Map<string, Book[]>();
	private pendingTimer: number | null = null;
	private inflightQuery = '';

	constructor(
		app: App,
		private readonly registry: ProviderRegistry,
		private readonly priorityOrder: string[],
		private readonly onPick: BookPickHandler,
	) {
		super(app);
		this.setPlaceholder('책 제목 또는 저자를 입력하세요 (Aladin)');
		this.setInstructions([
			{ command: '↑↓', purpose: '이동' },
			{ command: '↵', purpose: '노트 생성' },
			{ command: 'esc', purpose: '취소' },
		]);
	}

	async getSuggestions(query: string): Promise<Book[]> {
		const trimmed = query.trim();
		if (trimmed.length < 2) return [];

		const cached = this.cache.get(trimmed);
		if (cached) return cached;

		// Debounce — collapse rapid keystrokes to a single network call.
		await this.debounce(200);
		// If user typed more in the meantime, drop this callback silently.
		if (this.inflightQuery !== trimmed) return [];

		this.inflightQuery = trimmed;
		try {
			const opts: SearchOptions = { maxResults: 20, locale: 'ko' };
			const books = await this.registry.sequential(
				trimmed,
				opts,
				this.priorityOrder,
			);
			this.cache.set(trimmed, books);
			return books;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`검색 실패: ${msg}`);
			return [];
		}
	}

	renderSuggestion(book: Book, el: HTMLElement): void {
		el.addClass('bm-suggestion');

		const titleLine = el.createDiv({ cls: 'bm-title' });
		titleLine.setText(book.title);
		if (book.subtitle) {
			titleLine.createEl('span', {
				text: ` — ${book.subtitle}`,
				cls: 'bm-subtitle',
			});
		}

		const meta = el.createDiv({ cls: 'bm-meta' });
		const parts = [
			book.authors.join(', '),
			book.publisher,
			book.publishYear,
		].filter(Boolean);
		meta.setText(parts.join(' · '));

		if (book.isbn13) {
			el.createDiv({ text: `ISBN ${book.isbn13}`, cls: 'bm-isbn' });
		}
	}

	async onChooseSuggestion(book: Book): Promise<void> {
		try {
			await this.onPick(book);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`노트 생성 실패: ${msg}`);
		}
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
