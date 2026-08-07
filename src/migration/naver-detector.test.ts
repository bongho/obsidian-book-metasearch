import { describe, expect, it } from 'vitest';

import type { AnpigonSettings } from './naver-detector';
import { shouldShowMigrationBanner } from './naver-detector';

const stuck: AnpigonSettings = { serviceProvider: 'naver' };
const migrated: AnpigonSettings = { serviceProvider: 'aladin' };
const empty = { migrationCompletedAt: '', migrationBannerDismissedAt: '' };

describe('shouldShowMigrationBanner', () => {
	it('shows when anpigon is stuck on Naver and no completion/dismissal', () => {
		expect(shouldShowMigrationBanner(stuck, empty)).toBe(true);
	});

	it('hides when anpigon is not detected at all', () => {
		expect(shouldShowMigrationBanner(null, empty)).toBe(false);
	});

	it('hides when anpigon has already switched to a non-Naver provider', () => {
		expect(shouldShowMigrationBanner(migrated, empty)).toBe(false);
	});

	it('hides once migration is completed', () => {
		expect(
			shouldShowMigrationBanner(stuck, {
				migrationCompletedAt: '2026-08-07T00:00:00.000Z',
				migrationBannerDismissedAt: '',
			}),
		).toBe(false);
	});

	it('hides once the user has dismissed the banner ("나중에")', () => {
		expect(
			shouldShowMigrationBanner(stuck, {
				migrationCompletedAt: '',
				migrationBannerDismissedAt: '2026-08-07T00:00:00.000Z',
			}),
		).toBe(false);
	});

	it('honors either flag independently (dismissed wins over stuck)', () => {
		expect(
			shouldShowMigrationBanner(stuck, {
				migrationCompletedAt: '',
				migrationBannerDismissedAt: '2026-08-01',
			}),
		).toBe(false);
	});
});
