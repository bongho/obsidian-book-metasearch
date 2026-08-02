import type { App } from 'obsidian';

/**
 * Anpigon `obsidian-book-search-plugin` settings we care about for migration.
 * Extracted from the live vault's `data.json` — fields we don't consume are
 * kept as `unknown` to prevent accidental use.
 *
 * NOTE: We never write back to this file. The user's anpigon install stays
 * intact through S1 so the migration banner remains reproducible for testing.
 */
export interface AnpigonSettings {
	serviceProvider?: string; // "naver" | "google" | "kakao" — trigger key
	naverClientId?: string; // presence signals secret hygiene concern
	naverClientSecret?: string;
	templateFile?: string; // hint for note-writer template continuity
	coverImagePath?: string; // hint for coverFolder default carry-over
	localePreference?: string;
}

const ANPIGON_PLUGIN_ID = 'obsidian-book-search-plugin';

function anpigonDataPath(app: App): string {
	return `${app.vault.configDir}/plugins/${ANPIGON_PLUGIN_ID}/data.json`;
}

/**
 * Read anpigon's persisted settings. Returns null in every failure mode
 * (no file, no permission, invalid JSON) — the migration UX simply won't
 * trigger. Silent failure is intentional.
 */
export async function detectAnpigon(
	app: App,
): Promise<AnpigonSettings | null> {
	try {
		const path = anpigonDataPath(app);
		const exists = await app.vault.adapter.exists(path);
		if (!exists) return null;
		const raw = await app.vault.adapter.read(path);
		const parsed = JSON.parse(raw) as unknown;
		if (!isRecord(parsed)) return null;
		return parsed;
	} catch (e) {
		console.warn('[book-metasearch] anpigon detection failed', e);
		return null;
	}
}

/** True when the user is stranded on Naver (which EOL'd on 2026-08-01). */
export function isNaverStuck(s: AnpigonSettings | null): boolean {
	return !!s && s.serviceProvider === 'naver';
}

/** True when leftover Naver credentials are on disk despite EOL. */
export function hasNaverCredentials(s: AnpigonSettings | null): boolean {
	if (!s) return false;
	return !!(s.naverClientId || s.naverClientSecret);
}

/**
 * Fields we can safely propose to reuse in the new plugin's settings without
 * the user re-typing them.
 */
export interface AnpigonMigrationHints {
	coverFolder?: string;
	locale?: string;
	templateFile?: string;
}

export function extractMigrationHints(
	s: AnpigonSettings,
): AnpigonMigrationHints {
	return {
		coverFolder: s.coverImagePath || undefined,
		locale: s.localePreference || undefined,
		templateFile: s.templateFile || undefined,
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}
