import { describe, expect, it } from 'vitest';

import { parseYes24Author } from './yes24-author-parser';

describe('parseYes24Author', () => {
	it('returns empty arrays for empty input', () => {
		expect(parseYes24Author('')).toEqual({ authors: [], translators: [] });
		expect(parseYes24Author('   ')).toEqual({ authors: [], translators: [] });
	});

	it('parses a single 저 group', () => {
		expect(parseYes24Author('고명환 저')).toEqual({
			authors: ['고명환'],
			translators: [],
		});
	});

	it('splits 역 into translators and keeps 감수 with authors', () => {
		expect(parseYes24Author('유발 하라리 저/조현욱 역/이태수 감수')).toEqual({
			authors: ['유발 하라리', '이태수'],
			translators: ['조현욱'],
		});
	});

	it('shares one role across comma-separated names', () => {
		expect(parseYes24Author('짐 콜린스 저/고영훈,윤영호 역')).toEqual({
			authors: ['짐 콜린스'],
			translators: ['고영훈', '윤영호'],
		});
	});

	it('handles the compound 글,그림 role without splitting it into names', () => {
		expect(parseYes24Author('김재훈 글,그림/서정욱 글')).toEqual({
			authors: ['김재훈', '서정욱'],
			translators: [],
		});
	});

	it('treats 글그림 / 등저 / 공저 / 원저 / 편저 as authors', () => {
		expect(parseYes24Author('엔도 타츠야 글그림').authors).toEqual([
			'엔도 타츠야',
		]);
		expect(parseYes24Author('여상기,장인수,조향숙 등저').authors).toEqual([
			'여상기',
			'장인수',
			'조향숙',
		]);
		const three = parseYes24Author(
			'나관중 원저/요시카와 에이지 편저/바른번역 역',
		);
		expect(three.authors).toEqual(['나관중', '요시카와 에이지']);
		expect(three.translators).toEqual(['바른번역']);
	});

	it('matches 편역 before 역 (longest role wins)', () => {
		expect(
			parseYes24Author('고명환,루키우스 안나이우스 세네카 저/하와이 대저택 편역'),
		).toEqual({
			authors: ['고명환', '루키우스 안나이우스 세네카'],
			translators: ['하와이 대저택'],
		});
	});

	it('falls back to authors when a group carries no role token', () => {
		expect(parseYes24Author('The Beatles')).toEqual({
			authors: ['The Beatles'],
			translators: [],
		});
	});

	it('peels a role glued to the name (저/역 only)', () => {
		expect(parseYes24Author('요나스 메카스저/김현우 역')).toEqual({
			authors: ['요나스 메카스'],
			translators: ['김현우'],
		});
	});

	it('does not peel a glued 글, which could truncate a real name', () => {
		// "한글" is a plausible name fragment; only 저/역 are glue-safe.
		expect(parseYes24Author('김한글').authors).toEqual(['김한글']);
	});

	it('tolerates stray whitespace around comma separators', () => {
		expect(
			parseYes24Author('박홍인 ,김현진,이진웅,유향은 공저').authors,
		).toEqual(['박홍인', '김현진', '이진웅', '유향은']);
	});

	it('drops a group that is only a role token', () => {
		expect(parseYes24Author('고명환 저/역').translators).toEqual([]);
	});
});
