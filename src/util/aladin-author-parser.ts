/**
 * Aladin returns `author` as a single string with mixed roles:
 *   "홍길동, 김철수 (지은이), 이영희, 박민수 (옮긴이)"
 * Role marker attaches to the LAST name in a comma group and applies to every
 * preceding name in that group until the next role marker.
 *
 * Recognized role markers (Aladin-specific):
 *   지은이 / 옮긴이 / 엮은이 / 감수 / 글 / 그림 / 사진 / 원저 / 편저
 *
 * Rules:
 * - Names before the first marker are treated as authors (default role).
 * - `옮긴이` → translators.
 * - Other roles all bucket into authors (S1 simplification; S3+ may split further).
 * - Empty string → empty arrays.
 *
 * The function is a pure utility — no dependencies, easy to unit test.
 */

export interface AladinAuthorParts {
	authors: string[];
	translators: string[];
}

const TRANSLATOR_MARKERS = new Set(['옮긴이']);
const KNOWN_MARKERS = /^(.+?)\s*\((지은이|옮긴이|엮은이|감수|글|그림|사진|원저|편저)\)\s*$/;

export function parseAladinAuthor(raw: string): AladinAuthorParts {
	const authors: string[] = [];
	const translators: string[] = [];
	if (!raw || !raw.trim()) return { authors, translators };

	// Split by commas that are NOT inside parentheses.
	// Aladin never nests parens, so a simple state machine works.
	const segments = splitTopLevelCommas(raw);

	// Buffered names waiting for a role marker. Flushed when a marker is hit.
	let buffered: string[] = [];

	for (const seg of segments) {
		const trimmed = seg.trim();
		if (!trimmed) continue;

		const match = trimmed.match(KNOWN_MARKERS);
		if (match) {
			const name = match[1] ?? '';
			const role = match[2] ?? '';
			const nameTrimmed = name.trim();
			const bucket = TRANSLATOR_MARKERS.has(role) ? translators : authors;
			for (const b of buffered) bucket.push(b);
			buffered = [];
			if (nameTrimmed) bucket.push(nameTrimmed);
		} else {
			buffered.push(trimmed);
		}
	}

	// Any remaining unlabeled names → authors (default role).
	for (const b of buffered) authors.push(b);

	return { authors, translators };
}

function splitTopLevelCommas(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		else if (ch === ',' && depth === 0) {
			out.push(s.slice(start, i));
			start = i + 1;
		}
	}
	out.push(s.slice(start));
	return out;
}
