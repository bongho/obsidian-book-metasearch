import { App, normalizePath, TFile } from 'obsidian';

import type { Book } from '../apis/base';
import type { BookMetasearchSettings } from '../settings';
import { sanitizeFilename } from '../util/sanitize';

/**
 * Turns a `Book` from the search modal into a note file in the vault, matching
 * bongho's existing `85. References (Book Search)/` schema (measured from the
 * live vault template + real notes).
 *
 * Frontmatter shape (S1, per PRD Aladin mapping):
 *
 *   type: reference
 *   tags: [book]
 *   created: 2026-08-02 21:15
 *   status: inProgress
 *   title, subtitle
 *   author:   [원저자, ...]
 *   authors:  [역자, ...]        (empty array if no translator)
 *   category: [leaf]
 *   categories: [국내도서, 인문학, ...]  (full path)
 *   publisher, publish (연도), total (pages)
 *   isbn: "isbn10 isbn13"  (space-joined per bongho vault convention)
 *   cover: <url>
 *   localCover: <coverFolder>/<filename>.jpg
 *   provider: aladin
 *   provider_url: <link>
 *
 * Body:
 *   # 📚 Book Reference — <title>
 *   ## Why to Read
 *   ## Abstract / Description  (Aladin description, HTML-stripped)
 *   <!-- BOOKSEARCH:AUTO-START --> ... <!-- BOOKSEARCH:AUTO-END -->
 *   Credit link (Aladin ToS)
 *
 * S1 stores `cover: <url>` and `localCover: <derived path>`; actual binary
 * download lands in S4.
 */
export class NoteWriter {
	constructor(
		private readonly app: App,
		private readonly settings: BookMetasearchSettings,
	) {}

	async create(book: Book): Promise<TFile> {
		const folder = normalizePath(this.settings.notesFolder);
		const filename = this.buildFilename(book);
		const path = normalizePath(`${folder}/${filename}.md`);

		if (await this.app.vault.adapter.exists(path)) {
			throw new Error(`이미 존재하는 노트: ${path}`);
		}
		if (!(await this.app.vault.adapter.exists(folder))) {
			await this.app.vault.createFolder(folder);
		}

		const content = await this.renderContent(book, filename);
		return this.app.vault.create(path, content);
	}

	private async renderContent(book: Book, filename: string): Promise<string> {
		const templatePath = this.settings.templateFile.trim();
		if (templatePath) {
			const rendered = await this.renderFromTemplate(
				book,
				filename,
				normalizePath(templatePath),
			);
			if (rendered !== null) return rendered;
			// Template missing or unreadable — fall through to built-in skeleton.
		}
		return this.render(book, filename);
	}

	/**
	 * Load a template file and substitute {{variables}}. Templater `<% ... %>`
	 * blocks are preserved verbatim so the Templater plugin can execute them
	 * post-creation (if installed).
	 *
	 * Returns null if the template can't be loaded — caller falls back to the
	 * built-in skeleton.
	 */
	private async renderFromTemplate(
		book: Book,
		filename: string,
		templatePath: string,
	): Promise<string | null> {
		try {
			if (!(await this.app.vault.adapter.exists(templatePath))) {
				return null;
			}
			const template = await this.app.vault.adapter.read(templatePath);
			return this.substituteVariables(template, book, filename);
		} catch (e) {
			console.warn(
				`[book-metasearch] template load failed (${templatePath}), falling back to skeleton`,
				e,
			);
			return null;
		}
	}

	private substituteVariables(
		template: string,
		book: Book,
		filename: string,
	): string {
		const localCover = book.coverUrl
			? `${this.settings.coverFolder}/${filename}.jpg`
			: '';
		const created = formatCreated(new Date());

		const vars: Record<string, string> = {
			title: book.title,
			subtitle: book.subtitle ?? '',
			author: book.authors.join(', '),
			authors: (book.translators ?? []).join(', '),
			category: book.categoryLeaf ?? '',
			categories: (book.categories ?? []).join(', '),
			publisher: book.publisher ?? '',
			publish: book.publishYear ?? '',
			publishDate: book.publishYear ?? '', // anpigon-compatible alias
			publishYear: book.publishYear ?? '',
			total: book.pageCount != null ? String(book.pageCount) : '',
			totalPage: book.pageCount != null ? String(book.pageCount) : '',
			pageCount: book.pageCount != null ? String(book.pageCount) : '',
			isbn: book.isbn13 || book.isbn10 || '',
			isbn10: book.isbn10 ?? '',
			isbn13: book.isbn13 ?? '',
			cover: book.coverUrl ?? '',
			coverUrl: book.coverUrl ?? '',
			localCover,
			localCoverImage: localCover,
			description: book.description ?? '',
			provider: book.provider,
			provider_url: book.providerUrl ?? '',
			providerUrl: book.providerUrl ?? '',
			created,
		};

		return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
			if (key in vars) return vars[key];
			return match; // Unknown placeholder → leave for Templater / manual fill
		});
	}

	private buildFilename(book: Book): string {
		const template = this.settings.fileNameFormat || '{{title}} - {{author}}';
		const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
			switch (key) {
				case 'title':
					return book.title;
				case 'subtitle':
					return book.subtitle ?? '';
				case 'author':
					return book.authors[0] ?? '저자미상';
				case 'authors':
					return book.authors.join(', ');
				case 'publisher':
					return book.publisher ?? '';
				case 'publishYear':
					return book.publishYear ?? '';
				case 'isbn':
					return book.isbn13 || book.isbn10 || '';
				default:
					return '';
			}
		});
		return sanitizeFilename(rendered);
	}

	private render(book: Book, filenameStem: string): string {
		const localCover =
			book.coverUrl
				? `${this.settings.coverFolder}/${filenameStem}.jpg`
				: '';
		const isbnCombined = [book.isbn10, book.isbn13]
			.filter(Boolean)
			.join(' ');
		const created = formatCreated(new Date());

		const lines: string[] = [];
		lines.push('---');
		lines.push('type: reference');
		lines.push('tags:');
		lines.push('  - book');
		lines.push(`created: ${created}`);
		lines.push('status: inProgress');
		lines.push(`title: ${yamlQuote(book.title)}`);
		// Always emit subtitle field (empty string when absent) — matches bongho
		// vault convention so Bases/Dataview queries stay consistent.
		lines.push(`subtitle: ${yamlQuote(book.subtitle ?? '')}`);
		lines.push(`author: ${yamlArray(book.authors)}`);
		lines.push(`authors: ${yamlArray(book.translators ?? [])}`);
		if (book.categoryLeaf) {
			lines.push(`category: ${yamlArray([book.categoryLeaf])}`);
		} else {
			lines.push('category: []');
		}
		lines.push(`categories: ${yamlArray(book.categories ?? [])}`);
		if (book.publisher) {
			lines.push(`publisher: ${yamlScalar(book.publisher)}`);
		}
		if (book.publishYear) {
			lines.push(`publish: ${book.publishYear}`);
		}
		// Always emit total field (empty when Aladin doesn't provide itemPage).
		lines.push(`total: ${book.pageCount ?? ''}`);
		if (isbnCombined) {
			lines.push(`isbn: ${yamlQuote(isbnCombined)}`);
		}
		if (book.coverUrl) {
			lines.push(`cover: ${book.coverUrl}`);
		}
		if (localCover) {
			lines.push(`localCover: ${localCover}`);
		}
		lines.push(`provider: ${book.provider}`);
		if (book.providerUrl) {
			lines.push(`provider_url: ${book.providerUrl}`);
		}
		lines.push('---');
		lines.push('');
		lines.push(`# 📚 Book Reference — ${book.title}`);
		lines.push('');
		lines.push('## Why to Read');
		lines.push('- ');
		lines.push('');
		lines.push('## Abstract / Description');
		lines.push('');
		lines.push('<!-- BOOKSEARCH:AUTO-START -->');
		lines.push('<!-- BOOKSEARCH:AUTO-END -->');

		if (
			this.settings.aladinCreditEnabled &&
			book.provider === 'aladin' &&
			book.providerUrl
		) {
			lines.push('');
			lines.push('---');
			lines.push('');
			lines.push(`*Book DB by [Aladin](${book.providerUrl})*`);
		}

		return lines.join('\n') + '\n';
	}
}

// ────────────────────────────────────────────────────────────
// YAML helpers — simple string escaping, not a full YAML encoder.
// We stay conservative and always quote user-supplied string values.

function yamlQuote(s: string): string {
	const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function yamlScalar(s: string): string {
	// Publisher etc. — quote only if the string contains YAML-special chars.
	if (/[:#\-\[\]{}&*!|>'"%@`,\n]/.test(s) || s.trim() !== s) {
		return yamlQuote(s);
	}
	return s;
}

function yamlArray(items: readonly string[]): string {
	if (items.length === 0) return '[]';
	return '[' + items.map((it) => yamlScalar(it)).join(', ') + ']';
}

function formatCreated(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}`
	);
}
