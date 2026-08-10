import { Editor, Notice, Plugin, TFile } from 'obsidian';

import type { Book, PriceQuote } from './apis/base';
import { AladinProvider } from './apis/aladin';
import { GoogleBooksProvider } from './apis/google-books';
import { KakaoProvider } from './apis/kakao';
import { OpenLibraryProvider } from './apis/openlibrary';
import { ProviderRegistry } from './apis/registry';
import {
	detectAnpigon,
	shouldShowMigrationBanner,
} from './migration/naver-detector';
import { BookMetasearchSettings, DEFAULT_SETTINGS } from './settings';
import { DuplicateModal } from './ui/duplicate-modal';
import type { DuplicateAction } from './ui/duplicate-modal';
import { IsbnInputModal } from './ui/isbn-input-modal';
import { MigrationModal } from './ui/migration-modal';
import { BookSearchModal } from './ui/search-modal';
import { BookMetasearchSettingTab } from './ui/settings-tab';
import { formatCitation } from './util/citation';
import { NoteWriter } from './writer/note-writer';
import { DuplicateBookError, VaultBookIndex } from './writer/vault-index';

/**
 * Book Metasearch — Obsidian plugin.
 *
 * Sprint S1 covers: BookProvider abstraction, Aladin search+lookup, search UI,
 * bongho-schema note writer, opt-in Naver EOL migration UX (Settings button),
 * and full command-palette parity with anpigon book-search.
 * Kakao / Google Books / Open Library land in S2.
 */
export default class BookMetasearchPlugin extends Plugin {
	settings!: BookMetasearchSettings;
	registry!: ProviderRegistry;
	aladin!: AladinProvider;
	kakao!: KakaoProvider;
	google!: GoogleBooksProvider;
	openLibrary!: OpenLibraryProvider;
	writer!: NoteWriter;
	vaultIndex!: VaultBookIndex;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registry = new ProviderRegistry();
		this.aladin = new AladinProvider(() => this.settings.aladinTtbKey);
		this.kakao = new KakaoProvider(() => this.settings.kakaoRestApiKey);
		this.google = new GoogleBooksProvider(() => this.settings.googleBooksApiKey);
		this.openLibrary = new OpenLibraryProvider();
		this.registry.register(this.aladin);
		this.registry.register(this.kakao);
		this.registry.register(this.google);
		this.registry.register(this.openLibrary);
		this.vaultIndex = new VaultBookIndex(this.app);
		this.writer = new NoteWriter(this.app, this.settings, this.vaultIndex);

		this.addSettingTab(new BookMetasearchSettingTab(this.app, this));

		this.addCommand({
			id: 'add-book',
			name: 'Search books',
			callback: () => this.openSearchModal(),
		});

		this.addCommand({
			id: 'search-by-isbn',
			name: 'Search books by ISBN',
			callback: () => this.openIsbnSearch(),
		});

		this.addCommand({
			id: 'search-from-current-note',
			name: 'Search books based on current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) this.openSearchFromCurrentNote(file);
				return true;
			},
		});

		this.addCommand({
			id: 'update-current-note',
			name: 'Update book info in current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.updateCurrentNote(file);
				return true;
			},
		});

		this.addCommand({
			id: 'open-naver-migration',
			name: 'Open Naver → Aladin migration helper',
			callback: () => this.openMigrationHelper(),
		});

		this.addCommand({
			id: 'insert-citation',
			name: 'Insert book citation at cursor',
			editorCallback: (editor: Editor) => {
				this.openCitationModal(editor);
			},
		});

		this.addCommand({
			id: 'check-used-price',
			name: 'Check used-book price (Aladin)',
			checkCallback: (checking) => {
				if (!this.settings.priceCheckEnabled) return false;
				const file = this.app.workspace.getActiveFile();
				if (!file || !this.isBookNote(file)) return false;
				if (!checking) void this.checkUsedPrice(file);
				return true;
			},
		});

		for (const [id, label, status] of [
			['mark-as-wishlist', 'Mark book as wishlist', 'wishlist'],
			['mark-as-reading', 'Mark book as reading', 'reading'],
			['mark-as-read', 'Mark book as read', 'read'],
		] as const) {
			this.addCommand({
				id,
				name: label,
				checkCallback: (checking) => {
					if (!this.settings.readingStatusEnabled) return false;
					const file = this.app.workspace.getActiveFile();
					if (!file || !this.isBookNote(file)) return false;
					if (!checking) void this.markStatus(file, status);
					return true;
				},
			});
		}

		this.app.workspace.onLayoutReady(() => {
			this.vaultIndex.build();
			for (const ref of this.vaultIndex.registerEvents()) {
				this.registerEvent(ref);
			}
			void this.maybeShowMigrationBanner();
		});
	}

	/**
	 * Route a create() call through the duplicate-detection UX. When ISBN
	 * matches an existing note, honor `settings.duplicateAction`; otherwise
	 * just create the note and open it. Callers pass an optional Notice
	 * prefix so ISBN-search and full-search paths surface distinct messages.
	 */
	private async createOrHandleDuplicate(book: Book): Promise<void> {
		try {
			const file = await this.writer.create(book);
			if (this.settings.openNoteAfterCreate) {
				await this.app.workspace.getLeaf().openFile(file);
			}
			new Notice(`노트 생성: ${file.path}`);
		} catch (e) {
			if (e instanceof DuplicateBookError) {
				await this.resolveDuplicate(book, e);
				return;
			}
			throw e;
		}
	}

	private async resolveDuplicate(
		book: Book,
		err: DuplicateBookError,
	): Promise<void> {
		const decide = (action: DuplicateAction) => this.applyDuplicateAction(action, book, err.existing);
		switch (this.settings.duplicateAction) {
			case 'open':
				await decide('open');
				return;
			case 'update':
				await decide('update');
				return;
			case 'error':
				new Notice(`이미 존재: ${err.existing.path}`, 8000);
				return;
			case 'ask':
			default:
				new DuplicateModal(this.app, err.existing, book, (action) => {
					void decide(action);
				}).open();
				return;
		}
	}

	private async applyDuplicateAction(
		action: DuplicateAction,
		book: Book,
		existing: TFile,
	): Promise<void> {
		switch (action) {
			case 'open':
				await this.app.workspace.getLeaf().openFile(existing);
				new Notice(`기존 노트 열림: ${existing.path}`);
				return;
			case 'update':
				await this.writer.update(existing, book);
				await this.app.workspace.getLeaf().openFile(existing);
				new Notice(`기존 노트 업데이트: ${existing.path}`);
				return;
			case 'create': {
				// Second-edition or intentional-duplicate escape hatch: skip the
				// ISBN dedup and rely only on path uniqueness.
				const withoutIsbn: Book = { ...book, isbn10: undefined, isbn13: undefined };
				const file = await this.writer.create(withoutIsbn);
				if (this.settings.openNoteAfterCreate) {
					await this.app.workspace.getLeaf().openFile(file);
				}
				new Notice(`중복 무시하고 새 노트 생성: ${file.path}`);
				return;
			}
			case 'cancel':
				return;
		}
	}

	/**
	 * On first load after Naver EOL, surface a one-line Notice pointing to the
	 * migration helper. Suppressed once the user completes or dismisses it.
	 */
	private async maybeShowMigrationBanner(): Promise<void> {
		const anpigon = await detectAnpigon(this.app);
		if (!shouldShowMigrationBanner(anpigon, this.settings)) return;
		new Notice(
			'Book Metasearch: 네이버 도서 API 종료 감지 — Settings → Tools → 이전 도구에서 Aladin으로 전환하세요.',
			10000,
		);
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<BookMetasearchSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** True when the note looks like a plugin-owned book note. */
	private isBookNote(file: TFile): boolean {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return false;
		if (fm['type'] !== 'reference') return false;
		const tags: unknown = fm['tags'];
		if (Array.isArray(tags)) return tags.includes('book');
		if (typeof tags === 'string') return tags.split(/[\s,]+/).includes('book');
		return false;
	}

	private async markStatus(
		file: TFile,
		status: 'wishlist' | 'reading' | 'read',
	): Promise<void> {
		try {
			await this.writer.setStatus(file, status);
			new Notice(`상태 변경: ${status}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`상태 변경 실패: ${msg}`);
		}
	}

	private async checkUsedPrice(file: TFile): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw: unknown = fm?.['isbn'];
		if (typeof raw !== 'string' || !raw.trim()) {
			new Notice('현재 노트에 isbn 필드가 없습니다.');
			return;
		}
		try {
			const quotes = await this.aladin.searchUsedPrices(raw);
			if (quotes.length === 0) {
				new Notice('중고 매물 없음');
				return;
			}
			await this.reportPriceQuotes(file, quotes);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`중고가 조회 실패: ${msg}`);
		}
	}

	private async reportPriceQuotes(
		file: TFile,
		quotes: PriceQuote[],
	): Promise<void> {
		const sorted = [...quotes].sort(
			(a, b) => (a.priceKrw ?? Infinity) - (b.priceKrw ?? Infinity),
		);
		const lowest = sorted[0];
		if (!lowest) return;
		const summary = `Aladin 중고 최저가: ₩${(lowest.priceKrw ?? 0).toLocaleString()} (${lowest.condition})`;

		if (this.settings.priceOutputMode === 'notice-only') {
			new Notice(summary, 8000);
			return;
		}
		// 'section' — append a timestamped row to the note body. Header is
		// only inserted the first time; subsequent checks append rows only.
		const rows = sorted.map((q) => {
			const price = (q.priceKrw ?? 0).toLocaleString();
			const link = q.link ? ` — [보기](${q.link})` : '';
			return `- ${q.fetchedAt.slice(0, 10)} · ${q.provider} · ${q.condition} · ₩${price}${link}`;
		});
		// process() reads and writes atomically. A read-then-modify pair would
		// drop anything the user typed while the price lookup was in flight,
		// and a network round-trip is plenty of time for that.
		await this.app.vault.process(file, (body) => {
			const separator = body.endsWith('\n') ? '' : '\n';
			const prelude = /^## Price Watch$/m.test(body)
				? '\n'
				: '\n## Price Watch\n\n';
			return body + separator + prelude + rows.join('\n') + '\n';
		});
		new Notice(summary + ' (노트 하단 Price Watch에 추가됨)', 6000);
	}

	/**
	 * Search-driven citation insertion. Reuses `BookSearchModal` but the pick
	 * callback resolves to an existing vault note (if any) and emits a
	 * wikilink at the current cursor instead of creating a new note.
	 *
	 * `citationOnMissing` decides the fallback when no matching note exists:
	 *   - insert-only : just emit the unresolved wikilink (default, snappy)
	 *   - create-note : create a note via NoteWriter, then link
	 *   - prompt      : ask via Notice+confirm (kept minimal — future modal)
	 */
	openCitationModal(editor: Editor): void {
		new BookSearchModal(
			this.app,
			this.registry,
			this.settings,
			async (book) => {
				const existing = this.vaultIndex.findByIsbn(
					book.isbn13 ?? book.isbn10,
				);
				let targetTitle: string | undefined;
				if (existing) {
					targetTitle = existing.basename;
				} else if (this.settings.citationOnMissing === 'create-note') {
					try {
						const file = await this.writer.create(book);
						targetTitle = file.basename;
					} catch (e) {
						if (!(e instanceof DuplicateBookError)) throw e;
						targetTitle = e.existing.basename;
					}
				}
				const citation = formatCitation(
					book,
					this.settings.citationStyle,
					targetTitle,
				);
				editor.replaceSelection(citation);
			},
		).open();
	}

	openSearchModal(initialQuery = ''): void {
		new BookSearchModal(
			this.app,
			this.registry,
			this.settings,
			async (book) => {
				await this.createOrHandleDuplicate(book);
			},
			initialQuery,
		).open();
	}

	openIsbnSearch(): void {
		new IsbnInputModal(this.app, async (isbn) => {
			try {
				const book = await this.registry.searchByISBN(
					isbn,
					this.settings.priorityOrder,
				);
				if (!book) {
					new Notice(`ISBN ${isbn} 결과 없음`);
					return;
				}
				await this.createOrHandleDuplicate(book);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				new Notice(`ISBN 검색 실패: ${msg}`);
			}
		}).open();
	}

	openSearchFromCurrentNote(file: TFile): void {
		const query = this.extractQueryFromNote(file);
		if (!query) {
			new Notice('현재 노트에서 검색어를 추출할 수 없습니다.');
			return;
		}
		this.openSearchModal(query);
	}

	async updateCurrentNote(file: TFile): Promise<void> {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter ?? {};
			const isbn: string | undefined =
				typeof fm.isbn === 'string' ? fm.isbn.replace(/[^0-9Xx]/g, '') : undefined;
			const title: string | undefined =
				typeof fm.title === 'string' ? fm.title : file.basename;

			let book = null;
			if (isbn && (isbn.length === 10 || isbn.length === 13)) {
				book = await this.registry.searchByISBN(
					isbn,
					this.settings.priorityOrder,
				);
			}
			if (!book && title) {
				const results = await this.registry.sequential(
					title,
					{
						maxResults: 1,
						locale: this.settings.localePreference,
					},
					this.settings.priorityOrder,
				);
				book = results[0] ?? null;
			}
			if (!book) {
				new Notice('업데이트할 결과를 찾을 수 없습니다.');
				return;
			}
			await this.writer.update(file, book);
			new Notice(`노트 업데이트 완료: ${file.path}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`업데이트 실패: ${msg}`);
		}
	}

	/**
	 * Extract a search query from the active note. Preference order:
	 *   frontmatter.title → filename (stripped of trailing ' - author').
	 */
	private extractQueryFromNote(file: TFile): string {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && typeof fm.title === 'string' && fm.title.trim()) {
			return fm.title.trim();
		}
		// 파일명에서 " - 저자" 부분 제거
		return file.basename.replace(/\s-\s[^-]+$/, '').trim();
	}

	async openMigrationHelper(): Promise<void> {
		const anpigon = (await detectAnpigon(this.app)) ?? {};
		new MigrationModal(this.app, {
			settings: this.settings,
			saveSettings: () => this.saveSettings(),
			aladin: this.aladin,
			anpigon,
		}).open();
	}
}
