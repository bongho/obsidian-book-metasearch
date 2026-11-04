import { describe, expect, it } from 'vitest';

import { ProviderRegistry } from './registry';
import type { Book, BookProvider } from './base';
import { ProviderError } from './base';

function book(title: string, provider: string): Book {
	return { title, authors: [], provider };
}

/**
 * A provider that answers `searchByQuery` with a fixed outcome and records
 * that it was asked. Anything the strategies do not touch throws, so a test
 * reaching for it fails loudly instead of asserting on a silent stub.
 */
function fakeProvider(
	id: string,
	outcome: { books?: Book[]; fails?: string },
	asked: string[] = [],
): BookProvider {
	return {
		id,
		displayName: id,
		requiresAuth: false,
		healthcheck: () => {
			throw new Error('not part of these tests');
		},
		searchByISBN: () => {
			throw new Error('not part of these tests');
		},
		searchByQuery: async () => {
			asked.push(id);
			if (outcome.fails) {
				throw new ProviderError(id, 'AUTH_INVALID', outcome.fails);
			}
			return outcome.books ?? [];
		},
	};
}

function registryOf(...providers: BookProvider[]): ProviderRegistry {
	const registry = new ProviderRegistry();
	for (const p of providers) registry.register(p);
	return registry;
}

const ORDER = ['a', 'b', 'c'];

describe('ProviderRegistry.sequential', () => {
	it('stops at the first provider with results', async () => {
		const asked: string[] = [];
		const results = await registryOf(
			fakeProvider('a', { books: [] }, asked),
			fakeProvider('b', { books: [book('from b', 'b')] }, asked),
			fakeProvider('c', { books: [book('from c', 'c')] }, asked),
		).sequential('q', {}, ORDER);

		expect(results.map((r) => r.providerId)).toEqual(['a', 'b']);
		expect(results.flatMap((r) => r.books)).toHaveLength(1);
		// The provider after the hit is never asked.
		expect(asked).toEqual(['a', 'b']);
	});

	it('carries a failed provider out instead of dropping it', async () => {
		// Without this the caller cannot tell an expired key from a book
		// nobody stocks.
		const results = await registryOf(
			fakeProvider('a', { fails: 'API Key가 만료되었습니다.' }),
			fakeProvider('b', { books: [book('from b', 'b')] }),
		).sequential('q', {}, ORDER);

		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({ providerId: 'a', books: [] });
		expect(results[0]?.error).toContain('API Key가 만료되었습니다.');
		expect(results[1]?.error).toBeUndefined();
	});

	it('reports every provider when they all fail', async () => {
		const results = await registryOf(
			fakeProvider('a', { fails: 'dead' }),
			fakeProvider('b', { fails: 'also dead' }),
		).sequential('q', {}, ORDER);

		expect(results.map((r) => r.providerId)).toEqual(['a', 'b']);
		expect(results.every((r) => r.error)).toBe(true);
		expect(results.flatMap((r) => r.books)).toEqual([]);
	});

	it('separates an empty answer from a failure', async () => {
		const results = await registryOf(
			fakeProvider('a', { books: [] }),
			fakeProvider('b', { books: [] }),
		).sequential('q', {}, ORDER);

		expect(results).toHaveLength(2);
		expect(results.some((r) => r.error)).toBe(false);
	});
});

describe('ProviderRegistry.fanout', () => {
	it('asks every provider and files each failure against its own id', async () => {
		const asked: string[] = [];
		const results = await registryOf(
			fakeProvider('a', { fails: 'dead' }, asked),
			fakeProvider('b', { books: [book('from b', 'b')] }, asked),
		).fanout('q', {}, ORDER);

		expect(results).toHaveLength(2);
		expect(asked.sort()).toEqual(['a', 'b']);
		expect(results.find((r) => r.providerId === 'a')?.error).toContain('dead');
		expect(results.find((r) => r.providerId === 'b')?.books).toHaveLength(1);
	});
});

describe('resolveOrdered', () => {
	it('appends providers the order does not mention', async () => {
		// `DEFAULT_SETTINGS.priorityOrder` names four of the five providers, so
		// an unnamed one still has to be searched.
		const results = await registryOf(
			fakeProvider('a', { books: [] }),
			fakeProvider('z', { books: [book('from z', 'z')] }),
		).sequential('q', {}, ['a']);

		expect(results.map((r) => r.providerId)).toEqual(['a', 'z']);
	});

	it('ignores an order entry naming a provider that is not registered', async () => {
		const results = await registryOf(fakeProvider('a', { books: [] })).sequential(
			'q',
			{},
			['gone', 'a'],
		);

		expect(results.map((r) => r.providerId)).toEqual(['a']);
	});
});
