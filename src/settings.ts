/**
 * Plugin settings — persisted via `Plugin.saveData()` to `data.json`.
 *
 * ⚠️ `data.json` contains user secrets (Aladin TTB Key etc.) and is gitignored
 * in the plugin repo. When a user files a bug report, redact `aladinTtbKey`
 * before sharing.
 */

export type FrontmatterKeyCase =
	| 'as-is'
	| 'camelCase'
	| 'snake_case'
	| 'kebab-case';

export interface BookMetasearchSettings {
	// ── Provider auth (S1: Aladin only; S2+: Kakao, Google Books) ──
	aladinTtbKey: string;

	// ── Provider priority for sequential fallback / fanout ordering ──
	priorityOrder: string[];

	// ── Note & cover storage — bongho vault defaults ──
	notesFolder: string;
	coverFolder: string;

	// ── Template file (optional) ──
	// Vault-relative path to a markdown template. When set, its contents are
	// used as the note body; {{variables}} are substituted with book data.
	// Templater `<% ... %>` blocks are preserved for the Templater plugin to
	// execute post-creation. Leave empty to use the built-in minimal skeleton.
	templateFile: string;

	// ── Filename format ──
	// Template variables: {{title}}, {{subtitle}}, {{author}}, {{publisher}},
	// {{publishYear}}, {{isbn}} (isbn13 preferred, falls back to isbn10).
	fileNameFormat: string;

	// ── UX toggles (modeled on anpigon Book Search options) ──
	openNoteAfterCreate: boolean;
	enableCoverImageSave: boolean; // W3-onward: actually downloads
	showCoverInSearch: boolean; // S2: renders thumbnail in SuggestModal
	enableCoverImageEdgeCurl: boolean; // S4: cosmetic edge curl on saved covers

	// ── Attribution ──
	aladinCreditEnabled: boolean;

	// ── Locale ──
	localePreference: string; // 'ko' | 'en' | 'ja' | ...
	askForLocale: boolean; // Prompt for locale on each search

	// ── Frontmatter customization (anpigon parity) ──
	// Include the built-in default frontmatter block (type, tags, title, ...)
	// when creating a note. Turn off if you only want your custom frontmatter.
	useDefaultFrontmatter: boolean;
	// Case convention for default frontmatter keys.
	// 'as-is'      → localCover / provider_url  (matches bongho vault schema)
	// 'camelCase'  → localCover / providerUrl   (anpigon default)
	// 'snake_case' → local_cover / provider_url
	// 'kebab-case' → local-cover / provider-url
	// Default 'as-is' matches the existing bongho vault schema exactly.
	defaultFrontmatterKeyType: FrontmatterKeyCase;
	// Extra YAML fragment appended after the default frontmatter (if enabled).
	// {{variables}} are substituted. Example:
	//   my_field: {{publisher}}
	//   rating: 0
	frontmatterAdditional: string;
}

export const DEFAULT_SETTINGS: BookMetasearchSettings = {
	aladinTtbKey: '',
	priorityOrder: ['aladin'],
	notesFolder: '85. References (Book Search)',
	coverFolder: '80. References/Assets/Images',
	templateFile: '',
	fileNameFormat: '{{title}} - {{author}}',
	openNoteAfterCreate: true,
	enableCoverImageSave: false,
	showCoverInSearch: false,
	enableCoverImageEdgeCurl: false,
	aladinCreditEnabled: true,
	localePreference: 'ko',
	askForLocale: false,
	useDefaultFrontmatter: true,
	defaultFrontmatterKeyType: 'as-is',
	frontmatterAdditional: '',
};
