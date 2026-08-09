import { App, Modal, Notice, Setting } from 'obsidian';

import type { AladinProvider } from '../apis/aladin';
import type { AnpigonSettings } from '../migration/naver-detector';
import {
	extractMigrationHints,
	hasNaverCredentials,
} from '../migration/naver-detector';
import type { BookMetasearchSettings } from '../settings';
import { dumpErrorNote } from '../util/error-dump';

/**
 * Guides existing anpigon/obsidian-book-search-plugin users through the Naver
 * EOL (2026-08-01) transition to Aladin.
 *
 * Not a wizard — a single Modal with grouped inputs. The user can dismiss any
 * time; `migrationCompletedAt` in settings is only set when they explicitly
 * confirm, so the banner reappears on next reload if they close early.
 */
export interface MigrationModalDeps {
	settings: BookMetasearchSettings;
	saveSettings: () => Promise<void>;
	aladin: AladinProvider;
	anpigon: AnpigonSettings;
}

export class MigrationModal extends Modal {
	private ttbKeyInput = '';

	constructor(
		app: App,
		private readonly deps: MigrationModalDeps,
	) {
		super(app);
		this.ttbKeyInput = deps.settings.aladinTtbKey;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('book-metasearch-migration');

		contentEl.createEl('h2', {
			text: '네이버 도서 검색 API 종료 안내',
		});

		const intro = contentEl.createDiv({
			cls: 'setting-item-description',
		});
		intro.createSpan({
			text:
				'네이버 도서 검색 API가 2026-07-31 24:00부로 공식 종료되었습니다. ' +
				'기존 사용자도 8월 1일부터는 검색이 되지 않습니다. ',
		});
		intro.createEl('a', {
			text: '공지 원문',
			href: 'https://developers.naver.com/notice/article/32973',
		});
		intro.createSpan({
			text:
				'. Aladin OpenAPI로 이전하시면 국내 도서 검색을 계속 사용하실 수 있습니다.',
		});

		// ── Step 1: TTB Key 발급 안내 ─────────────────────────
		contentEl.createEl('h3', { text: '1. Aladin TTB Key 발급' });
		contentEl.createEl('p', {
			text:
				'알라딘 오픈 API를 사용하려면 무료 TTB Key가 필요합니다. ' +
				'2026-07-13부로 발급 절차가 강화됐으니 안내에 따라 진행하세요.',
			cls: 'setting-item-description',
		});
		new Setting(contentEl)
			.setName('TTB Key 발급 페이지')
			.setDesc('aladin.co.kr/ttb — 새 창에서 열립니다.')
			.addButton((btn) =>
				btn
					.setButtonText('발급 페이지 열기')
					.setCta()
					.onClick(() => {
						window.open('https://www.aladin.co.kr/ttb/wblog_manage.aspx');
					}),
			);

		// ── Step 2: TTB Key 붙여넣기 + Healthcheck ──────────
		contentEl.createEl('h3', { text: '2. TTB Key 등록 & 검증' });
		new Setting(contentEl)
			.setName('TTB key')
			.setDesc('발급받은 키를 붙여넣으세요.')
			.addText((text) =>
				text
					.setPlaceholder('ttbXXXXXXXXX')
					.setValue(this.ttbKeyInput)
					.onChange((value) => {
						this.ttbKeyInput = value.trim();
					}),
			);
		new Setting(contentEl)
			.setName('연결 테스트')
			.setDesc('입력한 TTB Key로 Aladin 검색이 정상 응답하는지 확인.')
			.addButton((btn) =>
				btn
					.setButtonText('Healthcheck 실행')
					.onClick(async () => {
						btn.setDisabled(true).setButtonText('확인 중…');
						try {
							// 임시 저장 후 검사 (사용자가 완료 안 하면 롤백해도 되지만
							// 실행 즉시 저장이 UX 편함)
							this.deps.settings.aladinTtbKey = this.ttbKeyInput;
							await this.deps.saveSettings();

							const status = await this.deps.aladin.healthcheck();
							if (status.ok) {
								new Notice('✅ Aladin 연결 정상');
							} else {
								let dumpLine = '';
								if (this.deps.settings.errorDumpEnabled) {
									const file = await dumpErrorNote(
										this.app,
										this.deps.settings,
										{
											kind: 'migration',
											provider: 'aladin',
											error: status,
										},
									);
									if (file) dumpLine = `\n📝 ${file.path}`;
								}
								new Notice(
									`❌ Aladin [${status.code}] ${status.message}${dumpLine}`,
									8000,
								);
							}
						} finally {
							btn.setDisabled(false).setButtonText('Healthcheck 실행');
						}
					}),
			);

		// ── Step 3: anpigon 설정 승계 힌트 ─────────────────
		contentEl.createEl('h3', { text: '3. 기존 설정 승계 안내' });
		const hints = extractMigrationHints(this.deps.anpigon);
		const hintList = contentEl.createEl('ul', {
			cls: 'setting-item-description',
		});
		if (hints.coverFolder) {
			hintList.createEl('li', {
				text: `커버 폴더: ${hints.coverFolder} — 새 플러그인 설정 기본값이 동일합니다.`,
			});
		}
		if (hints.templateFile) {
			hintList.createEl('li', {
				text:
					`템플릿 파일: ${hints.templateFile} — 기존 노트 스키마와 호환되도록 ` +
					`신규 노트가 생성됩니다 (별도 템플릿 지정 불필요).`,
			});
		}
		if (hints.locale) {
			hintList.createEl('li', {
				text: `기본 locale: ${hints.locale}`,
			});
		}
		if (!hints.coverFolder && !hints.templateFile) {
			hintList.createEl('li', {
				text: '승계할 설정이 감지되지 않았습니다. 새 플러그인 기본값으로 시작합니다.',
			});
		}

		// ── Step 4 (opt-in): Naver 자격증명 정리 안내 ──────
		if (hasNaverCredentials(this.deps.anpigon)) {
			contentEl.createEl('h3', { text: '4. Naver 자격증명 정리 (선택)' });
			contentEl.createEl('p', {
				text:
					'기존 anpigon 플러그인의 data.json에 Naver Client ID/Secret이 남아 있습니다. ' +
					'API가 종료됐으므로 더 이상 유효하지 않지만, 시크릿 위생을 위해 ' +
					'개발자 콘솔에서 재발급하거나 anpigon 설정에서 지우실 것을 권장합니다. ' +
					'이 플러그인이 자동으로 삭제하지는 않습니다.',
				cls: 'setting-item-description',
			});
		}

		// ── 완료 버튼 ─────────────────────────────────────
		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('나중에').onClick(async () => {
					this.deps.settings.migrationBannerDismissedAt =
						new Date().toISOString();
					await this.deps.saveSettings();
					this.close();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('완료')
					.setCta()
					.onClick(async () => {
						this.deps.settings.aladinTtbKey = this.ttbKeyInput;
						this.deps.settings.migrationCompletedAt =
							new Date().toISOString();
						await this.deps.saveSettings();
						new Notice('설정 저장 완료 — 이제 검색을 사용하실 수 있습니다.');
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
