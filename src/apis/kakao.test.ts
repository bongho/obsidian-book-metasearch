import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl, type RequestUrlParam } from 'obsidian';

import { KakaoProvider } from './kakao';
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

function keyedProvider(key = 'test-key'): KakaoProvider {
	return new KakaoProvider(() => key);
}

/**
 * Trimmed `v3/search/book` document. `isbn` really does arrive as the two
 * numbers in one space-separated string, which is the field most likely to
 * break quietly.
 */
const SAPIENS = {
	title: '사피엔스',
	contents: '인간 역사의 대담하고 위대한 질문',
	url: 'https://search.daum.net/search?w=bookpage&bookId=1467038',
	isbn: '8934972467 9788934972464',
	datetime: '2015-11-23T00:00:00.000+09:00',
	authors: ['유발 하라리'],
	translators: ['조현욱'],
	publisher: '김영사',
	thumbnail: 'https://search1.kakaocdn.net/thumb/sapiens.jpg',
};

function okWith(documents: unknown[]): void {
	mockRequest.mockResolvedValue(respond(200, { documents, meta: {} }));
}

describe('KakaoProvider request building', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('authenticates by header and decodes the status itself', async () => {
		okWith([SAPIENS]);

		const books = await keyedProvider().searchByQuery('사피엔스', {
			maxResults: 3,
		});

		const url = lastUrl();
		expect(url.hostname).toBe('dapi.kakao.com');
		expect(url.searchParams.get('query')).toBe('사피엔스');
		expect(url.searchParams.get('size')).toBe('3');
		expect(url.searchParams.get('sort')).toBe('accuracy');
		expect(lastRequest().headers?.['Authorization']).toBe('KakaoAK test-key');
		// `throw: false` is what lets the error body be read off the response.
		expect(lastRequest().throw).toBe(false);
		expect(books).toHaveLength(1);
	});

	it('clamps size into the range the API accepts', async () => {
		okWith([]);
		const provider = keyedProvider();

		await provider.searchByQuery('x', { maxResults: 0 });
		expect(lastUrl().searchParams.get('size')).toBe('1');

		await provider.searchByQuery('x', { maxResults: 999 });
		expect(lastUrl().searchParams.get('size')).toBe('50');

		await provider.searchByQuery('x');
		expect(lastUrl().searchParams.get('size')).toBe('10');
	});

	it('refuses before spending a request when no key is configured', async () => {
		const err = await rejection(keyedProvider('').searchByQuery('x'));

		expect(err).toBeInstanceOf(ProviderError);
		expect((err as ProviderError).code).toBe('AUTH_MISSING');
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('looks an ISBN up on the isbn target with the punctuation stripped', async () => {
		okWith([SAPIENS]);

		await keyedProvider().searchByISBN('978-89-349-7246-4');

		const url = lastUrl();
		expect(url.searchParams.get('target')).toBe('isbn');
		expect(url.searchParams.get('query')).toBe('9788934972464');
		expect(url.searchParams.get('size')).toBe('1');
	});

	it('answers null rather than throwing when an ISBN has no match', async () => {
		okWith([]);

		await expect(keyedProvider().searchByISBN('9788934972464')).resolves.toBeNull();
	});
});

describe('KakaoProvider response classification', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('maps 401 to AUTH_INVALID and keeps the message Kakao sent', async () => {
		mockRequest.mockResolvedValue(
			respond(401, { msg: 'this app has no app key', code: -401 }),
		);

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
		expect((err as ProviderError).message).toContain('this app has no app key');
	});

	it('maps a -401 body to AUTH_INVALID even on a 200', async () => {
		// Kakao does not always move the auth failure into the HTTP status.
		mockRequest.mockResolvedValue(respond(200, { code: -401, msg: '인증 실패' }));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
	});

	it('maps 429 to RATE_LIMIT', async () => {
		mockRequest.mockResolvedValue(respond(429, {}));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('RATE_LIMIT');
	});

	it('treats any other numeric code on a 200 as a failure', async () => {
		// Without this the body's error code is ignored and `documents` reads as
		// an empty result, which looks exactly like a book nobody stocks.
		mockRequest.mockResolvedValue(respond(200, { code: -10, msg: '점검 중' }));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('점검 중');
	});

	it('reports an unparseable body with its status and an excerpt', async () => {
		mockRequest.mockResolvedValue(respond(502, '<html>Bad Gateway</html>'));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('Invalid JSON (HTTP 502)');
		expect((err as ProviderError).message).toContain('Bad Gateway');
	});
});

describe('KakaoProvider.healthcheck', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('reports a missing key without calling the API', async () => {
		await expect(keyedProvider('').healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'AUTH_MISSING',
		});
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('surfaces the provider error code instead of throwing', async () => {
		mockRequest.mockResolvedValue(respond(429, {}));

		await expect(keyedProvider().healthcheck()).resolves.toMatchObject({
			ok: false,
			code: 'RATE_LIMIT',
		});
	});

	it('passes on a well-formed answer', async () => {
		okWith([]);

		await expect(keyedProvider().healthcheck()).resolves.toEqual({ ok: true });
	});
});

describe('KakaoProvider normalization', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	async function firstBook(doc: unknown) {
		okWith([doc]);
		const [book] = await keyedProvider().searchByQuery('x');
		return book;
	}

	it('splits the space-separated isbn field into the two fields', async () => {
		const book = await firstBook(SAPIENS);

		expect(book).toMatchObject({
			title: '사피엔스',
			authors: ['유발 하라리'],
			translators: ['조현욱'],
			publisher: '김영사',
			isbn10: '8934972467',
			isbn13: '9788934972464',
			coverUrl: 'https://search1.kakaocdn.net/thumb/sapiens.jpg',
			provider: 'kakao',
		});
	});

	it('cuts the datetime down to a date and a year', async () => {
		const book = await firstBook(SAPIENS);

		expect(book?.publishDate).toBe('2015-11-23');
		expect(book?.publishYear).toBe('2015');
	});

	it('leaves translators unset rather than empty when there are none', async () => {
		// An empty array would make the note writer emit a 옮긴이 line over nothing.
		const book = await firstBook({ ...SAPIENS, translators: [] });

		expect(book?.translators).toBeUndefined();
	});

	it('survives a document carrying nothing but a title', async () => {
		const book = await firstBook({ title: '제목만' });

		expect(book?.authors).toEqual([]);
		expect(book?.isbn10).toBeUndefined();
		expect(book?.isbn13).toBeUndefined();
		expect(book?.publishDate).toBeUndefined();
	});
});
