import {
	App,
	ExtraButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	TextComponent,
} from 'obsidian';

import type BookMetasearchPlugin from '../main';
import { dumpErrorNote } from '../util/error-dump';
import type { HealthStatus } from '../apis/base';

/**
 * Called by every healthcheck button when the probe fails. Writes a redacted
 * diagnostics note to the vault if `errorDumpEnabled` is on, and augments the
 * user-facing Notice with the resulting file path so the user knows where to
 * find it.
 */
async function reportHealthFailure(
	plugin: BookMetasearchPlugin,
	provider: string,
	status: Extract<HealthStatus, { ok: false }>,
): Promise<string> {
	const docs = status.docsUrl ? `\n${status.docsUrl}` : '';
	if (!plugin.settings.errorDumpEnabled) {
		return `❌ ${provider} [${status.code}]\n${status.message}${docs}`;
	}
	const file = await dumpErrorNote(plugin.app, plugin.settings, {
		kind: 'healthcheck',
		provider,
		error: status,
	});
	const dumpLine = file ? `\n📝 ${file.path}` : '';
	return `❌ ${provider} [${status.code}]\n${status.message}${docs}${dumpLine}`;
}

/**
 * Turn a text input into a password-masked field with a click-to-reveal
 * toggle button. Values are still stored in plain text — this is UI
 * shoulder-surfing prevention, not encryption.
 */
function maskAsSecret(text: TextComponent): void {
	text.inputEl.type = 'password';
	text.inputEl.autocomplete = 'off';
	text.inputEl.spellcheck = false;
}

function attachRevealButton(
	setting: Setting,
	text: TextComponent,
): ExtraButtonComponent {
	let shown = false;
	let button!: ExtraButtonComponent;
	setting.addExtraButton((btn) => {
		button = btn;
		btn
			.setIcon('eye')
			.setTooltip('값 표시')
			.onClick(() => {
				shown = !shown;
				text.inputEl.type = shown ? 'text' : 'password';
				btn.setIcon(shown ? 'eye-off' : 'eye');
				btn.setTooltip(shown ? '값 숨김' : '값 표시');
			});
	});
	return button;
}

const TTB_ISSUE_URL = 'https://www.aladin.co.kr/ttb/wblog_manage.aspx';

// ISO 639-1 codes supported across Google Books langRestrict, Kakao Daum,
// Open Library. Alphabetical, Korean first (bongho's primary).
const LOCALES: readonly { code: string; label: string }[] = [
	{ code: 'ko', label: '한국어 · Korean' },
	{ code: 'en', label: 'English' },
	{ code: 'ja', label: '日本語 · Japanese' },
	{ code: 'zh', label: '中文 · Chinese' },
	{ code: 'ar', label: 'العربية · Arabic' },
	{ code: 'bg', label: 'Bulgarian' },
	{ code: 'ca', label: 'Catalan' },
	{ code: 'cs', label: 'Czech' },
	{ code: 'da', label: 'Danish' },
	{ code: 'de', label: 'Deutsch · German' },
	{ code: 'el', label: 'Ελληνικά · Greek' },
	{ code: 'es', label: 'Español · Spanish' },
	{ code: 'et', label: 'Estonian' },
	{ code: 'fi', label: 'Finnish' },
	{ code: 'fr', label: 'Français · French' },
	{ code: 'he', label: 'עברית · Hebrew' },
	{ code: 'hi', label: 'हिन्दी · Hindi' },
	{ code: 'hr', label: 'Croatian' },
	{ code: 'hu', label: 'Hungarian' },
	{ code: 'id', label: 'Bahasa Indonesia' },
	{ code: 'it', label: 'Italiano · Italian' },
	{ code: 'lt', label: 'Lithuanian' },
	{ code: 'lv', label: 'Latvian' },
	{ code: 'nl', label: 'Nederlands · Dutch' },
	{ code: 'no', label: 'Norwegian' },
	{ code: 'pl', label: 'Polski · Polish' },
	{ code: 'pt', label: 'Português · Portuguese' },
	{ code: 'ro', label: 'Romanian' },
	{ code: 'ru', label: 'Русский · Russian' },
	{ code: 'sk', label: 'Slovak' },
	{ code: 'sl', label: 'Slovenian' },
	{ code: 'sr', label: 'Српски · Serbian' },
	{ code: 'sv', label: 'Svenska · Swedish' },
	{ code: 'th', label: 'ไทย · Thai' },
	{ code: 'tr', label: 'Türkçe · Turkish' },
	{ code: 'uk', label: 'Українська · Ukrainian' },
	{ code: 'vi', label: 'Tiếng Việt · Vietnamese' },
];

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
 *
 * This deliberately does not implement getSettingDefinitions(), so eslint's
 * obsidianmd/settings-tab/prefer-setting-definitions warning is expected here.
 * The declarative API replaces display() rather than composing with it, which
 * cost us API-key masking and the healthcheck buttons in v1.2.0 — rolled back
 * in v1.2.2. Reopening conditions: #11
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

		;
		containerEl.createEl('p', {
			text:
				'Metasearch across Aladin, Kakao, Google Books, and Open Library. ' +
				'Sprint S1 in progress — only Aladin is wired up so far.',
			cls: 'setting-item-description',
		});

		// ── 1. Providers ─────────────────────────────
		new Setting(containerEl).setName("Providers").setHeading();

		{
			let inputRef!: TextComponent;
			const setting = new Setting(containerEl)
				.setName('Aladin TTB key')
				.setDesc('알라딘 오픈 API 키. 발급 페이지에서 무료로 받을 수 있습니다.')
				.addText((text) => {
					inputRef = text;
					maskAsSecret(text);
					text
						.setPlaceholder('ttbXXXXXXXXX')
						.setValue(this.plugin.settings.aladinTtbKey)
						.onChange(async (value) => {
							this.plugin.settings.aladinTtbKey = value.trim();
							await this.plugin.saveSettings();
						});
				});
			attachRevealButton(setting, inputRef);
			setting.addButton((btn) =>
				btn
					.setButtonText('발급 페이지 열기')
					.setTooltip(TTB_ISSUE_URL)
					.onClick(() => {
						window.open(TTB_ISSUE_URL);
					}),
			);
		}

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
							const msg = await reportHealthFailure(
								this.plugin,
								'Aladin',
								status,
							);
							new Notice(msg, 8000);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);

		{
			let inputRef!: TextComponent;
			const setting = new Setting(containerEl)
				.setName('Kakao REST API key')
				.setDesc('Kakao Developers 애플리케이션의 REST API 키. 즉시 발급, 승인 대기 없음.')
				.addText((text) => {
					inputRef = text;
					maskAsSecret(text);
					text
						.setPlaceholder('a1b2c3d4...')
						.setValue(this.plugin.settings.kakaoRestApiKey)
						.onChange(async (value) => {
							this.plugin.settings.kakaoRestApiKey = value.trim();
							await this.plugin.saveSettings();
						});
				});
			attachRevealButton(setting, inputRef);
			setting.addButton((btn) =>
				btn
					.setButtonText('발급 페이지 열기')
					.setTooltip('developers.kakao.com')
					.onClick(() => {
						window.open('https://developers.kakao.com/');
					}),
			);
		}

		new Setting(containerEl)
			.setName('Kakao 연결 테스트')
			.addButton((btn) =>
				btn.setButtonText('Healthcheck 실행').onClick(async () => {
					btn.setDisabled(true).setButtonText('확인 중…');
					try {
						const status = await this.plugin.kakao.healthcheck();
						if (status.ok) {
							new Notice('✅ Kakao OK', 6000);
						} else {
							const msg = await reportHealthFailure(
								this.plugin,
								'Kakao',
								status,
							);
							new Notice(msg, 8000);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);

		{
			let inputRef!: TextComponent;
			const setting = new Setting(containerEl)
				.setName('Google Books API key')
				.setDesc(
					'선택 사항 — 없어도 검색은 되지만 rate limit이 낮습니다. ' +
						'Google Cloud Console에서 Books API 활성화 후 발급받으면 1,000/day 무료.',
				)
				.addText((text) => {
					inputRef = text;
					maskAsSecret(text);
					text
						.setPlaceholder('AIza...')
						.setValue(this.plugin.settings.googleBooksApiKey)
						.onChange(async (value) => {
							this.plugin.settings.googleBooksApiKey = value.trim();
							await this.plugin.saveSettings();
						});
				});
			attachRevealButton(setting, inputRef);
			setting.addButton((btn) =>
				btn
					.setButtonText('Console 열기')
					.setTooltip('console.cloud.google.com')
					.onClick(() => {
						window.open(
							'https://console.cloud.google.com/apis/credentials',
						);
					}),
			);
		}

		new Setting(containerEl)
			.setName('Google Books 연결 테스트')
			.addButton((btn) =>
				btn.setButtonText('Healthcheck 실행').onClick(async () => {
					btn.setDisabled(true).setButtonText('확인 중…');
					try {
						const status = await this.plugin.google.healthcheck();
						if (status.ok) {
							new Notice('✅ Google Books OK', 6000);
						} else {
							const msg = await reportHealthFailure(
								this.plugin,
								'Google Books',
								status,
							);
							new Notice(msg, 8000);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);

		new Setting(containerEl)
			.setName('Open Library 연결 테스트')
			.setDesc('무인증 provider (CC0 오픈 데이터).')
			.addButton((btn) =>
				btn.setButtonText('Healthcheck 실행').onClick(async () => {
					btn.setDisabled(true).setButtonText('확인 중…');
					try {
						const status = await this.plugin.openLibrary.healthcheck();
						if (status.ok) {
							new Notice('✅ Open Library OK', 6000);
						} else {
							const msg = await reportHealthFailure(
								this.plugin,
								'Open Library',
								status,
							);
							new Notice(msg, 8000);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);

		new Setting(containerEl)
			.setName('검색 전략')
			.setDesc(
				'sequential: 우선순위대로 시도, 결과 있는 첫 provider에서 멈춤. ' +
					'fanout: 모든 provider에 병렬 질의 후 ISBN13으로 중복 제거.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('sequential', 'Sequential (fallback)')
					.addOption('fanout', 'Fanout (parallel + dedupe)')
					.setValue(this.plugin.settings.searchStrategy)
					.onChange(async (value) => {
						this.plugin.settings.searchStrategy =
							value as typeof this.plugin.settings.searchStrategy;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Provider 우선순위')
			.setDesc(
				'쉼표로 구분된 provider ID 순서 (aladin, kakao, google, openlibrary). ' +
					'sequential 모드에서 순차 시도, fanout 모드에서 중복 제거 우선순위.',
			)
			.addText((text) =>
				text
					.setPlaceholder('aladin, kakao, google, openlibrary')
					.setValue(this.plugin.settings.priorityOrder.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.priorityOrder = value
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		// ── 2. Notes ─────────────────────────────────
		new Setting(containerEl).setName("Notes").setHeading();

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

		new Setting(containerEl)
			.setName('템플릿 파일')
			.setDesc(
				'노트 body의 base로 사용할 마크다운 템플릿 파일 경로 (볼트 상대 경로). ' +
					'{{title}}, {{author}}, {{description}} 등 변수 치환 지원. ' +
					'Templater `<% ... %>` 블록은 그대로 보존되어 Templater 플러그인이 후처리합니다. ' +
					'비워두면 내장 기본 스켈레톤 사용.',
			)
			.addText((text) =>
				text
					.setPlaceholder('90. Settings/91. Templates/Template_Book Reference.md')
					.setValue(this.plugin.settings.templateFile)
					.onChange(async (value) => {
						this.plugin.settings.templateFile = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		// ── 3. Frontmatter ───────────────────────────
		new Setting(containerEl).setName("Frontmatter").setHeading();

		new Setting(containerEl)
			.setName('기본 프론트매터 사용')
			.setDesc(
				'끄면 type/title/author 등 기본 필드를 자동으로 넣지 않습니다. ' +
					'"추가 프론트매터"와 "템플릿 파일"만으로 노트 스키마를 완전히 커스터마이징할 수 있습니다.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useDefaultFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.useDefaultFrontmatter = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('기본 프론트매터 필드명 형식')
			.setDesc(
				'as-is: 봉호 볼트와 100% 동일 (localCover + provider_url). ' +
					'camelCase: anpigon 기본. snake_case/kebab-case: 통일된 스타일.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('as-is', 'as-is (봉호 볼트 매칭)')
					.addOption('camelCase', 'camelCase')
					.addOption('snake_case', 'snake_case')
					.addOption('kebab-case', 'kebab-case')
					.setValue(this.plugin.settings.defaultFrontmatterKeyType)
					.onChange(async (value) => {
						this.plugin.settings.defaultFrontmatterKeyType =
							value as typeof this.plugin.settings.defaultFrontmatterKeyType;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('추가 프론트매터')
			.setDesc(
				'기본 프론트매터 다음에 붙는 YAML 조각. {{variables}} 치환 지원. 예: rating: 0',
			)
			.addTextArea((ta) => {
				ta.setPlaceholder(
					'rating: 0\nkorea_ebook: {{isbn13}}',
				);
				ta.setValue(this.plugin.settings.frontmatterAdditional);
				ta.onChange(async (value) => {
					this.plugin.settings.frontmatterAdditional = value;
					await this.plugin.saveSettings();
				});
				ta.inputEl.rows = 4;
			});

		// ── 4. Covers ────────────────────────────────
		new Setting(containerEl).setName("Covers").setHeading();

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
			.setDesc('노트 생성 시 커버 이미지를 볼트에 다운로드합니다.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCoverImageSave)
					.onChange(async (value) => {
						this.plugin.settings.enableCoverImageSave = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('커버 이미지 edge curl 효과')
			.setDesc('저장된 커버 이미지에 종이접힘 효과를 추가. ⚠️ S4에서 활성화됩니다.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCoverImageEdgeCurl)
					.onChange(async (value) => {
						this.plugin.settings.enableCoverImageEdgeCurl = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 5. Search UI ─────────────────────────────
		new Setting(containerEl).setName("Search UI").setHeading();

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

		// ── 6. Locale ────────────────────────────────
		new Setting(containerEl).setName("Locale").setHeading();

		new Setting(containerEl)
			.setName('기본 검색 언어')
			.setDesc(
				'ISO 639-1 언어 코드. S1은 Aladin(ko)만 실사용. ' +
					'S2 이후 Google Books langRestrict, Kakao target, Open Library language 필터에 반영됩니다.',
			)
			.addDropdown((dd) => {
				for (const { code, label } of LOCALES) {
					dd.addOption(code, `${label} (${code})`);
				}
				dd.setValue(this.plugin.settings.localePreference).onChange(
					async (value) => {
						this.plugin.settings.localePreference = value;
						await this.plugin.saveSettings();
					},
				);
			});

		new Setting(containerEl)
			.setName('검색 시 언어 묻기')
			.setDesc('매 검색마다 언어를 선택하는 프롬프트를 띄웁니다. ⚠️ S2 multi-provider에서 활성화됩니다.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.askForLocale)
					.onChange(async (value) => {
						this.plugin.settings.askForLocale = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── 5. Attribution ───────────────────────────
		new Setting(containerEl).setName("Attribution").setHeading();

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
		new Setting(containerEl).setName("Tools").setHeading();

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

		// ── 7. Reading Log ───────────────────────────
		new Setting(containerEl).setName('Reading log').setHeading();

		new Setting(containerEl)
			.setName('독서 상태 필드 활성화')
			.setDesc(
				'신규 노트에 status 필드를 넣고 "Mark as wishlist/reading/read" 명령어를 활성화. ' +
					'reading/read 전환 시 startedAt/finishedAt 날짜가 자동 기록됩니다.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.readingStatusEnabled)
					.onChange(async (value) => {
						this.plugin.settings.readingStatusEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('신규 노트 초기 상태')
			.setDesc('Search books로 만든 새 노트의 기본 status 값.')
			.addDropdown((dd) =>
				dd
					.addOption('wishlist', 'Wishlist (아직 안 삼)')
					.addOption('reading', 'Reading (읽는 중)')
					.addOption('read', 'Read (완독)')
					.setValue(this.plugin.settings.initialStatus)
					.onChange(async (value) => {
						this.plugin.settings.initialStatus =
							value as typeof this.plugin.settings.initialStatus;
						await this.plugin.saveSettings();
					}),
			);

		// ── 8. Citation ──────────────────────────────
		new Setting(containerEl).setName('Citation').setHeading();

		new Setting(containerEl)
			.setName('인용 형식')
			.setDesc(
				'"Insert book citation at cursor" 명령어가 커서에 삽입할 wikilink 형식.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('wikilink', '[[제목]] (저자, 연도)')
					.addOption(
						'wikilink-alias',
						'[[대상|저자, 연도 — 제목]] (alias 형식)',
					)
					.setValue(this.plugin.settings.citationStyle)
					.onChange(async (value) => {
						this.plugin.settings.citationStyle =
							value as typeof this.plugin.settings.citationStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('노트 부재 시 동작')
			.setDesc(
				'인용 대상 책 노트가 볼트에 없을 때. insert-only는 미해결 링크를 그냥 삽입.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('insert-only', 'Insert only (링크만 삽입, 기본)')
					.addOption('create-note', 'Create note (자동 생성 후 링크)')
					.addOption('prompt', 'Prompt (매번 확인 — 향후 구현)')
					.setValue(this.plugin.settings.citationOnMissing)
					.onChange(async (value) => {
						this.plugin.settings.citationOnMissing =
							value as typeof this.plugin.settings.citationOnMissing;
						await this.plugin.saveSettings();
					}),
			);

		// ── 9. Price Check ──────────────────────────
		new Setting(containerEl).setName('Price check').setHeading();

		new Setting(containerEl)
			.setName('Aladin 중고가 조회 활성화')
			.setDesc(
				'"Check used-book price (Aladin)" 명령어를 켭니다. TTB Key 필요, 하루 5,000회 quota 공유.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.priceCheckEnabled)
					.onChange(async (value) => {
						this.plugin.settings.priceCheckEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('중고가 결과 노출')
			.setDesc(
				'notice-only: Obsidian Notice로만 표시(볼트 무수정). ' +
					'section: 노트 하단 `## Price Watch`에 timestamped row 누적.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('notice-only', 'Notice만 (기본)')
					.addOption('section', 'Price Watch 섹션에 append')
					.setValue(this.plugin.settings.priceOutputMode)
					.onChange(async (value) => {
						this.plugin.settings.priceOutputMode =
							value as typeof this.plugin.settings.priceOutputMode;
						await this.plugin.saveSettings();
					}),
			);

		// ── 10. Duplicates ───────────────────────────
		new Setting(containerEl).setName('Duplicates').setHeading();

		new Setting(containerEl)
			.setName('중복 노트 처리')
			.setDesc(
				'검색 결과가 볼트에 이미 있는 책(ISBN 일치)일 때의 기본 동작.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('ask', '물어보기 (기본)')
					.addOption('open', '기존 노트 열기')
					.addOption('update', '기존 노트 업데이트')
					.addOption('error', '알림 표시 후 취소')
					.setValue(this.plugin.settings.duplicateAction)
					.onChange(async (value) => {
						this.plugin.settings.duplicateAction =
							value as typeof this.plugin.settings.duplicateAction;
						await this.plugin.saveSettings();
					}),
			);

		// ── 11. Diagnostics ──────────────────────────
		new Setting(containerEl).setName('Diagnostics').setHeading();

		new Setting(containerEl)
			.setName('실패 시 진단 노트 자동 저장')
			.setDesc(
				'Healthcheck·마이그레이션 실패 시 오류 내용을 볼트의 진단 폴더에 저장. ' +
					'API 키 등 secret은 자동 마스킹됩니다.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.errorDumpEnabled)
					.onChange(async (value) => {
						this.plugin.settings.errorDumpEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('진단 노트 폴더')
			.setDesc('오류 dump 노트가 저장될 볼트 상대 경로.')
			.addText((text) =>
				text
					.setPlaceholder('85. References (Book Search)/_errors')
					.setValue(this.plugin.settings.errorDumpFolder)
					.onChange(async (value) => {
						this.plugin.settings.errorDumpFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
