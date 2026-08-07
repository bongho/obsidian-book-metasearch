import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';

import { VaultBookIndex } from './vault-index';

interface Fixture {
	file: TFile;
	frontmatter?: Record<string, unknown>;
}

function makeFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
	f.name = f.basename + '.md';
	return f;
}

function makeApp(fixtures: Fixture[]) {
	return {
		vault: {
			getMarkdownFiles: () => fixtures.map((f) => f.file),
			on: () => ({ id: 'noop' }),
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const hit = fixtures.find((f) => f.file === file);
				return hit?.frontmatter
					? { frontmatter: hit.frontmatter }
					: null;
			},
			on: () => ({ id: 'noop' }),
		},
	};
}

describe('VaultBookIndex', () => {
	it('indexes book notes by ISBN13 and ISBN10 when frontmatter is well-formed', () => {
		const fixtures: Fixture[] = [
			{
				file: makeFile('books/sapiens.md'),
				frontmatter: {
					type: 'reference',
					isbn: '9788934985068 8934985062',
				},
			},
			{
				file: makeFile('books/only13.md'),
				frontmatter: { type: 'reference', isbn: '9788964139165' },
			},
		];
		const idx = new VaultBookIndex(makeApp(fixtures) as never);
		idx.build();
		expect(idx.isReady()).toBe(true);
		expect(idx.findByIsbn('9788934985068')?.path).toBe('books/sapiens.md');
		expect(idx.findByIsbn('8934985062')?.path).toBe('books/sapiens.md');
		expect(idx.findByIsbn('9788964139165')?.path).toBe('books/only13.md');
	});

	it('ignores notes that are not book references or lack an isbn field', () => {
		const fixtures: Fixture[] = [
			{
				file: makeFile('notes/random.md'),
				frontmatter: { type: 'content', isbn: '9788934985068' },
			},
			{
				file: makeFile('books/no-isbn.md'),
				frontmatter: { type: 'reference', title: 'foo' },
			},
			{
				file: makeFile('plain/no-fm.md'),
			},
		];
		const idx = new VaultBookIndex(makeApp(fixtures) as never);
		idx.build();
		expect(idx.findByIsbn('9788934985068')).toBeNull();
	});

	it('returns null for lookups by malformed ISBN', () => {
		const idx = new VaultBookIndex(makeApp([]) as never);
		idx.build();
		expect(idx.findByIsbn('')).toBeNull();
		expect(idx.findByIsbn(undefined)).toBeNull();
		expect(idx.findByIsbn('not-an-isbn')).toBeNull();
	});

	it('supports space-joined lookup strings from frontmatter', () => {
		const fixtures: Fixture[] = [
			{
				file: makeFile('books/sapiens.md'),
				frontmatter: {
					type: 'reference',
					isbn: '9788934985068 8934985062',
				},
			},
		];
		const idx = new VaultBookIndex(makeApp(fixtures) as never);
		idx.build();
		expect(idx.findByIsbn('9788934985068 8934985062')?.path).toBe(
			'books/sapiens.md',
		);
	});

	it('build() is idempotent — re-calling clears prior state', () => {
		const files: Fixture[] = [
			{
				file: makeFile('books/a.md'),
				frontmatter: { type: 'reference', isbn: '9788934985068' },
			},
		];
		const app = makeApp(files);
		const idx = new VaultBookIndex(app as never);
		idx.build();
		expect(idx.findByIsbn('9788934985068')?.path).toBe('books/a.md');

		// Simulate a note being removed then re-indexed.
		files.pop();
		idx.build();
		expect(idx.findByIsbn('9788934985068')).toBeNull();
	});
});
