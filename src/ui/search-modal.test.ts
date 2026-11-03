import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';

import { BookSearchModal } from './search-modal';
import type { ProviderRegistry, ProviderResult } from '../apis/registry';
import { DEFAULT_SETTINGS } from '../settings';

vi.mock('obsidian', async (importOriginal) => {
	const actual = await importOriginal<typeof import('obsidian')>();
	return { ...actual, Notice: vi.fn() };
});

const noticed = vi.mocked(Notice);

/** A registry that answers `fanout` with whatever the test hands it. */
function registryReturning(results: ProviderResult[]): ProviderRegistry {
	return { fanout: vi.fn().mockResolvedValue(results) } as unknown as ProviderRegistry;
}

function modalOver(results: ProviderResult[]): BookSearchModal {
	return new BookSearchModal(
		{} as never,
		registryReturning(results),
		{ ...DEFAULT_SETTINGS, searchStrategy: 'fanout' },
		() => undefined,
	);
}

describe('BookSearchModal fanout failures', () => {
	beforeEach(() => {
		noticed.mockClear();
	});

	it('names the failed providers when the search came back with nothing', async () => {
		// Each provider catches its own failure, so without this the user sees
		// an empty list and no reason for it.
		const books = await modalOver([
			{ providerId: 'yes24', books: [], error: 'API Key가 만료되었습니다.' },
			{ providerId: 'kakao', books: [], error: '인증 실패' },
			{ providerId: 'openlibrary', books: [] },
		]).getSuggestions('사피엔스');

		expect(books).toEqual([]);
		expect(noticed).toHaveBeenCalledTimes(1);
		// `Notice` also accepts a DocumentFragment; this call site passes text.
		const msg = (noticed.mock.calls[0]?.[0] ?? '') as string;
		expect(msg).toContain('yes24');
		expect(msg).toContain('kakao');
		expect(msg).toContain('API Key가 만료되었습니다.');
		// A provider that simply had no match is not a failure.
		expect(msg).not.toContain('openlibrary');
	});

	it('stays quiet when a provider failed but others still found books', async () => {
		const book = { title: '사피엔스', authors: [], provider: 'kakao' };
		const books = await modalOver([
			{ providerId: 'yes24', books: [], error: '인증 실패' },
			{ providerId: 'kakao', books: [book] as never },
		]).getSuggestions('사피엔스');

		expect(books).toHaveLength(1);
		expect(noticed).not.toHaveBeenCalled();
	});

	it('stays quiet when every provider simply had no match', async () => {
		const books = await modalOver([
			{ providerId: 'yes24', books: [] },
			{ providerId: 'openlibrary', books: [] },
		]).getSuggestions('존재하지 않는 책');

		expect(books).toEqual([]);
		expect(noticed).not.toHaveBeenCalled();
	});
});
