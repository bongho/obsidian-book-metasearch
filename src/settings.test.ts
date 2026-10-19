import { describe, expect, it } from 'vitest';

import {
	MIGRATED_SECRET_IDS,
	migratePriorityOrder,
	planSecretMigration,
} from './settings';

describe('migratePriorityOrder', () => {
	it('puts yes24 ahead of aladin for an order saved before the provider existed', () => {
		expect(
			migratePriorityOrder(['aladin', 'kakao', 'google', 'openlibrary'], ''),
		).toEqual(['yes24', 'aladin', 'kakao', 'google', 'openlibrary']);
	});

	it('returns the same array when yes24 is already listed', () => {
		const order = ['kakao', 'yes24', 'google'];
		expect(migratePriorityOrder(order, '')).toBe(order);
	});

	it('leaves the order alone once the migration has already run', () => {
		// `priorityOrder` is free text in the settings tab, so a user can drop
		// yes24 on purpose. Re-splicing it would make that choice unstickable.
		const order = ['aladin', 'kakao'];
		expect(migratePriorityOrder(order, '2026-09-21T00:00:00.000Z')).toBe(order);
	});

	it('prepends when the user has dropped aladin from the order', () => {
		expect(migratePriorityOrder(['kakao', 'openlibrary'], '')).toEqual([
			'yes24',
			'kakao',
			'openlibrary',
		]);
	});
});

describe('planSecretMigration', () => {
	it('moves every plaintext key it finds and names the fields to clear', () => {
		const plan = planSecretMigration(
			{
				yes24ApiKey: 'yes24-key',
				aladinTtbKey: 'ttbABCDEF',
				kakaoRestApiKey: 'kakao-key',
				googleBooksApiKey: 'AIzaKey',
			},
			'',
		);
		expect(plan).not.toBeNull();
		expect(plan?.writes).toEqual([
			{ id: MIGRATED_SECRET_IDS.yes24SecretId, value: 'yes24-key' },
			{ id: MIGRATED_SECRET_IDS.aladinSecretId, value: 'ttbABCDEF' },
			{ id: MIGRATED_SECRET_IDS.kakaoSecretId, value: 'kakao-key' },
			{ id: MIGRATED_SECRET_IDS.googleBooksSecretId, value: 'AIzaKey' },
		]);
		expect(plan?.ids).toEqual({
			yes24SecretId: MIGRATED_SECRET_IDS.yes24SecretId,
			aladinSecretId: MIGRATED_SECRET_IDS.aladinSecretId,
			kakaoSecretId: MIGRATED_SECRET_IDS.kakaoSecretId,
			googleBooksSecretId: MIGRATED_SECRET_IDS.googleBooksSecretId,
		});
		expect(plan?.clear).toEqual([
			'yes24ApiKey',
			'aladinTtbKey',
			'kakaoRestApiKey',
			'googleBooksApiKey',
		]);
	});

	it('clears a blank legacy field without writing a secret for it', () => {
		// An empty string is not key material, but the field still has to leave
		// data.json — otherwise the next shallow merge puts it back.
		const plan = planSecretMigration({ yes24ApiKey: '', aladinTtbKey: '   ' }, '');
		expect(plan?.writes).toEqual([]);
		expect(plan?.clear).toEqual(['yes24ApiKey', 'aladinTtbKey']);
	});

	it('trims surrounding whitespace off the key it stores', () => {
		const plan = planSecretMigration({ aladinTtbKey: '  ttbABCDEF\n' }, '');
		expect(plan?.writes).toEqual([
			{ id: MIGRATED_SECRET_IDS.aladinSecretId, value: 'ttbABCDEF' },
		]);
	});

	it('ignores a legacy field whose stored value is not a string', () => {
		const plan = planSecretMigration({ yes24ApiKey: 42 }, '');
		expect(plan?.writes).toEqual([]);
		expect(plan?.clear).toEqual(['yes24ApiKey']);
	});

	it('returns null once the migration has been stamped', () => {
		expect(
			planSecretMigration({ yes24ApiKey: 'yes24-key' }, '2026-10-19T00:00:00.000Z'),
		).toBeNull();
	});

	it('returns null for a fresh install that never had plaintext keys', () => {
		expect(planSecretMigration({}, '')).toBeNull();
	});

	it('only uses ids SecretStorage accepts (lowercase, digits, dashes)', () => {
		for (const id of Object.values(MIGRATED_SECRET_IDS)) {
			expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});
});
