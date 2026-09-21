import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl, type RequestUrlParam } from 'obsidian';

import {
	detailKeyFor,
	formatPublishDate,
	isEmptyResult,
	mergeEnriched,
	normalizeYes24Item,
	parseGoodsSort,
	Yes24Provider,
	type Yes24Item,
} from './yes24';
import { ProviderError, type Book } from './base';

// The stub in `src/__mocks__/obsidian.ts` throws on `requestUrl` by design, so
// every provider-level test drives it from here instead of hitting the network.
vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	requestUrl: vi.fn(),
}));

/**
 * Trimmed capture of a live `goods/itemDetail?searchType=ISBN13&detail=Y`
 * response (ISBN 9788934972464, fetched 2026-09-04). Price, point, rating,
 * and physical-dimension fields are dropped — the provider ignores them.
 */
const SAPIENS: Yes24Item = {
	itemId: 23030284,
	title: '사피엔스',
	subTitle: '유인원에서 사이보그까지, 인간 역사의 대담하고 위대한 질문',
	author: '유발 하라리 저/조현욱 역/이태수 감수',
	goodsType: '도서',
	goodsSortNm: '국내도서-인문',
	publisher: '김영사',
	isbn10: '8934972467',
	isbn13: '9788934972464',
	publishDate: '20151123',
	originalTitle: 'Sapiens: A Brief History of Humankind',
	pages: 636,
	cover: 'https://image.yes24.com/goods/23030284/L',
	link: 'https://www.yes24.com/product/goods/23030284',
	contentDetail: {
		bookIntroduction: '<b>출간 10주년</b>\r\n인간의 역사와 미래에 대한 대서사',
		bookSummary: null,
		tableOfContents: '<b>1부 인지혁명</b>',
	},
};

describe('normalizeYes24Item', () => {
	it('maps the detail payload onto Book', () => {
		const book = normalizeYes24Item(SAPIENS, 'yes24');
		expect(book).toMatchObject({
			title: '사피엔스',
			subtitle: '유인원에서 사이보그까지, 인간 역사의 대담하고 위대한 질문',
			authors: ['유발 하라리', '이태수'],
			translators: ['조현욱'],
			publisher: '김영사',
			publishDate: '2015-11-23',
			publishYear: '2015',
			isbn10: '8934972467',
			isbn13: '9788934972464',
			pageCount: 636,
			language: 'ko',
			categories: ['국내도서', '인문'],
			categoryLeaf: '인문',
			coverUrl: 'https://image.yes24.com/goods/23030284/L',
			providerUrl: 'https://www.yes24.com/product/goods/23030284',
			provider: 'yes24',
		});
	});

	it('strips HTML from the book introduction', () => {
		const book = normalizeYes24Item(SAPIENS, 'yes24');
		expect(book.description).not.toContain('<b>');
		expect(book.description).toContain('출간 10주년');
	});

	it('leaves detail-only fields unset on a lean search-result item', () => {
		// `goods/itemList` omits subTitle/pages and sends empty ISBNs on box sets.
		const lean: Yes24Item = {
			itemId: 194803891,
			title: '세네카, 오늘을 빼앗기고 있는 당신에게 + 독서의 기술 세트',
			author: '고명환,루키우스 안나이우스 세네카 저/하와이 대저택 편역',
			goodsSortNm: '국내도서-자기계발',
			publisher: '라곰',
			isbn10: '',
			isbn13: '',
			publishDate: '20260708',
			cover: 'https://image.yes24.com/goods/194803891/L',
			link: 'https://www.yes24.com/product/goods/194803891',
		};
		const book = normalizeYes24Item(lean, 'yes24');
		expect(book.subtitle).toBeUndefined();
		expect(book.pageCount).toBeUndefined();
		expect(book.isbn10).toBeUndefined();
		expect(book.isbn13).toBeUndefined();
		expect(book.translators).toEqual(['하와이 대저택']);
	});

	it('does not claim a language for foreign titles', () => {
		const foreign: Yes24Item = {
			title: 'The Scaling Era',
			goodsSortNm: '외국도서-컴퓨터외서',
		};
		expect(normalizeYes24Item(foreign, 'yes24').language).toBeUndefined();
	});

	it('drops a zero page count rather than writing "0 pages"', () => {
		expect(
			normalizeYes24Item({ title: 'x', pages: 0 }, 'yes24').pageCount,
		).toBeUndefined();
	});
});

describe('parseGoodsSort', () => {
	it('splits the "-" hierarchy into path and leaf', () => {
		expect(parseGoodsSort('국내도서-자기계발')).toEqual({
			categoryPath: ['국내도서', '자기계발'],
			categoryLeaf: '자기계발',
		});
	});

	it('keeps a spaced leaf intact', () => {
		expect(parseGoodsSort('국내도서-사회 정치').categoryLeaf).toBe('사회 정치');
	});

	it('returns an empty path for missing input', () => {
		expect(parseGoodsSort(undefined)).toEqual({ categoryPath: [] });
		expect(parseGoodsSort('')).toEqual({ categoryPath: [] });
	});
});

describe('formatPublishDate', () => {
	it('inserts separators into the 8-digit form', () => {
		expect(formatPublishDate('20260708')).toBe('2026-07-08');
	});

	it('passes through anything that is not 8 digits', () => {
		expect(formatPublishDate('2026-07-08')).toBe('2026-07-08');
		expect(formatPublishDate('')).toBeUndefined();
		expect(formatPublishDate(undefined)).toBeUndefined();
	});
});

describe('isEmptyResult', () => {
	it('treats 404 + SEARCH_001 as an empty answer, not a failure', () => {
		expect(isEmptyResult(404, { success: false, errorCode: 'SEARCH_001' })).toBe(
			true,
		);
	});

	it('does not swallow other 404s or other error codes', () => {
		expect(isEmptyResult(404, { success: false, errorCode: 'AUTH_001' })).toBe(
			false,
		);
		expect(isEmptyResult(500, { success: false, errorCode: 'SEARCH_001' })).toBe(
			false,
		);
	});
});

describe('detailKeyFor', () => {
	const base: Book = { title: 'x', authors: [], provider: 'yes24' };

	it('prefers a real ISBN13', () => {
		expect(detailKeyFor({ ...base, isbn13: '9788934972464' })).toEqual([
			'ISBN13',
			'9788934972464',
		]);
	});

	it('falls back to the product id in the URL when ISBN13 is missing', () => {
		expect(
			detailKeyFor({
				...base,
				providerUrl: 'https://www.yes24.com/product/goods/194803891',
			}),
		).toEqual(['ItemId', '194803891']);
	});

	it('yields a null query when neither is available', () => {
		expect(detailKeyFor(base)).toEqual(['ItemId', null]);
	});
});

/** What `goods/itemList` hands back for the same book: no subTitle, no pages. */
const SAPIENS_SEARCH_HIT: Yes24Item = {
	title: '사피엔스',
	author: '유발 하라리 저/조현욱 역',
	goodsSortNm: '국내도서-인문',
	publisher: '김영사',
	isbn13: '9788934972464',
	publishDate: '20151123',
	cover: 'https://image.yes24.com/goods/23030284/L',
	link: 'https://www.yes24.com/product/goods/23030284',
};

describe('mergeEnriched', () => {
	const leanHit = normalizeYes24Item(SAPIENS_SEARCH_HIT, 'yes24');

	it('fills in the detail-only fields the search result lacked', () => {
		const merged = mergeEnriched(leanHit, SAPIENS, 'yes24');
		expect(merged.pageCount).toBe(636);
		expect(merged.subtitle).toBe(
			'유인원에서 사이보그까지, 인간 역사의 대담하고 위대한 질문',
		);
	});

	it('keeps a search-result field the detail payload left empty', () => {
		const coverless: Yes24Item = { ...SAPIENS, cover: undefined };
		const merged = mergeEnriched(leanHit, coverless, 'yes24');
		expect(merged.coverUrl).toBe('https://image.yes24.com/goods/23030284/L');
	});
});

// ────────────────────────────────────────────────────────────
// Provider-level tests.
//
// `call()` is private, so it is exercised through the public methods that route
// through it. What matters is the request it builds (auth header, `throw:
// false`, clamped page size) and how it classifies each response — especially
// YES24's 404-means-empty convention, which a naive status check turns into an
// error toast on every miss.

const mockRequest = vi.mocked(requestUrl);

/**
 * A `requestUrl` result. The provider reads only `status` and `text`, but the
 * real `RequestUrlResponse` type is what `tsc` checks against — it resolves
 * 'obsidian' to the published typings, not to the Vitest alias — so every field
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
	// Every call site passes the object form, never the bare-URL overload.
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

function keyedProvider(key = 'test-key'): Yes24Provider {
	return new Yes24Provider(() => key);
}

function okWith(items: Yes24Item[]): void {
	mockRequest.mockResolvedValue(respond(200, { success: true, data: { items } }));
}

describe('Yes24Provider request building', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('authenticates by header and decodes the status itself', async () => {
		okWith([SAPIENS]);

		const books = await keyedProvider().searchByQuery('사피엔스', {
			maxResults: 3,
		});

		const url = lastUrl();
		expect(url.pathname).toBe('/v1/goods/itemList');
		expect(url.searchParams.get('query')).toBe('사피엔스');
		expect(url.searchParams.get('pageSize')).toBe('3');
		// A query parameter is rejected with AUTH_001 — the key must be a header.
		expect(lastRequest().headers?.['X-API-KEY']).toBe('test-key');
		// `throw: false` is what lets the 404-means-empty case be read off the body.
		expect(lastRequest().throw).toBe(false);
		expect(books).toHaveLength(1);
		expect(books[0]?.title).toBe('사피엔스');
	});

	it('clamps pageSize into the range the API accepts', async () => {
		okWith([]);
		const provider = keyedProvider();

		await provider.searchByQuery('x', { maxResults: 0 });
		expect(lastUrl().searchParams.get('pageSize')).toBe('1');

		await provider.searchByQuery('x', { maxResults: 999 });
		expect(lastUrl().searchParams.get('pageSize')).toBe('50');

		await provider.searchByQuery('x');
		expect(lastUrl().searchParams.get('pageSize')).toBe('10');
	});

	it('refuses before spending a request when no key is configured', async () => {
		const err = await rejection(keyedProvider('').searchByQuery('x'));

		expect(err).toBeInstanceOf(ProviderError);
		expect((err as ProviderError).code).toBe('AUTH_MISSING');
		expect(mockRequest).not.toHaveBeenCalled();
	});
});

describe('Yes24Provider response classification', () => {
	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('reads 404 + SEARCH_001 as an empty answer, not a failure', async () => {
		mockRequest.mockResolvedValue(
			respond(404, { errorCode: 'SEARCH_001', message: '검색 결과가 없습니다.' }),
		);

		await expect(keyedProvider().searchByQuery('없는책')).resolves.toEqual([]);
	});

	it('still fails on a 404 that is not SEARCH_001', async () => {
		mockRequest.mockResolvedValue(respond(404, { errorCode: 'SYS_404' }));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
	});

	it('maps 401 to AUTH_INVALID', async () => {
		mockRequest.mockResolvedValue(respond(401, { message: '유효하지 않은 키' }));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
		expect((err as ProviderError).message).toContain('유효하지 않은 키');
	});

	it('maps an AUTH_* error code to AUTH_INVALID even on a 200', async () => {
		mockRequest.mockResolvedValue(
			respond(200, { errorCode: 'AUTH_001', message: 'X-Api-Key 헤더가 없습니다.' }),
		);

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('AUTH_INVALID');
	});

	it('maps 429 to RATE_LIMIT', async () => {
		mockRequest.mockResolvedValue(respond(429, {}));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('RATE_LIMIT');
	});

	it('treats success:false on a 200 as a failure', async () => {
		mockRequest.mockResolvedValue(
			respond(200, { success: false, errorCode: 'SYS_001', message: '점검 중' }),
		);

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
	});

	it('reports an unparseable body with its status and an excerpt', async () => {
		mockRequest.mockResolvedValue(respond(502, '<html>Bad Gateway</html>'));

		const err = await rejection(keyedProvider().searchByQuery('x'));
		expect((err as ProviderError).code).toBe('UNKNOWN');
		expect((err as ProviderError).message).toContain('Invalid JSON (HTTP 502)');
		expect((err as ProviderError).message).toContain('Bad Gateway');
	});
});

describe('Yes24Provider.healthcheck', () => {
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
});

describe('Yes24Provider.enrich', () => {
	const leanHit = normalizeYes24Item(SAPIENS_SEARCH_HIT, 'yes24');

	beforeEach(() => {
		mockRequest.mockReset();
	});

	it('spends no request when there is neither an ISBN13 nor a product id', async () => {
		const book: Book = { title: '제목만 있는 책', authors: [], provider: 'yes24' };

		await expect(keyedProvider().enrich(book)).resolves.toBe(book);
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('looks the detail up by ISBN13 and fills in the missing fields', async () => {
		okWith([SAPIENS]);

		const enriched = await keyedProvider().enrich(leanHit);

		const url = lastUrl();
		expect(url.pathname).toBe('/v1/goods/itemDetail');
		expect(url.searchParams.get('searchType')).toBe('ISBN13');
		expect(url.searchParams.get('query')).toBe('9788934972464');
		// Without detail=Y the response is as lean as the search result.
		expect(url.searchParams.get('detail')).toBe('Y');
		expect(enriched.pageCount).toBe(636);
		expect(enriched.subtitle).toBe(
			'유인원에서 사이보그까지, 인간 역사의 대담하고 위대한 질문',
		);
	});

	it('falls back to the product id in the URL when the ISBN13 is missing', async () => {
		okWith([SAPIENS]);
		// Box sets come back from search with an empty isbn13 but a usable link.
		const boxSet: Book = { ...leanHit, isbn13: undefined };

		await keyedProvider().enrich(boxSet);

		const url = lastUrl();
		expect(url.searchParams.get('searchType')).toBe('ItemId');
		expect(url.searchParams.get('query')).toBe('23030284');
	});

	it('hands the book back untouched when the detail lookup finds nothing', async () => {
		mockRequest.mockResolvedValue(respond(404, { errorCode: 'SEARCH_001' }));

		await expect(keyedProvider().enrich(leanHit)).resolves.toBe(leanHit);
	});

	it('hands the book back untouched when the detail lookup errors', async () => {
		mockRequest.mockResolvedValue(respond(500, { success: false, message: '점검 중' }));

		// Enrichment is an improvement, never a precondition for writing the note.
		await expect(keyedProvider().enrich(leanHit)).resolves.toBe(leanHit);
	});

	it('hands the book back untouched when the key is missing', async () => {
		await expect(keyedProvider('').enrich(leanHit)).resolves.toBe(leanHit);
		expect(mockRequest).not.toHaveBeenCalled();
	});
});
