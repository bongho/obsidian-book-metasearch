import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl, type RequestUrlParam } from 'obsidian';

import { GoogleBooksProvider } from './google-books';
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

function lastRequest(): RequestUrlParam {
	const { calls } = mockRequest.mock;
	return calls[calls.length - 1]?.[0] as RequestUrlParam;
}

function lastUrl(): URL {
	return new URL(lastRequest().url);
}

/** Resolves to the rejection reason, so the error's own fields can be asserted. */
function rejection(p: Promise<unknown>): Promise<unknown> {
	return p.then(
		() => new Error('expected the call to reject, but it resolved'),
		(e: unknown) => e,
	);
}

/** The key is optional here, unlike every other keyed provider. */
function provider(key = ''): GoogleBooksProvider {
	return new GoogleBooksProvider(() => key);
}

/** Trimmed `volumes` item. */
const SAPIENS = {
	id: 'FmyBAwAAQBAJ',
	volumeInfo: {
		title: 'Sapiens',
		subtitle: 'A Brief History of Humankind',
		authors: ['Yuval Noah Harari'],
		publisher: 'Harper',
		publishedDate: '2015-02-10',
		description: '<p>A <b>brief</b> history</p>',
		// OTHER deliberately sits first: Google orders these by nothing in
		// particular, so taking `[0]` instead of matching on `type` has to fail.
		industryIdentifiers: [
			{ type: 'OTHER', identifier: 'UOM:39015082615366' },
			{ type: 'ISBN_13', identifier: '9780062316097' },
			{ type: 'ISBN_10', identifier: '0062316095' },
		],
		pageCount: 443,
		categories: ['History', 'Civilization'],
		imageLinks: {
			smallThumbnail: 'http://books.google.com/books/content?id=F&img=1&zoom=5',
			thumbnail:
				'http://books.google.com/books/content?id=F&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
		},
		language: 'en',
		infoLink: 'https://books.google.com/books?id=F',
		canonicalVolumeLink: 'https://books.google.com/books/about/Sapiens.html',
	},
};

function okWith(items: unknown[]): void {
	mockRequest.mockResolvedValue(respond(200, { totalItems: items.length, items }));
}

describe('GoogleBooksProvider request building', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('searches without a key and never sends an empty one', async () => {
		okWith([SAPIENS]);

		const books = await provider().searchByQuery('sapiens', { maxResults: 3 });

		const url = lastUrl();
		expect(url.hostname).toBe('www.googleapis.com');
		expect(url.searchParams.get('q')).toBe('sapiens');
		expect(url.searchParams.get('maxResults')).toBe('3');
		// Without this every search also returns magazines.
		expect(url.searchParams.get('printType')).toBe('books');
		expect(url.searchParams.has('key')).toBe(false);
		expect(lastRequest().throw).toBe(false);
		expect(books).toHaveLength(1);
	});

	it('appends the key as a query parameter once one is configured', async () => {
		okWith([]);

		await provider('test-key').searchByQuery('x');

		expect(lastUrl().searchParams.get('key')).toBe('test-key');
	});

	it('clamps maxResults into the range the API accepts', async () => {
		okWith([]);
		const p = provider();

		await p.searchByQuery('x', { maxResults: 0 });
		expect(lastUrl().searchParams.get('maxResults')).toBe('1');

		await p.searchByQuery('x', { maxResults: 999 });
		expect(lastUrl().searchParams.get('maxResults')).toBe('40');

		await p.searchByQuery('x');
		expect(lastUrl().searchParams.get('maxResults')).toBe('10');
	});

	it('passes the locale through as langRestrict only when one is asked for', async () => {
		okWith([]);
		const p = provider();

		await p.searchByQuery('x', { locale: 'ko' });
		expect(lastUrl().searchParams.get('langRestrict')).toBe('ko');

		await p.searchByQuery('x');
		expect(lastUrl().searchParams.has('langRestrict')).toBe(false);
	});

	it('looks an ISBN up through the isbn: operator with punctuation stripped', async () => {
		okWith([SAPIENS]);

		await provider().searchByISBN('978-0-06-231609-7');

		expect(lastUrl().searchParams.get('q')).toBe('isbn:9780062316097');
		expect(lastUrl().searchParams.get('maxResults')).toBe('1');
	});

	it('answers null rather than throwing when an ISBN has no match', async () => {
		// Google omits `items` entirely on a miss rather than sending [].
		mockRequest.mockResolvedValue(respond(200, { totalItems: 0 }));

		await expect(provider().searchByISBN('9780062316097')).resolves.toBeNull();
	});
});

describe('GoogleBooksProvider response classification', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('maps 403 to AUTH_INVALID, which is also how the quota runs out', async () => {
		mockRequest.mockResolvedValue(
			respond(403, { error: { code: 403, message: 'Daily Limit Exceeded' } }),
		);

		const err = await rejection(provider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
		expect((err as ProviderError).message).toContain('Daily Limit Exceeded');
	});

	it('maps an error.code of 403 to AUTH_INVALID even on a 200', async () => {
		mockRequest.mockResolvedValue(
			respond(200, { error: { code: 403, message: 'keyInvalid' } }),
		);

		const err = await rejection(provider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
	});

	it('maps 429 to RATE_LIMIT', async () => {
		mockRequest.mockResolvedValue(respond(429, {}));

		const err = await rejection(provider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('RATE_LIMIT');
	});

	it('treats an error object on a 200 as a failure', async () => {
		mockRequest.mockResolvedValue(
			respond(200, { error: { code: 400, message: 'Invalid value' } }),
		);

		const err = await rejection(provider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('Invalid value');
	});

	it('reports an unparseable body with its status and an excerpt', async () => {
		mockRequest.mockResolvedValue(respond(502, '<html>Bad Gateway</html>'));

		const err = await rejection(provider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('Invalid JSON (HTTP 502)');
	});
});

describe('GoogleBooksProvider.healthcheck', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('passes without a key, because the key is optional here', async () => {
		okWith([]);

		await expect(provider().healthcheck()).resolves.toEqual({ ok: true });
		expect(mockRequest).toHaveBeenCalledTimes(1);
	});

	it('surfaces the provider error code instead of throwing', async () => {
		mockRequest.mockResolvedValue(respond(429, {}));

		await expect(provider().healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'RATE_LIMIT',
		});
	});
});

describe('GoogleBooksProvider normalization', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	async function firstBook(item: unknown) {
		okWith([item]);
		const [book] = await provider().searchByQuery('x');
		return book;
	}

	it('picks the two ISBNs out of industryIdentifiers and ignores the rest', async () => {
		const book = await firstBook(SAPIENS);

		expect(book).toMatchObject({
			title: 'Sapiens',
			subtitle: 'A Brief History of Humankind',
			isbn10: '0062316095',
			isbn13: '9780062316097',
			pageCount: 443,
			language: 'en',
			categories: ['History', 'Civilization'],
			categoryLeaf: 'Civilization',
			providerUrl: 'https://books.google.com/books/about/Sapiens.html',
			provider: 'google',
		});
	});

	it('strips the markup out of the description', async () => {
		const book = await firstBook(SAPIENS);

		expect(book?.description).not.toContain('<b>');
		expect(book?.description).toContain('brief');
	});

	it('upgrades the cover: thumbnail over smallThumbnail, no zoom, no curl, https', async () => {
		// `zoom=1` pins the image at 128px and `edge=curl` draws a fake page
		// fold, so both are dropped. Obsidian refuses a plain-http image.
		const book = await firstBook(SAPIENS);

		expect(book?.coverUrl).toContain('printsec=frontcover');
		expect(book?.coverUrl).not.toContain('zoom=');
		expect(book?.coverUrl).not.toContain('edge=curl');
		expect(book?.coverUrl?.startsWith('https://')).toBe(true);
	});

	it('falls back to smallThumbnail when there is no thumbnail', async () => {
		const book = await firstBook({
			volumeInfo: {
				...SAPIENS.volumeInfo,
				imageLinks: { smallThumbnail: 'https://example.test/s.jpg?zoom=5' },
			},
		});

		expect(book?.coverUrl).toContain('example.test/s.jpg');
		expect(book?.coverUrl).not.toContain('zoom=');
	});

	it('falls back to infoLink when there is no canonical link', async () => {
		const book = await firstBook({
			volumeInfo: {
				...SAPIENS.volumeInfo,
				canonicalVolumeLink: undefined,
			},
		});

		expect(book?.providerUrl).toBe('https://books.google.com/books?id=F');
	});

	it('survives an item with no volumeInfo at all', async () => {
		const book = await firstBook({ id: 'x' });

		expect(book?.title).toBe('');
		expect(book?.authors).toEqual([]);
		expect(book?.coverUrl).toBeUndefined();
		expect(book?.provider).toBe('google');
	});
});
