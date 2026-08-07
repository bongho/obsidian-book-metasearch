import { describe, expect, it } from 'vitest';

import { formatCitation } from './citation';

const sapiens = {
	title: 'Sapiens',
	authors: ['유발 하라리'],
	publishYear: '2015',
};

describe('formatCitation — wikilink', () => {
	it('renders "[[title]] (author, year)" when both parts exist', () => {
		expect(formatCitation(sapiens, 'wikilink')).toBe(
			'[[Sapiens]] (유발 하라리, 2015)',
		);
	});

	it('drops parentheses when author and year are both missing', () => {
		expect(
			formatCitation(
				{ title: 'Sapiens', authors: [], publishYear: undefined },
				'wikilink',
			),
		).toBe('[[Sapiens]]');
	});

	it('renders year-only when author is missing', () => {
		expect(
			formatCitation(
				{ title: 'Sapiens', authors: [], publishYear: '2015' },
				'wikilink',
			),
		).toBe('[[Sapiens]] (2015)');
	});

	it('honors targetTitle override (existing vault note basename)', () => {
		expect(
			formatCitation(sapiens, 'wikilink', '20200105 - Sapiens - 하라리'),
		).toBe('[[20200105 - Sapiens - 하라리]] (유발 하라리, 2015)');
	});
});

describe('formatCitation — wikilink-alias', () => {
	it('renders "[[target|author, year — title]]" when target differs from title', () => {
		expect(
			formatCitation(sapiens, 'wikilink-alias', '20200105 - Sapiens - 하라리'),
		).toBe('[[20200105 - Sapiens - 하라리|유발 하라리, 2015 — Sapiens]]');
	});

	it('collapses to plain wikilink when target equals title (no alias)', () => {
		expect(formatCitation(sapiens, 'wikilink-alias')).toBe(
			'[[Sapiens|유발 하라리, 2015 — Sapiens]]',
		);
	});
});
