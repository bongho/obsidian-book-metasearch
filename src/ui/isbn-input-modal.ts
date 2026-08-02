import { App, Modal, Notice, Setting } from 'obsidian';

/**
 * Modal that prompts for an ISBN (10 or 13) and invokes a callback with the
 * cleaned digits. Used by the "Search books by ISBN" command.
 */
export class IsbnInputModal extends Modal {
	private value = '';

	constructor(
		app: App,
		private readonly onSubmit: (isbn: string) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Search books by ISBN' });

		new Setting(contentEl)
			.setName('ISBN')
			.setDesc('ISBN10 또는 ISBN13 입력. 하이픈·공백은 자동으로 제거됩니다.')
			.addText((text) =>
				text
					.setPlaceholder('9788912345678')
					.onChange((v) => {
						this.value = v;
					}),
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('취소').onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText('검색')
					.setCta()
					.onClick(async () => {
						const cleaned = this.value.replace(/[^0-9Xx]/g, '');
						if (cleaned.length !== 10 && cleaned.length !== 13) {
							new Notice(
								'ISBN은 10자리 또는 13자리 숫자여야 합니다.',
							);
							return;
						}
						this.close();
						await this.onSubmit(cleaned);
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
