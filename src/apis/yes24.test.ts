import { describe, expect, it } from 'vitest';

import {
	detailKeyFor,
	formatPublishDate,
	isEmptyResult,
	normalizeYes24Item,
	parseGoodsSort,
	type Yes24Item,
} from './yes24';
import type { Book } from './base';

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
