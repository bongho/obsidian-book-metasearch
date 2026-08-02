import { Notice, Plugin, TFile } from 'obsidian';

import { AladinProvider } from './apis/aladin';
import { GoogleBooksProvider } from './apis/google-books';
import { KakaoProvider } from './apis/kakao';
import { OpenLibraryProvider } from './apis/openlibrary';
import { ProviderRegistry } from './apis/registry';
import { detectAnpigon } from './migration/naver-detector';
import { BookMetasearchSettings, DEFAULT_SETTINGS } from './settings';
import { IsbnInputModal } from './ui/isbn-input-modal';
import { MigrationModal } from './ui/migration-modal';
import { BookSearchModal } from './ui/search-modal';
import { BookMetasearchSettingTab } from './ui/settings-tab';
import { NoteWriter } from './writer/note-writer';

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
		this.writer = new NoteWriter(this.app, this.settings);

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

	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<BookMetasearchSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	openSearchModal(initialQuery = ''): void {
		new BookSearchModal(
			this.app,
			this.registry,
			this.settings,
			async (book) => {
				const file = await this.writer.create(book);
				if (this.settings.openNoteAfterCreate) {
					await this.app.workspace.getLeaf().openFile(file);
				}
				new Notice(`노트 생성: ${file.path}`);
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
				const file = await this.writer.create(book);
				if (this.settings.openNoteAfterCreate) {
					await this.app.workspace.getLeaf().openFile(file);
				}
				new Notice(`노트 생성: ${file.path}`);
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
