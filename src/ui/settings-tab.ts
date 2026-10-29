import { App, Notice, PluginSettingTab } from 'obsidian';
import type {
	SettingDefinitionItem,
	SettingDefinitionRender,
	SettingGroupItem,
} from 'obsidian';

import type BookMetasearchPlugin from '../main';
import { dumpErrorNote } from '../util/error-dump';
import type { HealthStatus } from '../apis/base';
import { DEFAULT_SETTINGS } from '../settings';
import type { SecretIdField } from '../settings';

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

const TTB_ISSUE_URL = 'https://www.aladin.co.kr/ttb/wblog_manage.aspx';
const YES24_ISSUE_URL = 'https://developers.yes24.com/docs/apikey';
const KAKAO_ISSUE_URL = 'https://developers.kakao.com/';
const GOOGLE_ISSUE_URL = 'https://console.cloud.google.com/apis/credentials';

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

const LOCALE_OPTIONS: Record<string, string> = Object.fromEntries(
	LOCALES.map(({ code, label }) => [code, `${label} (${code})`]),
);

/**
 * `priorityOrder` is a `string[]`, but the control that edits it is a
 * comma-separated text box. A declarative control binds one key to one stored
 * value, so the text form gets a key of its own and the split/join lives in
 * `getControlValue` / `setControlValue`. It is deliberately not a field on
 * `BookMetasearchSettings` — nothing persists under this name.
 */
export const PRIORITY_ORDER_KEY = 'priorityOrderText';

/**
 * Text fields that fall back to a default when the user clears them.
 *
 * The imperative tab applied these inside each `onChange`; every write now
 * goes through `setControlValue`, so they live in one table instead of being
 * spread across the rows. `''` means "keep it empty", which is still a
 * decision worth recording here rather than an absent entry.
 */
const TEXT_FALLBACKS: Readonly<Record<string, string>> = {
	notesFolder: '85. References (Book Search)',
	coverFolder: '80. References/Assets/Images',
	fileNameFormat: '{{title}} - {{author}}',
	templateFile: '',
	errorDumpFolder: '',
};

/** One provider's key row and healthcheck row. */
interface ProviderCard {
	/** Used in Notices and in the diagnostics note. */
	label: string;
	keyName: string;
	keyDesc: string;
	secretKey: SecretIdField;
	issueUrl: string;
	issueLabel: string;
	testName: string;
	testDesc?: string;
	/** Success-Notice timeout, kept per provider as the 1.4.0 tab had it. */
	okTimeout?: number;
	probe: (plugin: BookMetasearchPlugin) => Promise<HealthStatus>;
}

const PROVIDERS: readonly ProviderCard[] = [
	{
		label: 'YES24',
		keyName: 'YES24 API key',
		keyDesc:
			'YES24 Open API 키. 예스24 계정으로 로그인해 약관에 동의하면 즉시 발급됩니다. 기본키 한도는 하루 20,000회.',
		secretKey: 'yes24SecretId',
		issueUrl: YES24_ISSUE_URL,
		issueLabel: '발급 페이지 열기',
		testName: 'YES24 연결 테스트',
		testDesc: '입력한 API Key로 검색 API가 정상 응답하는지 확인.',
		probe: (plugin) => plugin.yes24.healthcheck(),
	},
	{
		label: 'Aladin',
		keyName: 'Aladin TTB key',
		keyDesc:
			'⚠️ 알라딘 오픈 API는 2026-10-30에 종료됩니다(신규 키 발급은 2026-09-04 마감). 기존 키는 종료일까지 동작하며, 검색 기본값은 YES24로 옮겨졌습니다.',
		secretKey: 'aladinSecretId',
		issueUrl: TTB_ISSUE_URL,
		issueLabel: '발급 페이지 열기',
		testName: 'Aladin 연결 테스트',
		testDesc: '입력한 TTB Key로 검색 API가 정상 응답하는지 확인.',
		probe: (plugin) => plugin.aladin.healthcheck(),
	},
	{
		label: 'Kakao',
		keyName: 'Kakao REST API key',
		keyDesc: 'Kakao Developers 애플리케이션의 REST API 키. 즉시 발급, 승인 대기 없음.',
		secretKey: 'kakaoSecretId',
		issueUrl: KAKAO_ISSUE_URL,
		issueLabel: '발급 페이지 열기',
		testName: 'Kakao 연결 테스트',
		okTimeout: 6000,
		probe: (plugin) => plugin.kakao.healthcheck(),
	},
	{
		label: 'Google Books',
		keyName: 'Google Books API key',
		keyDesc:
			'선택 사항 — 없어도 검색은 되지만 rate limit이 낮습니다. ' +
			'Google Cloud Console에서 Books API 활성화 후 발급받으면 1,000/day 무료.',
		secretKey: 'googleBooksSecretId',
		issueUrl: GOOGLE_ISSUE_URL,
		issueLabel: 'Console 열기',
		testName: 'Google Books 연결 테스트',
		okTimeout: 6000,
		probe: (plugin) => plugin.google.healthcheck(),
	},
];

/**
 * Builds a description ending in a link to the provider's key issuing page.
 *
 * The imperative tab put that link on a button beside the key field. A
 * `control` definition owns its row's control slot, so the link moves into the
 * description — where the fragment's `textContent` still feeds the settings
 * search index.
 */
function descWithLink(
	text: string,
	url: string,
	label: string,
): DocumentFragment {
	return createFragment((frag) => {
		frag.appendText(`${text} `);
		frag.createEl('a', {
			text: label,
			href: url,
			attr: { target: '_blank', rel: 'noopener' },
		});
	});
}

/**
 * A healthcheck row.
 *
 * This is `render` rather than `action` on purpose: an action definition makes
 * the whole row clickable, and the button it replaces has to carry its own
 * disabled state and "확인 중…" label while the probe is in flight.
 */
function healthcheckRow(
	plugin: BookMetasearchPlugin,
	card: Pick<
		ProviderCard,
		'label' | 'testName' | 'testDesc' | 'okTimeout' | 'probe'
	>,
): SettingDefinitionRender {
	return {
		name: card.testName,
		...(card.testDesc === undefined ? {} : { desc: card.testDesc }),
		render: (setting) => {
			setting.addButton((btn) =>
				btn.setButtonText('Healthcheck 실행').onClick(async () => {
					btn.setDisabled(true).setButtonText('확인 중…');
					try {
						const status = await card.probe(plugin);
						if (status.ok) {
							new Notice(`✅ ${card.label} OK`, card.okTimeout);
						} else {
							const msg = await reportHealthFailure(
								plugin,
								card.label,
								status,
							);
							new Notice(msg, 8000);
						}
					} finally {
						btn.setDisabled(false).setButtonText('Healthcheck 실행');
					}
				}),
			);
		},
	};
}

/**
 * Plugin settings tab shown in Obsidian's settings modal.
 *
 * Declarative since 1.5.0: the rows are data returned from
 * `getSettingDefinitions()`, which is what puts them in Obsidian's settings
 * search. `display()` is gone, because the framework renders the definitions
 * *in place of* it rather than alongside it.
 *
 * That replacement is why #11 sat blocked through v1.2.2: the declarative path
 * had no way to keep API keys masked or to host the healthcheck buttons, so
 * adopting it leaked the keys as plaintext. Both holes are closed now. Keys
 * bind to `control: { type: 'secret' }`, which stores the keychain id that
 * #48 already moved them to, and the buttons live in `render` rows.
 *
 * Storage goes through `getControlValue` / `setControlValue` below, overridden
 * because the settings live on the plugin rather than in the vault config.
 */
export class BookMetasearchSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: BookMetasearchPlugin,
	) {
		super(app, plugin);
	}

	getControlValue(key: string): unknown {
		if (key === PRIORITY_ORDER_KEY) {
			return this.plugin.settings.priorityOrder.join(', ');
		}
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		if (key === PRIORITY_ORDER_KEY) {
			this.plugin.settings.priorityOrder = (
				typeof value === 'string' ? value : ''
			)
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean);
			return this.plugin.saveSettings();
		}
		// A key no definition should produce. Dropping the write is better than
		// growing data.json a property nothing ever reads back.
		if (!(key in DEFAULT_SETTINGS)) return;
		const fallback = TEXT_FALLBACKS[key];
		const next =
			typeof value === 'string' && fallback !== undefined
				? value.trim() || fallback
				: value;
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = next;
		return this.plugin.saveSettings();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const providerItems: SettingGroupItem[] = PROVIDERS.flatMap((card) => [
			{
				name: card.keyName,
				desc: descWithLink(card.keyDesc, card.issueUrl, card.issueLabel),
				control: { type: 'secret', key: card.secretKey },
			} satisfies SettingGroupItem,
			healthcheckRow(this.plugin, card),
		]);

		return [
			{
				name: 'Book Metasearch',
				desc:
					'Metasearch across YES24, Kakao, Google Books, Open Library, ' +
					'and Aladin. Korean-first with foreign fallback; the default ' +
					'order is YES24, Kakao, Google Books, then Open Library.',
				searchable: false,
			},
			{
				type: 'group',
				heading: 'Providers',
				items: [
					...providerItems,
					healthcheckRow(this.plugin, {
						label: 'Open Library',
						testName: 'Open Library 연결 테스트',
						testDesc: '무인증 provider (CC0 오픈 데이터).',
						okTimeout: 6000,
						probe: (plugin) => plugin.openLibrary.healthcheck(),
					}),
					{
						name: '검색 전략',
						desc:
							'sequential: 우선순위대로 시도, 결과 있는 첫 provider에서 멈춤. ' +
							'fanout: 모든 provider에 병렬 질의 후 ISBN13으로 중복 제거.',
						control: {
							type: 'dropdown',
							key: 'searchStrategy',
							options: {
								sequential: 'Sequential (fallback)',
								fanout: 'Fanout (parallel + dedupe)',
							},
						},
					},
					{
						name: 'Provider 우선순위',
						desc:
							'쉼표로 구분된 provider ID 순서 (yes24, kakao, google, openlibrary). ' +
							'sequential 모드에서 순차 시도, fanout 모드에서 중복 제거 우선순위.',
						control: {
							type: 'text',
							key: PRIORITY_ORDER_KEY,
							placeholder: 'yes24, kakao, google, openlibrary',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Notes',
				items: [
					{
						name: '노트 저장 폴더',
						desc: '생성될 book note가 저장되는 볼트 폴더 경로.',
						control: {
							type: 'text',
							key: 'notesFolder',
							placeholder: '85. References (Book Search)',
						},
					},
					{
						name: '파일명 포맷',
						desc:
							'사용 가능한 변수: {{title}}, {{subtitle}}, {{author}}, {{publisher}}, {{publishYear}}, {{isbn}}. ' +
							'특수문자는 자동으로 정제됩니다.',
						control: {
							type: 'text',
							key: 'fileNameFormat',
							placeholder: '{{title}} - {{author}}',
						},
					},
					{
						name: '노트 생성 후 자동 열기',
						desc: '검색 결과 선택 시 새 탭에서 노트를 즉시 엽니다.',
						control: { type: 'toggle', key: 'openNoteAfterCreate' },
					},
					{
						name: '템플릿 파일',
						desc:
							'노트 body의 base로 사용할 마크다운 템플릿 파일 경로 (볼트 상대 경로). ' +
							'{{title}}, {{author}}, {{description}} 등 변수 치환 지원. ' +
							'Templater `<% ... %>` 블록은 그대로 보존되어 Templater 플러그인이 후처리합니다. ' +
							'비워두면 내장 기본 스켈레톤 사용.',
						control: {
							type: 'text',
							key: 'templateFile',
							placeholder:
								'90. Settings/91. Templates/Template_Book Reference.md',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Frontmatter',
				items: [
					{
						name: '기본 프론트매터 사용',
						desc:
							'끄면 type/title/author 등 기본 필드를 자동으로 넣지 않습니다. ' +
							'"추가 프론트매터"와 "템플릿 파일"만으로 노트 스키마를 완전히 커스터마이징할 수 있습니다.',
						control: { type: 'toggle', key: 'useDefaultFrontmatter' },
					},
					{
						name: '기본 프론트매터 필드명 형식',
						desc:
							'as-is: 봉호 볼트와 100% 동일 (localCover + provider_url). ' +
							'camelCase: anpigon 기본. snake_case/kebab-case: 통일된 스타일.',
						control: {
							type: 'dropdown',
							key: 'defaultFrontmatterKeyType',
							options: {
								'as-is': 'as-is (봉호 볼트 매칭)',
								camelCase: 'camelCase',
								snake_case: 'snake_case',
								'kebab-case': 'kebab-case',
							},
						},
					},
					{
						name: '추가 프론트매터',
						desc: '기본 프론트매터 다음에 붙는 YAML 조각. {{variables}} 치환 지원. 예: rating: 0',
						control: {
							type: 'textarea',
							key: 'frontmatterAdditional',
							placeholder: 'rating: 0\nkorea_ebook: {{isbn13}}',
							rows: 4,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Covers',
				items: [
					{
						name: '커버 이미지 폴더',
						desc: '로컬로 저장할 커버 이미지의 볼트 폴더 경로.',
						control: {
							type: 'text',
							key: 'coverFolder',
							placeholder: '80. References/Assets/Images',
						},
					},
					{
						name: '커버 이미지 로컬 저장',
						desc: '노트 생성 시 커버 이미지를 볼트에 다운로드합니다.',
						control: { type: 'toggle', key: 'enableCoverImageSave' },
					},
					{
						name: '커버 이미지 edge curl 효과',
						desc: '저장된 커버 이미지에 종이접힘 효과를 추가. ⚠️ S4에서 활성화됩니다.',
						control: { type: 'toggle', key: 'enableCoverImageEdgeCurl' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Search UI',
				items: [
					{
						name: '검색 결과에 커버 이미지 표시',
						desc: 'SuggestModal 항목에 커버 썸네일을 렌더링. ⚠️ S2에서 활성화됩니다.',
						control: { type: 'toggle', key: 'showCoverInSearch' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Locale',
				items: [
					{
						name: '기본 검색 언어',
						desc:
							'ISO 639-1 언어 코드. S1은 Aladin(ko)만 실사용. ' +
							'S2 이후 Google Books langRestrict, Kakao target, Open Library language 필터에 반영됩니다.',
						control: {
							type: 'dropdown',
							key: 'localePreference',
							options: LOCALE_OPTIONS,
						},
					},
					{
						name: '검색 시 언어 묻기',
						desc: '매 검색마다 언어를 선택하는 프롬프트를 띄웁니다. ⚠️ S2 multi-provider에서 활성화됩니다.',
						control: { type: 'toggle', key: 'askForLocale' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Attribution',
				items: [
					{
						name: 'Aladin 크레딧 링크 삽입',
						desc: '생성된 노트 하단에 "Book DB by Aladin" 링크 삽입. 알라딘 이용약관에 따라 켜두시길 권장합니다.',
						control: { type: 'toggle', key: 'aladinCreditEnabled' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Tools',
				items: [
					{
						name: 'Naver → Aladin 이전 도구',
						desc:
							'anpigon obsidian-book-search-plugin 사용자가 Naver 도서 API 종료(2026-08-01) 이후 ' +
							'Aladin으로 이전하는 것을 도와줍니다. anpigon 미설치여도 TTB Key 등록용으로 사용 가능.',
						render: (setting) => {
							setting.addButton((btn) =>
								btn.setButtonText('이전 도구 열기').onClick(() => {
									void this.plugin.openMigrationHelper();
								}),
							);
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Reading log',
				items: [
					{
						name: '독서 상태 필드 활성화',
						desc:
							'신규 노트에 status 필드를 넣고 "Mark as wishlist/reading/read" 명령어를 활성화. ' +
							'reading/read 전환 시 startedAt/finishedAt 날짜가 자동 기록됩니다.',
						control: { type: 'toggle', key: 'readingStatusEnabled' },
					},
					{
						name: '신규 노트 초기 상태',
						desc: 'Search books로 만든 새 노트의 기본 status 값.',
						control: {
							type: 'dropdown',
							key: 'initialStatus',
							options: {
								wishlist: 'Wishlist (아직 안 삼)',
								reading: 'Reading (읽는 중)',
								read: 'Read (완독)',
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Citation',
				items: [
					{
						name: '인용 형식',
						desc: '"Insert book citation at cursor" 명령어가 커서에 삽입할 wikilink 형식.',
						control: {
							type: 'dropdown',
							key: 'citationStyle',
							options: {
								wikilink: '[[제목]] (저자, 연도)',
								'wikilink-alias': '[[대상|저자, 연도 — 제목]] (alias 형식)',
							},
						},
					},
					{
						name: '노트 부재 시 동작',
						desc: '인용 대상 책 노트가 볼트에 없을 때. insert-only는 미해결 링크를 그냥 삽입.',
						control: {
							type: 'dropdown',
							key: 'citationOnMissing',
							options: {
								'insert-only': 'Insert only (링크만 삽입, 기본)',
								'create-note': 'Create note (자동 생성 후 링크)',
								prompt: 'Prompt (매번 확인 — 향후 구현)',
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Price check',
				items: [
					{
						name: 'Aladin 중고가 조회 활성화',
						desc: '"Check used-book price (Aladin)" 명령어를 켭니다. TTB Key 필요, 하루 5,000회 quota 공유.',
						control: { type: 'toggle', key: 'priceCheckEnabled' },
					},
					{
						name: '중고가 결과 노출',
						desc:
							'notice-only: Obsidian Notice로만 표시(볼트 무수정). ' +
							'section: 노트 하단 `## Price Watch`에 timestamped row 누적.',
						control: {
							type: 'dropdown',
							key: 'priceOutputMode',
							options: {
								'notice-only': 'Notice만 (기본)',
								section: 'Price Watch 섹션에 append',
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Duplicates',
				items: [
					{
						name: '중복 노트 처리',
						desc: '검색 결과가 볼트에 이미 있는 책(ISBN 일치)일 때의 기본 동작.',
						control: {
							type: 'dropdown',
							key: 'duplicateAction',
							options: {
								ask: '물어보기 (기본)',
								open: '기존 노트 열기',
								update: '기존 노트 업데이트',
								error: '알림 표시 후 취소',
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Diagnostics',
				items: [
					{
						name: '실패 시 진단 노트 자동 저장',
						desc:
							'Healthcheck·마이그레이션 실패 시 오류 내용을 볼트의 진단 폴더에 저장. ' +
							'API 키 등 secret은 자동 마스킹됩니다.',
						control: { type: 'toggle', key: 'errorDumpEnabled' },
					},
					{
						name: '진단 노트 폴더',
						desc: '오류 dump 노트가 저장될 볼트 상대 경로.',
						control: {
							type: 'text',
							key: 'errorDumpFolder',
							placeholder: '85. References (Book Search)/_errors',
						},
					},
				],
			},
		];
	}
}
