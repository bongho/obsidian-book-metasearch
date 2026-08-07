import { describe, expect, it } from 'vitest';

import { parseUsedList } from './aladin';

const FIXED_NOW = new Date('2026-08-07T12:34:56.000Z');

describe('parseUsedList', () => {
	it('returns [] for undefined / empty usedList payload', () => {
		expect(parseUsedList(undefined, 'aladin', FIXED_NOW)).toEqual([]);
		expect(parseUsedList({}, 'aladin', FIXED_NOW)).toEqual([]);
	});

	it('emits a quote per non-empty bucket, sorted-agnostic', () => {
		const quotes = parseUsedList(
			{
				aladinUsed: {
					itemCount: 3,
					minPrice: 5000,
					link: 'https://aladin.co.kr/used/A',
				},
				userUsed: { itemCount: 12, minPrice: 3500 },
				spaceUsed: { itemCount: 0, minPrice: 0 },
			},
			'aladin',
			FIXED_NOW,
		);
		expect(quotes).toHaveLength(2);
		expect(quotes[0]).toEqual({
			provider: 'aladin',
			condition: 'used-good',
			priceKrw: 5000,
			availability: 'in-stock',
			link: 'https://aladin.co.kr/used/A',
			fetchedAt: FIXED_NOW.toISOString(),
		});
		expect(quotes[1]?.condition).toBe('used-fair');
		expect(quotes[1]?.priceKrw).toBe(3500);
	});

	it('drops buckets with zero count or zero price (avoid ghost listings)', () => {
		const quotes = parseUsedList(
			{
				aladinUsed: { itemCount: 0, minPrice: 5000 }, // ghost
				userUsed: { itemCount: 1, minPrice: 0 }, // ghost
			},
			'aladin',
			FIXED_NOW,
		);
		expect(quotes).toEqual([]);
	});

	it('handles missing link field gracefully', () => {
		const quotes = parseUsedList(
			{ aladinUsed: { itemCount: 1, minPrice: 4000 } },
			'aladin',
			FIXED_NOW,
		);
		expect(quotes).toHaveLength(1);
		expect(quotes[0]?.link).toBeUndefined();
	});
});
