import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';

import {
	ALADIN_API_RETIRED_ON,
	AladinProvider,
	isAladinApiRetired,
	parseUsedList,
} from './aladin';

// The stub in `src/__mocks__/obsidian.ts` throws on `requestUrl` by design, so
// the healthcheck tests below drive it from here instead of hitting Aladin.
vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	requestUrl: vi.fn(),
}));

const mockRequest = vi.mocked(requestUrl);

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

describe('isAladinApiRetired', () => {
	it('is false the day before the shutdown date', () => {
		expect(isAladinApiRetired(new Date(2026, 9, 29, 23, 59, 59))).toBe(
			false,
		);
	});

	it('is true from the start of the shutdown date onward', () => {
		expect(isAladinApiRetired(new Date(2026, 9, 30, 0, 0, 0))).toBe(true);
		expect(isAladinApiRetired(new Date(2027, 0, 1, 12, 0, 0))).toBe(true);
	});

	it('reads the local calendar date rather than the UTC one', () => {
		// Built from local components, so this IS the 30th where the user
		// lives. In KST its ISO date is still 2026-10-29 — the nine-hour gap
		// a toISOString().slice(0, 10) implementation would get wrong.
		const localMidnight = new Date(2026, 9, 30, 0, 0, 0);
		expect(isAladinApiRetired(localMidnight)).toBe(true);
	});

	it('pads single-digit months and days so the string compare holds', () => {
		// '2026-9-30' > '2026-10-30' lexically; '2026-09-30' is not.
		expect(isAladinApiRetired(new Date(2026, 8, 30, 12, 0, 0))).toBe(false);
		expect(isAladinApiRetired(new Date(2026, 9, 5, 12, 0, 0))).toBe(false);
	});

	it('exposes the date the user-facing copy quotes', () => {
		expect(ALADIN_API_RETIRED_ON).toBe('2026-10-30');
	});
});

describe('AladinProvider.healthcheck', () => {
	afterEach(() => {
		vi.useRealTimers();
		mockRequest.mockReset();
	});

	/** A `requestUrl` result carrying an Aladin JSON body. */
	function respond(body: unknown) {
		return {
			status: 200,
			text: JSON.stringify(body),
			headers: {} as Record<string, string>,
			arrayBuffer: new ArrayBuffer(0),
			json: body,
		};
	}

	it('reports the shutdown without spending a request', async () => {
		// Live, the domain answers `errorCode 999` to everyone, which
		// `mapErrorToHealth` can only file as UNKNOWN.
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 30, 0, 0, 0));

		const health = await new AladinProvider(() => 'ttbkey').healthcheck();

		expect(health).toMatchObject({
			ok: false,
			code: 'API_NOT_REGISTERED',
		});
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('says so even when no key is configured, since the key is moot', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 30, 0, 0, 0));

		await expect(new AladinProvider(() => '').healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'API_NOT_REGISTERED',
		});
	});

	it('still reports a missing key while the API was alive', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 29, 12, 0, 0));

		await expect(new AladinProvider(() => '').healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'AUTH_MISSING',
		});
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('still probes the API while it was alive', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 29, 12, 0, 0));
		mockRequest.mockResolvedValue(respond({ item: [] }));

		await expect(
			new AladinProvider(() => 'ttbkey').healthcheck(),
		).resolves.toEqual({ ok: true });
		expect(mockRequest).toHaveBeenCalledTimes(1);
	});

	it('maps a rejected key to AUTH_INVALID while the API was alive', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 29, 12, 0, 0));
		mockRequest.mockResolvedValue(respond({ errorCode: 4, errorMessage: '잘못된 키' }));

		await expect(
			new AladinProvider(() => 'ttbkey').healthcheck(),
		).resolves.toMatchObject({ ok: false, code: 'AUTH_INVALID' });
	});
});
