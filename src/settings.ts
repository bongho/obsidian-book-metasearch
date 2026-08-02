/**
 * Plugin settings — persisted via `Plugin.saveData()` to `data.json`.
 *
 * ⚠️ `data.json` contains user secrets (Aladin TTB Key etc.) and is gitignored
 * in the plugin repo. When a user files a bug report, redact `aladinTtbKey`
 * before sharing.
 */
export interface BookMetasearchSettings {
	// Provider auth (S1: Aladin only; S2+: Kakao, Google Books)
	aladinTtbKey: string;

	// Provider priority for sequential fallback / fanout ordering
	// S1 default: ['aladin']. S2+: ['aladin', 'kakao', 'google', 'openlibrary'].
	priorityOrder: string[];

	// Note & cover storage — bongho vault defaults
	notesFolder: string;
	coverFolder: string;

	// Aladin credit link at note footer (Aladin ToS requires linking result → aladin.co.kr)
	aladinCreditEnabled: boolean;

	// Migration state
	// Set once user has dismissed / completed the Naver EOL migration modal.
	// Kept as ISO date string; null means "never shown or dismissed".
	migrationCompletedAt: string | null;
}

export const DEFAULT_SETTINGS: BookMetasearchSettings = {
	aladinTtbKey: '',
	priorityOrder: ['aladin'],
	notesFolder: '85. References (Book Search)',
	coverFolder: '80. References/Assets/Images',
	aladinCreditEnabled: true,
	migrationCompletedAt: null,
};
