import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type BookMetasearchPlugin from '../main';

/**
 * Plugin settings tab shown in Obsidian's settings modal.
 *
 * S1: TTB Key input · Provider priority display · Notes/cover folder inputs.
 * W2 additions: Aladin healthcheck button, docs link.
 * S2 additions: Kakao REST API Key, Google Books API Key.
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
					.setTooltip('aladin.co.kr/ttb')
					.onClick(() => {
						window.open('https://www.aladin.co.kr/ttb/wblogmain.aspx');
					}),
			);

		new Setting(containerEl)
			.setName('Aladin 연결 테스트')
			.setDesc('입력한 TTB Key로 검색 API가 정상 응답하는지 확인.')
			.addButton((btn) =>
				btn
					.setButtonText('Healthcheck 실행')
					.onClick(async () => {
						btn.setDisabled(true).setButtonText('확인 중…');
						try {
							const status = await this.plugin.aladin.healthcheck();
							if (status.ok) {
								new Notice('✅ Aladin OK');
							} else {
								const docs = status.docsUrl
									? `\n${status.docsUrl}`
									: '';
								new Notice(
									`❌ Aladin [${status.code}]\n${status.message}${docs}`,
									8000,
								);
							}
						} finally {
							btn.setDisabled(false).setButtonText(
								'Healthcheck 실행',
							);
						}
					}),
			);

		new Setting(containerEl)
			.setName('노트 저장 폴더')
			.setDesc('생성될 book note가 저장되는 볼트 폴더 경로.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.notesFolder)
					.onChange(async (value) => {
						this.plugin.settings.notesFolder =
							value.trim() || DEFAULT_NOTES_FOLDER;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('커버 이미지 폴더')
			.setDesc(
				'커버 이미지가 저장될 볼트 폴더 경로. S1은 URL만 저장하고 실제 다운로드는 S4부터.',
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.coverFolder)
					.onChange(async (value) => {
						this.plugin.settings.coverFolder =
							value.trim() || DEFAULT_COVER_FOLDER;
						await this.plugin.saveSettings();
					}),
			);

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

		new Setting(containerEl)
			.setName('Provider 우선순위')
			.setDesc('현재 활성 provider (읽기 전용). S1은 Aladin만 등록됩니다.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.priorityOrder.join(', '))
					.setDisabled(true),
			);
	}
}

const DEFAULT_NOTES_FOLDER = '85. References (Book Search)';
const DEFAULT_COVER_FOLDER = '80. References/Assets/Images';
