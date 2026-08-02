import { Notice, Plugin } from 'obsidian';

import { AladinProvider } from './apis/aladin';
import { ProviderRegistry } from './apis/registry';
import { detectAnpigon } from './migration/naver-detector';
import { BookMetasearchSettings, DEFAULT_SETTINGS } from './settings';
import { MigrationModal } from './ui/migration-modal';
import { BookSearchModal } from './ui/search-modal';
import { BookMetasearchSettingTab } from './ui/settings-tab';
import { NoteWriter } from './writer/note-writer';

/**
 * Book Metasearch — Obsidian plugin.
 *
 * Sprint S1 covers: BookProvider abstraction, Aladin search+lookup, search UI,
 * bongho-schema note writer, opt-in Naver EOL migration UX (Settings button).
 * Kakao / Google Books / Open Library land in S2.
 */
export default class BookMetasearchPlugin extends Plugin {
	settings!: BookMetasearchSettings;
	registry!: ProviderRegistry;
	aladin!: AladinProvider;
	writer!: NoteWriter;

	async onload(): Promise<void> {
		console.log('[book-metasearch] loading v' + this.manifest.version);
		await this.loadSettings();

		this.registry = new ProviderRegistry();
		this.aladin = new AladinProvider(() => this.settings.aladinTtbKey);
		this.registry.register(this.aladin);
		this.writer = new NoteWriter(this.app, this.settings);

		this.addSettingTab(new BookMetasearchSettingTab(this.app, this));

		this.addCommand({
			id: 'add-book',
			name: 'Add book',
			callback: () => this.openSearchModal(),
		});

		this.addCommand({
			id: 'open-naver-migration',
			name: 'Open Naver → Aladin migration helper',
			callback: () => this.openMigrationHelper(),
		});

		console.log('[book-metasearch] loaded');
	}

	onunload(): void {
		console.log('[book-metasearch] unloaded');
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<BookMetasearchSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	openSearchModal(): void {
		new BookSearchModal(
			this.app,
			this.registry,
			this.settings.priorityOrder,
			async (book) => {
				const file = await this.writer.create(book);
				if (this.settings.openNoteAfterCreate) {
					await this.app.workspace.getLeaf().openFile(file);
				}
				new Notice(`노트 생성: ${file.path}`);
			},
		).open();
	}

	/**
	 * On-demand migration helper. Invoked from Settings tab or command palette
	 * — never auto-triggered on load. If anpigon is not installed, we still
	 * open the modal with an empty snapshot so users can register a TTB Key.
	 */
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
