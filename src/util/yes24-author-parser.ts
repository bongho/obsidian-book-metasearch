/**
 * YES24 returns `author` as a single string of slash-separated role groups:
 *   "유발 하라리 저/조현욱 역/이태수 감수"
 *   "설민석,스토리박스 글/정현희 그림/태건 역사 연구소 감수"
 *
 * Grammar (observed over ~260 author strings across 10 category queries):
 * - Groups are separated by `/`; each group ends with a bare role token.
 * - Within a group, multiple names are comma-separated and share the role.
 * - Role vocabulary, by observed frequency:
 *     저(145) 역(45) 글그림(11) 글,그림(8) 글(8) 그림(8) 등저(8) 원저(6)
 *     감수(6) 편집부(4) 사진(4) 공저(4) 해제(1) 편저(1) 등글(1) 기획(1)
 * - A group may carry no role at all (music/goods items: "제시카", "The Beatles")
 *   → treated as authors, matching the Aladin parser's default-role rule.
 *
 * Differences from `parseAladinAuthor`, which is why this is a separate file
 * rather than a shared parser: Aladin parenthesizes roles and separates groups
 * with commas ("홍길동 (지은이), 이영희 (옮긴이)"), so the two grammars share no
 * tokens. The Aladin parser is also scheduled for removal once the Aladin
 * provider goes (API shuts down 2026-10-30).
 *
 * Bucketing follows the S1 simplification: only translator roles split out;
 * every other role buckets into `authors`.
 *
 * The function is a pure utility — no dependencies, easy to unit test.
 */

export interface Yes24AuthorParts {
	authors: string[];
	translators: string[];
}

const TRANSLATOR_ROLES = new Set(['역', '편역', '옮김']);

/**
 * Sorted longest-first so `편역` is matched before `역` and `글,그림` before `글`.
 * `글,그림` carries a comma, so roles must be matched against the whole group
 * before the group is split on commas into names.
 */
const ROLES = [
	'글,그림',
	'글그림',
	'편집부',
	'편역',
	'원저',
	'편저',
	'등저',
	'공저',
	'등글',
	'감수',
	'해제',
	'기획',
	'그림',
	'옮김',
	'엮음',
	'사진',
	'저',
	'역',
	'글',
	'편',
].sort((a, b) => b.length - a.length);

/**
 * Roles observed glued to the preceding name with no separating space
 * ("요나스 메카스저/김현우 역"). Restricted to the two highest-frequency roles:
 * stripping a glued `글` or `편` would risk truncating a real name.
 */
const GLUED_ROLES = new Set(['저', '역']);

interface RoleMatch {
	names: string;
	role: string;
}

export function parseYes24Author(raw: string): Yes24AuthorParts {
	const authors: string[] = [];
	const translators: string[] = [];
	if (!raw || !raw.trim()) return { authors, translators };

	for (const group of raw.split('/')) {
		const trimmed = group.trim();
		if (!trimmed) continue;

		const match = matchRole(trimmed);
		const bucket =
			match && TRANSLATOR_ROLES.has(match.role) ? translators : authors;
		for (const name of splitNames(match ? match.names : trimmed)) {
			bucket.push(name);
		}
	}

	return { authors, translators };
}

/** Peel a trailing role token off a group. Returns null when none applies. */
function matchRole(group: string): RoleMatch | null {
	for (const role of ROLES) {
		if (group === role) return { names: '', role };
		if (group.endsWith(role)) {
			const head = group.slice(0, -role.length);
			// Space-separated is the documented form.
			if (/\s$/.test(head)) return { names: head.trimEnd(), role };
			// Glued form — only for roles where stripping can't eat a name.
			if (head.length > 0 && GLUED_ROLES.has(role)) {
				return { names: head, role };
			}
		}
	}
	return null;
}

/** Names inside one role group are comma-separated; whitespace is noisy. */
function splitNames(names: string): string[] {
	return names
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}
