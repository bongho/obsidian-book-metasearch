import type { SettingDefinitionItem } from 'obsidian';

import type { BookMetasearchSettings } from '../settings';
import { LOCALES } from './settings-tab';

/**
 * Declarative counterpart of `BookMetasearchSettingTab.display()` (M5, v1.2.0).
 *
 * Obsidian 1.13+ indexes the array returned by `PluginSettingTab.getSettingDefinitions()`
 * for its cross-plugin Settings search. Any control not listed here still
 * renders via `display()` — the two code paths run in parallel — but it won't
 * surface in the search bar.
 *
 * Design notes:
 *  - The `key` on each control **must** exactly match a `BookMetasearchSettings`
 *    field name. The framework's default `getControlValue` / `setControlValue`
 *    then reads/writes `plugin.settings[key]` for us — no glue code needed.
 *  - Non-value UI (healthcheck buttons, "Open migration helper", API-key
 *    provisioning links) is deliberately excluded — those are actions, not
 *    persisted settings, and belong only in `display()`.
 *  - `priorityOrder` is excluded — it's an array of provider ids best edited
 *    via a bespoke UI, not a single text/dropdown control.
 *  - `migrationCompletedAt` / `migrationBannerDismissedAt` are internal state,
 *    not user-facing settings.
 *  - `aliases` widens search recall (e.g. English keywords for Korean labels).
 *
 * Section order mirrors `display()` for consistency; if you reorder there,
 * mirror the change here.
 */
export function buildSettingDefinitions(): SettingDefinitionItem[] {
	// Keys typed against BookMetasearchSettings so the compiler catches typos
	// or renames. The `satisfies` clause below enforces the union.
	type SettingKey = keyof BookMetasearchSettings;
	const k = <T extends SettingKey>(key: T): T => key;

	const localeOptions: Record<string, string> = Object.fromEntries(
		LOCALES.map((l) => [l.code, `${l.label} (${l.code})`]),
	);

	return [
		{
			type: 'group',
			heading: 'Providers',
			items: [
				{
					name: 'Aladin TTB Key',
					desc: '알라딘 오픈 API 키. 발급 페이지에서 무료로 받을 수 있습니다.',
					aliases: ['ttb', 'aladin', 'api key'],
					control: {
						type: 'text',
						key: k('aladinTtbKey'),
						placeholder: 'ttbXXXXXXXXX',
					},
				},
				{
					name: 'Kakao REST API Key',
					desc: 'Kakao Developers 애플리케이션의 REST API 키. 즉시 발급.',
					aliases: ['kakao', 'rest', 'api key'],
					control: {
						type: 'text',
						key: k('kakaoRestApiKey'),
						placeholder: 'a1b2c3d4...',
					},
				},
				{
					name: 'Google Books API Key',
					desc: '선택 사항 — 없어도 검색은 되지만 rate limit이 낮습니다.',
					aliases: ['google', 'books', 'api key'],
					control: {
						type: 'text',
						key: k('googleBooksApiKey'),
						placeholder: 'AIza...',
					},
				},
				{
					name: '검색 전략',
					desc:
						'sequential: 우선순위대로 시도, 결과 있는 첫 provider에서 멈춤. ' +
						'fanout: 모든 provider에 병렬 질의 후 ISBN13으로 중복 제거.',
					aliases: ['strategy', 'sequential', 'fanout', 'parallel'],
					control: {
						type: 'dropdown',
						key: k('searchStrategy'),
						options: {
							sequential: 'Sequential (fallback)',
							fanout: 'Fanout (parallel + dedupe)',
						},
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
					aliases: ['notes', 'folder', 'path'],
					control: {
						type: 'text',
						key: k('notesFolder'),
						placeholder: '85. References (Book Search)',
					},
				},
				{
					name: '파일명 포맷',
					desc:
						'변수: {{title}} {{subtitle}} {{author}} {{publisher}} {{publishYear}} {{isbn}}',
					aliases: ['filename', 'format', 'template'],
					control: {
						type: 'text',
						key: k('fileNameFormat'),
						placeholder: '{{title}} - {{author}}',
					},
				},
				{
					name: '노트 생성 후 자동 열기',
					desc: '검색 결과 선택 시 새 탭에서 노트를 즉시 엽니다.',
					aliases: ['open', 'note', 'auto'],
					control: { type: 'toggle', key: k('openNoteAfterCreate') },
				},
				{
					name: '템플릿 파일',
					desc:
						'볼트 상대 경로의 markdown 템플릿. {{variable}} 치환. 비우면 기본 skeleton 사용.',
					aliases: ['template', 'file'],
					control: {
						type: 'text',
						key: k('templateFile'),
						placeholder: '90. Settings/Templates/Book.md',
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
						'끄면 신규 노트에 사용자 정의 프론트매터(아래)만 emit됩니다.',
					aliases: ['frontmatter', 'default', 'yaml'],
					control: { type: 'toggle', key: k('useDefaultFrontmatter') },
				},
				{
					name: '기본 프론트매터 필드명 형식',
					desc: 'as-is: 봉호 볼트 매칭 · camelCase: anpigon 기본 · snake_case · kebab-case',
					aliases: ['case', 'frontmatter', 'key'],
					control: {
						type: 'dropdown',
						key: k('defaultFrontmatterKeyType'),
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
					desc:
						'기본 프론트매터 뒤에 추가되는 YAML fragment. {{variable}} 치환 지원.',
					aliases: ['frontmatter', 'additional', 'yaml', 'custom'],
					control: {
						type: 'textarea',
						key: k('frontmatterAdditional'),
						placeholder: 'my_field: {{publisher}}\nrating: 0',
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
					aliases: ['cover', 'image', 'folder'],
					control: {
						type: 'text',
						key: k('coverFolder'),
						placeholder: '80. References/Assets/Images',
					},
				},
				{
					name: '커버 이미지 로컬 저장',
					desc: '노트 생성 시 커버 이미지를 볼트에 다운로드합니다.',
					aliases: ['cover', 'save', 'download'],
					control: { type: 'toggle', key: k('enableCoverImageSave') },
				},
				{
					name: '커버 이미지 edge curl 효과',
					desc: '저장된 커버 이미지에 종이접힘 효과.',
					aliases: ['cover', 'edge', 'curl'],
					control: { type: 'toggle', key: k('enableCoverImageEdgeCurl') },
				},
			],
		},
		{
			type: 'group',
			heading: 'Search UI',
			items: [
				{
					name: '검색 결과에 커버 이미지 표시',
					desc: 'SuggestModal 항목에 커버 썸네일을 렌더링.',
					aliases: ['cover', 'thumbnail', 'search'],
					control: { type: 'toggle', key: k('showCoverInSearch') },
				},
			],
		},
		{
			type: 'group',
			heading: 'Locale',
			items: [
				{
					name: '기본 검색 언어',
					desc: 'Google Books langRestrict, Kakao 검색 등에서 사용될 기본 로케일.',
					aliases: ['locale', 'language', '언어'],
					control: {
						type: 'dropdown',
						key: k('localePreference'),
						options: localeOptions,
					},
				},
				{
					name: '검색 시 언어 묻기',
					desc: '매 검색마다 언어를 선택하는 프롬프트를 띄웁니다.',
					aliases: ['locale', 'prompt', 'ask'],
					control: { type: 'toggle', key: k('askForLocale') },
				},
			],
		},
		{
			type: 'group',
			heading: 'Attribution',
			items: [
				{
					name: 'Aladin 크레딧 링크 삽입',
					desc:
						'생성된 노트 하단에 "Book DB by Aladin" 링크 삽입. Aladin OpenAPI 관행 유지 권장.',
					aliases: ['aladin', 'credit', 'attribution'],
					control: { type: 'toggle', key: k('aladinCreditEnabled') },
				},
			],
		},
		{
			type: 'group',
			heading: 'Reading Log',
			items: [
				{
					name: '독서 상태 필드 활성화',
					desc:
						'신규 노트에 status 필드를 넣고 "Mark as wishlist/reading/read" 명령어를 활성화.',
					aliases: ['reading', 'status', 'log', 'wishlist'],
					control: { type: 'toggle', key: k('readingStatusEnabled') },
				},
				{
					name: '신규 노트 초기 상태',
					desc: 'Search books로 만든 새 노트의 기본 status 값.',
					aliases: ['status', 'initial', 'wishlist', 'reading', 'read'],
					control: {
						type: 'dropdown',
						key: k('initialStatus'),
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
					desc: '"Insert book citation at cursor"가 커서에 삽입할 wikilink 형식.',
					aliases: ['citation', 'wikilink', 'format', 'insert'],
					control: {
						type: 'dropdown',
						key: k('citationStyle'),
						options: {
							wikilink: '[[제목]] (저자, 연도)',
							'wikilink-alias': '[[대상|저자, 연도 — 제목]]',
						},
					},
				},
				{
					name: '노트 부재 시 동작',
					desc:
						'인용 대상 책 노트가 볼트에 없을 때. insert-only는 미해결 링크를 그냥 삽입.',
					aliases: ['citation', 'missing', 'unresolved', 'create'],
					control: {
						type: 'dropdown',
						key: k('citationOnMissing'),
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
			heading: 'Duplicates',
			items: [
				{
					name: '중복 노트 처리',
					desc: '검색 결과가 볼트에 이미 있는 책(ISBN 일치)일 때의 기본 동작.',
					aliases: ['duplicate', 'isbn', 'existing'],
					control: {
						type: 'dropdown',
						key: k('duplicateAction'),
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
			heading: 'Price Check',
			items: [
				{
					name: 'Aladin 중고가 조회 활성화',
					desc:
						'"Check used-book price (Aladin)" 명령어를 켭니다. TTB Key 필요, 5,000회/일 quota 공유.',
					aliases: ['price', 'used', 'aladin', 'quota'],
					control: { type: 'toggle', key: k('priceCheckEnabled') },
				},
				{
					name: '중고가 결과 노출',
					desc:
						'notice-only: Obsidian Notice로만 표시. section: 노트 하단 Price Watch에 append.',
					aliases: ['price', 'output', 'notice', 'section'],
					control: {
						type: 'dropdown',
						key: k('priceOutputMode'),
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
			heading: 'Diagnostics',
			items: [
				{
					name: '실패 시 진단 노트 자동 저장',
					desc:
						'Healthcheck·마이그레이션 실패 시 오류 내용을 진단 폴더에 저장. secret 자동 마스킹.',
					aliases: ['error', 'dump', 'diagnostics', 'healthcheck'],
					control: { type: 'toggle', key: k('errorDumpEnabled') },
				},
				{
					name: '진단 노트 폴더',
					desc: '오류 dump 노트가 저장될 볼트 상대 경로.',
					aliases: ['error', 'dump', 'folder'],
					control: {
						type: 'text',
						key: k('errorDumpFolder'),
						placeholder: '85. References (Book Search)/_errors',
					},
				},
			],
		},
	];
}
