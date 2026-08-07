import type { Book } from '../apis/base';

export type CitationStyle = 'wikilink' | 'wikilink-alias';

/**
 * Format a Book as an inline citation for insertion at the editor cursor.
 *
 * `wikilink` — `[[Sapiens]] (유발 하라리, 2015)`
 * `wikilink-alias` — `[[Sapiens|유발 하라리, Sapiens (2015)]]`
 *
 * `targetTitle` overrides the wikilink target when a matching vault note
 * exists (its basename may not equal `book.title` if the user renamed).
 * When empty, the book title is used as-is — Obsidian renders it as an
 * unresolved link that becomes real when the note is created.
 *
 * Missing author / year fields are omitted gracefully rather than emitting
 * empty parentheses.
 */
export function formatCitation(
	book: Pick<Book, 'title' | 'authors' | 'publishYear'>,
	style: CitationStyle,
	targetTitle?: string,
): string {
	const target = (targetTitle ?? book.title).trim();
	const author = book.authors[0]?.trim() ?? '';
	const year = book.publishYear?.trim() ?? '';
	const parts = [author, year].filter(Boolean).join(', ');

	if (style === 'wikilink-alias') {
		const alias = [parts, book.title].filter(Boolean).join(' — ');
		return alias && alias !== target
			? `[[${target}|${alias}]]`
			: `[[${target}]]`;
	}

	// default: 'wikilink'
	return parts ? `[[${target}]] (${parts})` : `[[${target}]]`;
}
