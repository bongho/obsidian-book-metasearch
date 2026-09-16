import { describe, expect, it } from 'vitest';

import { migratePriorityOrder } from './settings';

describe('migratePriorityOrder', () => {
	it('puts yes24 ahead of aladin for an order saved before the provider existed', () => {
		expect(
			migratePriorityOrder(['aladin', 'kakao', 'google', 'openlibrary']),
		).toEqual(['yes24', 'aladin', 'kakao', 'google', 'openlibrary']);
	});

	it('returns the same array when yes24 is already listed', () => {
		const order = ['kakao', 'yes24', 'google'];
		expect(migratePriorityOrder(order)).toBe(order);
	});

	it('prepends when the user has dropped aladin from the order', () => {
		expect(migratePriorityOrder(['kakao', 'openlibrary'])).toEqual([
			'yes24',
			'kakao',
			'openlibrary',
		]);
	});
});
