import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type BookMetasearchPlugin from '../main';

const TTB_ISSUE_URL = 'https://www.aladin.co.kr/ttb/wblog_manage.aspx';

/**
 * Plugin settings tab shown in Obsidian's settings modal.
 *
 * Grouped sections:
 *   1. Providers   — TTB Key input + healthcheck (S1)
 *   2. Notes       — folder + filename format + on-create behavior
 *   3. Covers      — cover folder + save toggle
 *   4. Search UI   — cover thumbnails, upcoming provider config (stubs)
 *   5. Attribution — Aladin credit link toggle
 *   6. Tools       — Naver EOL migration helper (opt-in)
 */
export class BookMetasearchSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: BookMetasearchPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Book Metasearch' });
		containerEl.createEl('p', {
			text:
				'Metasearch across Aladin, Kakao, Google Books, and Open Library. ' +
				'Sprint S1 in progress — only Aladin is wired up so far.',
			cls: 'setting-item-description',
		});

		// ── 1. Providers ─────────────────────────────
		containerEl.createEl('h3', { text: 'Providers' });

		new Setting(containerEl)
			.setName('Aladin TTB Key')
			.setDesc('알라딘 오픈 API 키. 발급 페이지에서 무료로 받을 수 있습니다.')
			.addText((text) =>
				text
					.setPlaceholder('ttbXXXXXXXXX')
					.setValue(this.plugin.settings.aladinTtbKey)
					.onChange(async (value) => {
						this.plugin.settings.aladinTtbKey = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('발급 페이지 열기')
					.setTooltip(TTB_ISSUE_URL)
					.onClick(() => {
						window.open(TTB_ISSUE_URL);
					}),
			);

		new Setting(containerEl)
			.setName('Aladin 연결 테스트')
			.setDesc('입력한 TTB Key로 검색 API가 정상 응답하는지 확인.')
			.addButton((btn) =>
				btn.setButtonText('Healthcheck 실행').onClick(async () => {
					btn.setDisabled(true).setButtonText('확인 중…');
					try {
						const status = await this.plugin.aladin.healthcheck();
						if (status.ok) {
							new Notice('✅ Aladin OK');
						} else {
							const docs = status.docsUrl ? `\n${status.docsUrl}` : '';
							new Notice(
								`❌ Aladin [${status.code}]\n${status.message}${docs}`,
								8000,
							);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);

		new Setting(containerEl)
			.setName('Provider 우선순위')
			.setDesc('현재 활성 provider (읽기 전용). S1은 Aladin만 등록됩니다.')
			.addText((text) =>
				text.setValue(this.plugin.settings.priorityOrder.join(', ')).setDisabled(true),
			);

		// ── 2. Notes ─────────────────────────────────
		containerEl.createEl('h3', { text: 'Notes' });

		new Setting(containerEl)
			.setName('노트 저장 폴더')
			.setDesc('생성될 book note가 저장되는 볼트 폴더 경로.')
			.addText((text) =>
				text
					.setPlaceholder('85. References (Book Search)')
					.setValue(this.plugin.settings.notesFolder)
					.onChange(async (value) => {
						this.plugin.settings.notesFolder =
							value.trim() || '85. References (Book Search)';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('파일명 포맷')
			.setDesc(
				'사용 가능한 변수: {{title}}, {{subtitle}}, {{author}}, {{publisher}}, {{publishYear}}, {{isbn}}. ' +
					'특수문자는 자동으로 정제됩니다.',
			)
			.addText((text) =>
				text
					.setPlaceholder('{{title}} - {{author}}')
					.setValue(this.plugin.settings.fileNameFormat)
					.onChange(async (value) => {
						this.plugin.settings.fileNameFormat =
							value.trim() || '{{title}} - {{author}}';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('노트 생성 후 자동 열기')
			.setDesc('검색 결과 선택 시 새 탭에서 노트를 즉시 엽니다.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openNoteAfterCreate)
					.onChange(async (value) => {
						this.plugin.settings.openNoteAfterCreate = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 3. Covers ────────────────────────────────
		containerEl.createEl('h3', { text: 'Covers' });

		new Setting(containerEl)
			.setName('커버 이미지 폴더')
			.setDesc('로컬로 저장할 커버 이미지의 볼트 폴더 경로.')
			.addText((text) =>
				text
					.setPlaceholder('80. References/Assets/Images')
					.setValue(this.plugin.settings.coverFolder)
					.onChange(async (value) => {
						this.plugin.settings.coverFolder =
							value.trim() || '80. References/Assets/Images';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('커버 이미지 로컬 저장')
			.setDesc(
				'노트 생성 시 커버 이미지를 볼트에 다운로드합니다. ' +
					'⚠️ S1은 URL만 저장 — 실제 다운로드는 S4에서 활성화됩니다.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCoverImageSave)
					.onChange(async (value) => {
						this.plugin.settings.enableCoverImageSave = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 4. Search UI ─────────────────────────────
		containerEl.createEl('h3', { text: 'Search UI' });

		new Setting(containerEl)
			.setName('검색 결과에 커버 이미지 표시')
			.setDesc('SuggestModal 항목에 커버 썸네일을 렌더링. ⚠️ S2에서 활성화됩니다.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCoverInSearch)
					.onChange(async (value) => {
						this.plugin.settings.showCoverInSearch = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 5. Attribution ───────────────────────────
		containerEl.createEl('h3', { text: 'Attribution' });

		new Setting(containerEl)
			.setName('Aladin 크레딧 링크 삽입')
			.setDesc(
				'생성된 노트 하단에 "Book DB by Aladin" 링크 삽입. 알라딘 이용약관에 따라 켜두시길 권장합니다.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.aladinCreditEnabled)
					.onChange(async (value) => {
						this.plugin.settings.aladinCreditEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 6. Tools ─────────────────────────────────
		containerEl.createEl('h3', { text: 'Tools' });

		new Setting(containerEl)
			.setName('Naver → Aladin 이전 도구')
			.setDesc(
				'anpigon obsidian-book-search-plugin 사용자가 Naver 도서 API 종료(2026-08-01) 이후 ' +
					'Aladin으로 이전하는 것을 도와줍니다. anpigon 미설치여도 TTB Key 등록용으로 사용 가능.',
			)
			.addButton((btn) =>
				btn.setButtonText('이전 도구 열기').onClick(() => {
					void this.plugin.openMigrationHelper();
				}),
			);
	}
}
