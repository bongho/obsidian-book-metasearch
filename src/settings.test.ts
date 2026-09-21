import { describe, expect, it } from 'vitest';

import { migratePriorityOrder } from './settings';

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
