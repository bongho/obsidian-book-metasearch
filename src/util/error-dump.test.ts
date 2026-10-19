import { describe, expect, it } from 'vitest';

import type { App } from 'obsidian';

import { collectSecretValues, redactSecrets } from './error-dump';
import type { BookMetasearchSettings } from '../settings';

const baseSettings: BookMetasearchSettings = {
	yes24SecretId: 'book-metasearch-yes24',
	aladinSecretId: 'book-metasearch-aladin-ttb',
	kakaoSecretId: 'book-metasearch-kakao',
	googleBooksSecretId: 'book-metasearch-google-books',
	priorityOrder: [],
	searchStrategy: 'sequential',
	notesFolder: '',
	coverFolder: '',
	templateFile: '',
	fileNameFormat: '',
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
	errorDumpFolder: '',
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

describe('redactSecrets', () => {
	// Since 1.4.0 the keys live in `app.secretStorage`, so the values arrive as
	// the third argument rather than being readable off `settings`.
	const KEYCHAIN = [
		'yes24-api-key-13579',
		'ttbXYZabcdef1234',
		'kakao-rest-key-98765',
	];

	it('masks the key material read out of the keychain', () => {
		const text =
			'YES24=yes24-api-key-13579 TTB=ttbXYZabcdef1234 KAKAO=kakao-rest-key-98765';
		const out = redactSecrets(text, baseSettings, KEYCHAIN);
		expect(out).not.toContain('yes24-api-key-13579');
		expect(out).not.toContain('ttbXYZabcdef1234');
		expect(out).not.toContain('kakao-rest-key-98765');
		expect(out).toContain('***REDACTED***');
	});

	it('leaves the secret ids themselves visible', () => {
		// They are not secret, and seeing which entry a broken provider points
		// at is most of the value of the dump.
		const text = 'configured=book-metasearch-yes24';
		expect(redactSecrets(text, baseSettings, KEYCHAIN)).toBe(text);
	});

	it('still masks a plaintext field left on settings by name convention', () => {
		// The name-suffix net survives the migration so that a future field
		// holding key material is covered without anyone remembering to wire it
		// into the keychain reader.
		const settings = {
			...baseSettings,
			someFutureToken: 'super-secret-token',
		} as unknown as BookMetasearchSettings;
		const out = redactSecrets('t=super-secret-token', settings);
		expect(out).toBe('t=***REDACTED***');
	});

	it('skips very short values to avoid false positives (< 6 chars)', () => {
		const text = 'The word "ttb" appears here';
		expect(redactSecrets(text, baseSettings, ['ttb'])).toBe(text);
	});

	it('escapes regex metacharacters in secrets safely', () => {
		const text = 'key=ttb.abc$def+xyz end';
		const out = redactSecrets(text, baseSettings, ['ttb.abc$def+xyz']);
		expect(out).toBe('key=***REDACTED*** end');
	});

	it('leaves non-secret text untouched', () => {
		const text = 'no secrets here';
		expect(redactSecrets(text, baseSettings, KEYCHAIN)).toBe(text);
	});
});

describe('collectSecretValues', () => {
	/** Just enough of `App` for the keychain read under test. */
	function appWith(entries: Record<string, string>): App {
		return {
			secretStorage: {
				getSecret: (id: string) => entries[id] ?? null,
			},
		} as unknown as App;
	}

	it('reads only the ids this plugin has configured', () => {
		const app = appWith({
			'book-metasearch-yes24': 'yes24-value',
			'book-metasearch-aladin-ttb': 'ttb-value',
			'some-other-plugin': 'not-ours',
		});
		const values = collectSecretValues(app, baseSettings);
		expect(values).toContain('yes24-value');
		expect(values).toContain('ttb-value');
		expect(values).not.toContain('not-ours');
	});

	it('skips unconfigured fields and absent entries', () => {
		const settings = { ...baseSettings, aladinSecretId: '' };
		const values = collectSecretValues(appWith({}), settings);
		expect(values).toEqual([]);
	});

	it('never throws, so a dump is not lost to a broken keychain', () => {
		const app = {
			secretStorage: {
				getSecret: () => {
					throw new Error('keychain unavailable');
				},
			},
		} as unknown as App;
		expect(() => collectSecretValues(app, baseSettings)).not.toThrow();
		expect(collectSecretValues(app, baseSettings)).toEqual([]);
	});
});
