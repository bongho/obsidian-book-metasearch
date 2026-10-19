/**
 * Plugin settings — persisted via `Plugin.saveData()` to `data.json`.
 *
 * API keys are no longer among them. Since 1.4.0 the four provider keys live
 * in `app.secretStorage` and `data.json` carries only their ids, so a synced
 * vault no longer carries key material. `planSecretMigration()` below moves
 * older installs over; `redactSecrets()` in `util/error-dump.ts` is what still
 * has to see the values, and it reads them from the keychain.
 */

export type FrontmatterKeyCase =
	| 'as-is'
	| 'camelCase'
	| 'snake_case'
	| 'kebab-case';

export interface BookMetasearchSettings {
	// ── Provider auth ──
	// Ids of entries in `app.secretStorage`, not the key material itself. An
	// empty string means unconfigured, which is the same thing every provider
	// already checks its getter's result for.
	yes24SecretId: string;
	// Aladin's Open API shuts down 2026-10-30 (new keys stopped 2026-09-04).
	// Kept working for users whose key is still valid; removed in v2.0.0.
	aladinSecretId: string;
	kakaoSecretId: string;
	googleBooksSecretId: string; // optional — improves rate limit

	// ── Provider priority for sequential fallback / fanout ordering ──
	priorityOrder: string[];

	// ── Fanout strategy ──
	// 'sequential': try providers in priority order, return first non-empty
	// 'fanout': query every provider in parallel, dedupe by ISBN13, merge results
	searchStrategy: 'sequential' | 'fanout';

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

	// ── Error dump (M0-B) ──
	// When a healthcheck / migration fails, write a redacted diagnostics note
	// to `errorDumpFolder` so the user can attach it to a bug report.
	errorDumpEnabled: boolean;
	errorDumpFolder: string;

	// ── Migration state (M0-C) ──
	// ISO timestamps recording whether the Naver→Aladin migration helper has
	// been completed / dismissed. Used to suppress the "we noticed an anpigon
	// config" banner after the user has acknowledged it.
	migrationCompletedAt: string;
	migrationBannerDismissedAt: string;
	// ISO timestamp of the one-time `priorityOrder` splice that introduced
	// `yes24`. Its presence is what stops the splice from repeating, so a user
	// who deliberately drops yes24 from the order keeps it dropped.
	yes24PriorityMigratedAt: string;
	// ISO timestamp of the one-time move of plaintext API keys into
	// `app.secretStorage`. Stamped even when there was nothing to move, so a
	// user who later clears a secret does not get the old plaintext copy
	// resurrected from a `data.json` that still has the field.
	secretsMigratedAt: string;

	// ── Note body auto-fill (M0-D) ──
	// When true, `renderSkeleton` fills the `## Abstract / Description` AUTO
	// block with `book.description` from the provider. `update()` refreshes the
	// same block on demand, preserving any user edits outside the markers.
	autoFillDescription: boolean;
	// Same contract for `## Table of Contents`, with one difference: the
	// heading is written only when the book actually has one. Only YES24
	// supplies it, and only for some titles, so an unconditional heading would
	// leave an empty section on most notes.
	autoFillTableOfContents: boolean;

	// ── Duplicate detection (M1-A) ──
	// What to do when a search result matches an existing book note by ISBN:
	//   'ask'    — prompt via DuplicateModal (default)
	//   'open'   — open the existing note, don't create a new one
	//   'update' — refresh the existing note's frontmatter with the new hit
	//   'error'  — surface a Notice and abort (legacy strict behavior)
	duplicateAction: 'ask' | 'open' | 'update' | 'error';

	// ── Reading Log (M1-B) ──
	// When true, new notes get a `status` frontmatter field and "Mark as
	// wishlist / reading / read" commands become active on book notes. The
	// commands stamp `startedAt` / `finishedAt` YYYY-MM-DD dates automatically
	// on transition into `reading` / `read` (idempotent — existing stamps are
	// preserved).
	readingStatusEnabled: boolean;
	initialStatus: 'wishlist' | 'reading' | 'read';

	// ── Citation insert (M2) ──
	// Format of the wikilink emitted by "Insert book citation at cursor".
	//   'wikilink'       → `[[title]] (author, year)`
	//   'wikilink-alias' → `[[target|author, year — title]]`
	// When the target note does not yet exist in the vault, `citationOnMissing`
	// decides what to do:
	//   'insert-only' → just emit an unresolved wikilink (default; snappy)
	//   'create-note' → create a new note first, then link to it
	//   'prompt'      → ask via a lightweight confirm modal
	citationStyle: 'wikilink' | 'wikilink-alias';
	citationOnMissing: 'insert-only' | 'create-note' | 'prompt';

	// ── Aladin used-price check (M3) ──
	// Opt-in — requires a working TTB Key. When on, "Check used-book price
	// (Aladin)" becomes active on book notes and consumes Aladin quota. Kept
	// off by default so casual users don't hit the 5,000/day rate limit.
	priceCheckEnabled: boolean;
	// Where to surface the result:
	//   'notice-only' → Obsidian Notice (transient, no vault writes)
	//   'section'     → append a `## Price Watch` timestamped row to the note
	priceOutputMode: 'notice-only' | 'section';
}

export const DEFAULT_SETTINGS: BookMetasearchSettings = {
	yes24SecretId: '',
	aladinSecretId: '',
	kakaoSecretId: '',
	googleBooksSecretId: '',
	priorityOrder: ['yes24', 'kakao', 'google', 'openlibrary'],
	searchStrategy: 'sequential',
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
	errorDumpEnabled: true,
	errorDumpFolder: '85. References (Book Search)/_errors',
	migrationCompletedAt: '',
	migrationBannerDismissedAt: '',
	yes24PriorityMigratedAt: '',
	secretsMigratedAt: '',
	autoFillDescription: true,
	autoFillTableOfContents: true,
	duplicateAction: 'ask',
	readingStatusEnabled: true,
	initialStatus: 'wishlist',
	citationStyle: 'wikilink',
	citationOnMissing: 'insert-only',
	priceCheckEnabled: false,
	priceOutputMode: 'notice-only',
};

/**
 * Installs predating the YES24 provider carry a saved `priorityOrder` that
 * names every provider except `yes24` — and a saved value wins over
 * `DEFAULT_SETTINGS` in the shallow merge `loadSettings()` performs. Left
 * alone, `ProviderRegistry.resolveOrdered()` appends the unlisted provider
 * last, so the new Korean primary would sit behind Open Library and, under
 * the default `sequential` strategy, never be reached.
 *
 * Inserted directly ahead of `aladin` so the rest of the user's own ordering
 * survives. Returns the input array unchanged when nothing needs migrating.
 *
 * Runs exactly once, gated on `migratedAt`. `priorityOrder` is a free-text
 * field in the settings tab, so without the stamp a user who removes `yes24`
 * would have it spliced back in on the next load and could never drop it.
 */
export function migratePriorityOrder(
	order: string[],
	migratedAt: string,
): string[] {
	if (migratedAt) return order;
	if (order.includes('yes24')) return order;
	const aladinAt = order.indexOf('aladin');
	const migrated = [...order];
	migrated.splice(aladinAt < 0 ? 0 : aladinAt, 0, 'yes24');
	return migrated;
}

/**
 * The keychain ids `planSecretMigration()` creates. Only starting names: the
 * settings tab lets the user point a field at any entry in the keychain, and
 * that choice overwrites the id in `data.json`.
 *
 * `SecretStorage.setSecret()` throws on anything but lowercase alphanumerics
 * and dashes, so these have to stay in that shape.
 */
export const MIGRATED_SECRET_IDS = {
	yes24SecretId: 'book-metasearch-yes24',
	aladinSecretId: 'book-metasearch-aladin-ttb',
	kakaoSecretId: 'book-metasearch-kakao',
	googleBooksSecretId: 'book-metasearch-google-books',
} as const;

/** Settings fields holding a `secretStorage` id. */
export type SecretIdField = keyof typeof MIGRATED_SECRET_IDS;

/** The fields `data.json` used for key material before 1.4.0. */
export type LegacySecretField =
	| 'yes24ApiKey'
	| 'aladinTtbKey'
	| 'kakaoRestApiKey'
	| 'googleBooksApiKey';

const LEGACY_TO_ID_FIELD: Record<LegacySecretField, SecretIdField> = {
	yes24ApiKey: 'yes24SecretId',
	aladinTtbKey: 'aladinSecretId',
	kakaoRestApiKey: 'kakaoSecretId',
	googleBooksApiKey: 'googleBooksSecretId',
};

export interface SecretMigrationPlan {
	/** `setSecret(id, value)` calls to make. */
	writes: { id: string; value: string }[];
	/** Settings fields to point at the ids just written. */
	ids: Partial<Record<SecretIdField, string>>;
	/** Legacy fields to delete from the settings object before saving. */
	clear: LegacySecretField[];
}

/**
 * Plans the one-time move of plaintext API keys out of `data.json`.
 *
 * Pure on purpose. `SecretStorage` only exists inside a running Obsidian, so
 * the decision of what moves where is kept here where it can be tested, and
 * `main.ts` is left holding nothing but the writes.
 *
 * Returns `null` when there is nothing to do — a stamped install, or a fresh
 * one that never had plaintext keys.
 *
 * `clear` lists a field whenever `data.json` carried it, including when its
 * value was blank or not a string. The caller has to `delete` those keys
 * rather than blank them: `saveData()` writes whatever properties the object
 * carries, and a key that stays in the file is a key that comes back on the
 * next shallow merge.
 */
export function planSecretMigration(
	loaded: Partial<Record<LegacySecretField, unknown>>,
	migratedAt: string,
): SecretMigrationPlan | null {
	if (migratedAt) return null;
	const plan: SecretMigrationPlan = { writes: [], ids: {}, clear: [] };
	const pairs = Object.entries(LEGACY_TO_ID_FIELD) as [
		LegacySecretField,
		SecretIdField,
	][];
	for (const [legacy, idField] of pairs) {
		if (!(legacy in loaded)) continue;
		plan.clear.push(legacy);
		const value = loaded[legacy];
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!trimmed) continue;
		const id = MIGRATED_SECRET_IDS[idField];
		plan.writes.push({ id, value: trimmed });
		plan.ids[idField] = id;
	}
	if (plan.clear.length === 0) return null;
	return plan;
}
