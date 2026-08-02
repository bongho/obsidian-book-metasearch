/**
 * Plugin settings — persisted via `Plugin.saveData()` to `data.json`.
 *
 * ⚠️ `data.json` contains user secrets (Aladin TTB Key etc.) and is gitignored
 * in the plugin repo. When a user files a bug report, redact `aladinTtbKey`
 * before sharing.
 */
export interface BookMetasearchSettings {
	// ── Provider auth (S1: Aladin only; S2+: Kakao, Google Books) ──
	aladinTtbKey: string;

	// ── Provider priority for sequential fallback / fanout ordering ──
	// S1 default: ['aladin']. S2+: ['aladin', 'kakao', 'google', 'openlibrary'].
	priorityOrder: string[];

	// ── Note & cover storage — bongho vault defaults ──
	notesFolder: string;
	coverFolder: string;

	// ── Filename format ──
	// Template variables: {{title}}, {{subtitle}}, {{author}}, {{publisher}},
	// {{publishYear}}, {{isbn}} (isbn13 preferred, falls back to isbn10).
	// Default matches bongho vault convention.
	fileNameFormat: string;

	// ── UX toggles (modeled on anpigon Book Search options for familiarity) ──
	// Open the newly created note in a new leaf right after creation.
	openNoteAfterCreate: boolean;
	// Download and save cover images locally (S1: URL stored, actual binary
	// download in S4). Toggle exposed now so users can opt out early.
	enableCoverImageSave: boolean;
	// Render cover thumbnails inside the SuggestModal (S1: not yet — S2).
	showCoverInSearch: boolean;

	// ── Attribution (Aladin ToS requires linking result → aladin.co.kr) ──
	aladinCreditEnabled: boolean;
}

export const DEFAULT_SETTINGS: BookMetasearchSettings = {
	aladinTtbKey: '',
	priorityOrder: ['aladin'],
	notesFolder: '85. References (Book Search)',
	coverFolder: '80. References/Assets/Images',
	fileNameFormat: '{{title}} - {{author}}',
	openNoteAfterCreate: true,
	enableCoverImageSave: false,
	showCoverInSearch: false,
	aladinCreditEnabled: true,
};
