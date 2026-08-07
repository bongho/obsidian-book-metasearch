import { describe, expect, it } from 'vitest';

import { cleanIsbn, isRealIsbn10, isRealIsbn13, splitIsbnPair } from './isbn';

describe('isRealIsbn10', () => {
	it('accepts well-formed 10-digit strings', () => {
		expect(isRealIsbn10('8934985062')).toBe(true);
	});

	it('accepts trailing X (case-insensitive)', () => {
		expect(isRealIsbn10('123456789X')).toBe(true);
		expect(isRealIsbn10('123456789x')).toBe(true);
	});

	it('rejects wrong length, hyphens, and null-ish', () => {
		expect(isRealIsbn10('123')).toBe(false);
		expect(isRealIsbn10('89-3498-506-2')).toBe(false);
		expect(isRealIsbn10(undefined)).toBe(false);
		expect(isRealIsbn10(null)).toBe(false);
	});

	it('rejects Aladin K-codes (partner-exclusive eBook artifacts)', () => {
		expect(isRealIsbn10('K792138300')).toBe(false);
	});
});

describe('isRealIsbn13', () => {
	it('accepts 13-digit strings', () => {
		expect(isRealIsbn13('9788934985068')).toBe(true);
	});

	it('rejects wrong length and non-digits', () => {
		expect(isRealIsbn13('12345')).toBe(false);
		expect(isRealIsbn13('978-89-3498-506-8')).toBe(false);
		expect(isRealIsbn13(undefined)).toBe(false);
	});
});

describe('cleanIsbn', () => {
	it('strips hyphens and spaces, keeps X', () => {
		expect(cleanIsbn('978-89-3498-506-8')).toBe('9788934985068');
		expect(cleanIsbn(' 123456789X ')).toBe('123456789X');
	});
});

describe('splitIsbnPair', () => {
	it('assigns by length when both are present', () => {
		const out = splitIsbnPair('8934985062 9788934985068');
		expect(out.isbn10).toBe('8934985062');
		expect(out.isbn13).toBe('9788934985068');
	});

	it('handles reversed order (Kakao inconsistency)', () => {
		const out = splitIsbnPair('9788934985068 8934985062');
		expect(out.isbn10).toBe('8934985062');
		expect(out.isbn13).toBe('9788934985068');
	});

	it('returns empty for undefined and pure whitespace', () => {
		expect(splitIsbnPair(undefined)).toEqual({});
		expect(splitIsbnPair('   ')).toEqual({});
	});

	it('discards malformed pieces silently', () => {
		const out = splitIsbnPair('K792138300 9788934985068');
		expect(out.isbn10).toBeUndefined();
		expect(out.isbn13).toBe('9788934985068');
	});
});
