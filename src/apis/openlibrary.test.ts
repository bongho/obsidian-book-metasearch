import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl, type RequestUrlParam } from 'obsidian';

import { OpenLibraryProvider } from './openlibrary';
import { ProviderError } from './base';

// The stub in `src/__mocks__/obsidian.ts` throws on `requestUrl` by design, so
// every provider-level test drives it from here instead of hitting the network.
vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	requestUrl: vi.fn(),
}));

const mockRequest = vi.mocked(requestUrl);

/**
 * A `requestUrl` result. The provider reads only `status` and `text`, but the
 * real `RequestUrlResponse` type is what `tsc` checks against, so every field
 * has to be present.
 */
function respond(status: number, body: unknown) {
	return {
		status,
		text: typeof body === 'string' ? body : JSON.stringify(body),
		headers: {} as Record<string, string>,
		arrayBuffer: new ArrayBuffer(0),
		json: body,
	};
}

function requestAt(index: number): RequestUrlParam {
	return mockRequest.mock.calls[index]?.[0] as RequestUrlParam;
}

function lastUrl(): URL {
	return new URL(requestAt(mockRequest.mock.calls.length - 1).url);
}

/** Resolves to the rejection reason, so the error's own fields can be asserted. */
function rejection(p: Promise<unknown>): Promise<unknown> {
	return p.then(
		() => new Error('expected the call to reject, but it resolved'),
		(e: unknown) => e,
	);
}

/**
 * Trimmed `search.json` doc. `isbn` is a mixed bag of 10s and 13s, some
 * hyphenated, in no particular order, which is the part most likely to break.
 */
const SAPIENS = {
	key: '/works/OL17860744W',
	title: 'Sapiens',
	subtitle: 'A Brief History of Humankind',
	author_name: ['Yuval Noah Harari'],
	publisher: ['Harper', 'Vintage'],
	publish_date: ['2015', '2014'],
	first_publish_year: 2011,
	isbn: ['978-0-06-231609-7', '0062316095', 'not-an-isbn'],
	cover_i: 8739161,
	subject: ['History', 'Civilization', 'Anthropology', 'Evolution', 'Humans', 'Sixth'],
	language: ['eng'],
	number_of_pages_median: 443,
};

function okWith(docs: unknown[]): void {
	mockRequest.mockResolvedValue(respond(200, { numFound: docs.length, docs }));
}

describe('OpenLibraryProvider request building', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('searches with no credentials and asks for only the fields it reads', async () => {
		okWith([SAPIENS]);

		const books = await new OpenLibraryProvider().searchByQuery('sapiens', {
			maxResults: 3,
		});

		const url = lastUrl();
		expect(url.hostname).toBe('openlibrary.org');
		expect(url.pathname).toBe('/search.json');
		expect(url.searchParams.get('q')).toBe('sapiens');
		expect(url.searchParams.get('limit')).toBe('3');
		// Without an explicit field list the search sends back every edition.
		expect(url.searchParams.get('fields')).toContain('number_of_pages_median');
		expect(requestAt(0).headers).toBeUndefined();
		expect(books).toHaveLength(1);
	});

	it('clamps the limit into the range the API accepts', async () => {
		okWith([]);
		const p = new OpenLibraryProvider();

		await p.searchByQuery('x', { maxResults: 0 });
		expect(lastUrl().searchParams.get('limit')).toBe('1');

		await p.searchByQuery('x', { maxResults: 999 });
		expect(lastUrl().searchParams.get('limit')).toBe('100');

		await p.searchByQuery('x');
		expect(lastUrl().searchParams.get('limit')).toBe('10');
	});

	it('converts the locale to the three-letter code the search expects', async () => {
		okWith([]);
		const p = new OpenLibraryProvider();

		await p.searchByQuery('x', { locale: 'ko' });
		expect(lastUrl().searchParams.get('language')).toBe('kor');

		// An unmappable locale is dropped rather than sent through as-is.
		await p.searchByQuery('x', { locale: 'zz' });
		expect(lastUrl().searchParams.has('language')).toBe(false);
	});
});

describe('OpenLibraryProvider.searchByISBN', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('answers null on a 404 without spending the second request', async () => {
		mockRequest.mockResolvedValue(respond(404, ''));

		await expect(
			new OpenLibraryProvider().searchByISBN('9780062316097'),
		).resolves.toBeNull();
		expect(mockRequest).toHaveBeenCalledTimes(1);
	});

	it('probes /isbn first and then reads the book off the search endpoint', async () => {
		// The /isbn endpoint answers edition-level data in a different shape, so
		// it is used only as an existence check.
		mockRequest
			.mockResolvedValueOnce(respond(200, { key: '/books/OL1M' }))
			.mockResolvedValueOnce(respond(200, { docs: [SAPIENS] }));

		const book = await new OpenLibraryProvider().searchByISBN('978-0-06-231609-7');

		expect(new URL(requestAt(0).url).pathname).toBe('/isbn/9780062316097.json');
		expect(new URL(requestAt(1).url).pathname).toBe('/search.json');
		expect(book?.title).toBe('Sapiens');
	});

	it('answers null when the probe passes but the search finds nothing', async () => {
		mockRequest
			.mockResolvedValueOnce(respond(200, { key: '/books/OL1M' }))
			.mockResolvedValueOnce(respond(200, { docs: [] }));

		await expect(
			new OpenLibraryProvider().searchByISBN('9780062316097'),
		).resolves.toBeNull();
	});
});

describe('OpenLibraryProvider response classification', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('fails on an HTTP error before trying to read the body', async () => {
		mockRequest.mockResolvedValue(respond(503, 'upstream is down'));

		const err = await rejection(new OpenLibraryProvider().searchByQuery('x'));
		expect(err).toBeInstanceOf(ProviderError);
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('upstream is down');
	});

	it('reports an unparseable body with its status and an excerpt', async () => {
		mockRequest.mockResolvedValue(respond(200, '<html>maintenance</html>'));

		const err = await rejection(new OpenLibraryProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('Invalid JSON (HTTP 200)');
	});

	it('reads a search with no docs as an empty answer, not a failure', async () => {
		// Korean titles usually land here, which is why this provider sits last.
		mockRequest.mockResolvedValue(respond(200, { numFound: 0 }));

		await expect(
			new OpenLibraryProvider().searchByQuery('한글 제목'),
		).resolves.toEqual([]);
	});
});

describe('OpenLibraryProvider.healthcheck', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('passes on a well-formed answer', async () => {
		okWith([]);

		await expect(new OpenLibraryProvider().healthcheck()).resolves.toEqual({
			ok: true,
		});
	});

	it('reports a failure as NETWORK, since there is no key to blame', async () => {
		mockRequest.mockResolvedValue(respond(503, 'down'));

		await expect(new OpenLibraryProvider().healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'NETWORK',
		});
	});
});

describe('OpenLibraryProvider normalization', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	async function firstBook(doc: unknown) {
		okWith([doc]);
		const [book] = await new OpenLibraryProvider().searchByQuery('x');
		return book;
	}

	it('picks one real ISBN of each length out of the mixed list', async () => {
		const book = await firstBook(SAPIENS);

		expect(book?.isbn10).toBe('0062316095');
		expect(book?.isbn13).toBe('9780062316097');
	});

	it('prefers first_publish_year over the publish_date list', async () => {
		// `publish_date[0]` is whichever edition the index happened to sort first.
		const book = await firstBook(SAPIENS);

		expect(book?.publishYear).toBe('2011');
		expect(book?.publishDate).toBe('2015');
	});

	it('falls back to the publish_date year when there is no first_publish_year', async () => {
		const book = await firstBook({ ...SAPIENS, first_publish_year: undefined });

		expect(book?.publishYear).toBe('2015');
	});

	it('converts the three-letter language code back to two letters', async () => {
		expect((await firstBook(SAPIENS))?.language).toBe('en');
	});

	it('keeps an unmappable language code rather than dropping it', async () => {
		const book = await firstBook({ ...SAPIENS, language: ['zzz'] });

		expect(book?.language).toBe('zzz');
	});

	it('caps the subject list at five and takes the first as the leaf', async () => {
		// Open Library hands back hundreds of subjects on a popular work.
		const book = await firstBook(SAPIENS);

		expect(book?.categories).toHaveLength(5);
		expect(book?.categories).not.toContain('Sixth');
		expect(book?.categoryLeaf).toBe('History');
	});

	it('builds the cover and work URLs from the ids', async () => {
		const book = await firstBook(SAPIENS);

		expect(book?.coverUrl).toBe(
			'https://covers.openlibrary.org/b/id/8739161-L.jpg',
		);
		expect(book?.providerUrl).toBe('https://openlibrary.org/works/OL17860744W');
	});

	it('leaves the cover unset rather than pointing at a missing id', async () => {
		const book = await firstBook({ ...SAPIENS, cover_i: undefined });

		expect(book?.coverUrl).toBeUndefined();
	});

	it('survives a doc carrying nothing at all', async () => {
		const book = await firstBook({});

		expect(book?.title).toBe('');
		expect(book?.authors).toEqual([]);
		expect(book?.provider).toBe('openlibrary');
	});
});
