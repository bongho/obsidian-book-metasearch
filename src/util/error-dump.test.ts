import { describe, expect, it } from 'vitest';

import { redactSecrets } from './error-dump';
import type { BookMetasearchSettings } from '../settings';

const baseSettings: BookMetasearchSettings = {
	aladinTtbKey: 'ttbXYZabcdef1234',
	kakaoRestApiKey: 'kakao-rest-key-98765',
	googleBooksApiKey: 'AIzaSYSTEMBookLongKey',
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
	autoFillDescription: true,
	duplicateAction: 'ask',
	readingStatusEnabled: true,
	initialStatus: 'wishlist',
	citationStyle: 'wikilink',
	citationOnMissing: 'insert-only',
	priceCheckEnabled: false,
	priceOutputMode: 'notice-only',
};

describe('redactSecrets', () => {
	it('masks known secret fields by name convention (*Key/*Token/*Secret/*Password)', () => {
		const text = 'TTB=ttbXYZabcdef1234 KAKAO=kakao-rest-key-98765';
		const out = redactSecrets(text, baseSettings);
		expect(out).not.toContain('ttbXYZabcdef1234');
		expect(out).not.toContain('kakao-rest-key-98765');
		expect(out).toContain('***REDACTED***');
	});

	it('skips very short values to avoid false positives (< 6 chars)', () => {
		const settings = { ...baseSettings, aladinTtbKey: 'ttb' };
		const text = 'The word "ttb" appears here';
		const out = redactSecrets(text, settings);
		expect(out).toBe(text);
	});

	it('escapes regex metacharacters in secrets safely', () => {
		const settings = { ...baseSettings, aladinTtbKey: 'ttb.abc$def+xyz' };
		const text = 'key=ttb.abc$def+xyz end';
		const out = redactSecrets(text, settings);
		expect(out).toBe('key=***REDACTED*** end');
	});

	it('leaves non-secret text untouched', () => {
		const text = 'no secrets here';
		expect(redactSecrets(text, baseSettings)).toBe(text);
	});
});
