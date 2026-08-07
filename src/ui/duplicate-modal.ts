import { App, Modal, Setting, TFile } from 'obsidian';

import type { Book } from '../apis/base';

/**
 * User's choice from the DuplicateModal. `null` when the user closes the modal
 * without picking (Esc / click outside) — treat as cancel.
 */
export type DuplicateAction = 'open' | 'update' | 'create' | 'cancel';

/**
 * Shown when `NoteWriter.create()` throws `DuplicateBookError` and
 * `settings.duplicateAction === 'ask'`. Keeps decisions on the user side
 * rather than silently doing one of the four things.
 */
export class DuplicateModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly existing: TFile,
		private readonly incoming: Book,
		private readonly onDecide: (action: DuplicateAction) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('book-metasearch-duplicate');

		contentEl.createEl('h2', { text: '이미 이 책이 볼트에 있습니다' });

		const info = contentEl.createEl('div', {
			cls: 'setting-item-description',
		});
		info.createSpan({
			text: `일치 기준: ISBN — `,
		});
		info.createEl('code', {
			text: this.incoming.isbn13 || this.incoming.isbn10 || '?',
		});

		const list = contentEl.createEl('dl', {
			cls: 'book-metasearch-duplicate-list',
		});
		list.createEl('dt', {
			text: '기존 노트',
			cls: 'book-metasearch-duplicate-label',
		});
		list.createEl('dd', { text: this.existing.path });
		list.createEl('dt', {
			text: '새 검색 결과',
			cls: 'book-metasearch-duplicate-label',
		});
		list.createEl('dd', {
			text: `${this.incoming.title}${
				this.incoming.authors.length
					? ` — ${this.incoming.authors.join(', ')}`
					: ''
			}`,
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('기존 노트 열기')
					.setCta()
					.onClick(() => this.finish('open')),
			)
			.addButton((btn) =>
				btn
					.setButtonText('기존 노트 업데이트')
					.setTooltip(
						'기존 노트의 provider 필드를 새 검색 결과로 갱신합니다. ' +
							'본문(Why to Read 등)은 유지됩니다.',
					)
					.onClick(() => this.finish('update')),
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('무시하고 새로 만들기')
					.setWarning()
					.setTooltip(
						'주의: 같은 책의 별도 판본이거나 정말로 두 벌이 필요할 때만 사용.',
					)
					.onClick(() => this.finish('create')),
			)
			.addButton((btn) =>
				btn.setButtonText('취소').onClick(() => this.finish('cancel')),
			);
	}

	private finish(action: DuplicateAction): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onDecide(action);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.onDecide('cancel');
		}
	}
}
