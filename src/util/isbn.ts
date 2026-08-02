/**
 * ISBN validation & manipulation utilities.
 *
 * ISBN10: 9 digits + [0-9X] check digit.
 * ISBN13: 13 digits (always starts with 978 or 979 in practice).
 *
 * Aladin's `isbn` field occasionally holds an internal K-code
 * (e.g. "K792138300") for eBooks / partner-exclusive items — those must be
 * filtered out. Kakao returns both isbn10 and isbn13 space-separated in a
 * single `isbn` field.
 */

const ISBN10_RE = /^[0-9]{9}[0-9X]$/i;
const ISBN13_RE = /^[0-9]{13}$/;

/** True when the input is a well-formed ISBN10 (checksum not verified). */
export function isRealIsbn10(s: string | undefined | null): s is string {
	return typeof s === 'string' && ISBN10_RE.test(s);
}

/** True when the input is a well-formed ISBN13. */
export function isRealIsbn13(s: string | undefined | null): s is string {
	return typeof s === 'string' && ISBN13_RE.test(s);
}

/** Remove hyphens, spaces, and other non-ISBN chars. Keeps X for isbn10. */
export function cleanIsbn(s: string): string {
	return s.replace(/[^0-9Xx]/g, '');
}

/**
 * Split a space-separated "isbn10 isbn13" pair (Kakao format) into components,
 * discarding malformed pieces. Order in the source string is ignored — pieces
 * are assigned by length.
 */
export function splitIsbnPair(raw: string | undefined): {
	isbn10?: string;
	isbn13?: string;
} {
	if (!raw) return {};
	const out: { isbn10?: string; isbn13?: string } = {};
	for (const rawPart of raw.split(/\s+/)) {
		const p = cleanIsbn(rawPart);
		if (!p) continue;
		if (isRealIsbn10(p)) out.isbn10 = p;
		else if (isRealIsbn13(p)) out.isbn13 = p;
	}
	return out;
}
