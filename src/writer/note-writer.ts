import { App, normalizePath, requestUrl, TFile } from 'obsidian';

import type { Book } from '../apis/base';
import type {
	BookMetasearchSettings,
	FrontmatterKeyCase,
} from '../settings';
import { stripHtml } from '../util/html';
import { sanitizeFilename } from '../util/sanitize';
import { DuplicateBookError, VaultBookIndex } from './vault-index';

const AUTO_START = '<!-- BOOKSEARCH:AUTO-START -->';
const AUTO_END = '<!-- BOOKSEARCH:AUTO-END -->';

/**
 * Replace whatever sits between the first `AUTO-START` / `AUTO-END` marker
 * pair with `newContent`, preserving everything else (user edits to `## Why
 * to Read`, credit links, etc.). Only the first pair is touched so nested
 * markers stay intact.
 *
 * `found: false` when either marker is missing — callers should skip the
 * modify call in that case rather than injecting new markers (that would
 * violate the "never touch user body" rule when the user has deleted the
 * auto-block on purpose).
 */
export type ReadingStatus = 'wishlist' | 'reading' | 'read';

/**
 * Pure helper for M1-B "Mark as ..." commands. Given the current frontmatter,
 * a target reading status, today's date, and the current key-case renaming
 * fn, return the set of frontmatter keys to overwrite via `processFrontMatter`.
 *
 * Idempotency: `startedAt` / `finishedAt` stamps are added only when missing —
 * transitioning `reading → wishlist → reading` never overwrites the original
 * start date.
 *
 * `today` is injected so tests don't need to stub Date.now().
 */
export function deriveStatusUpdates(
	current: Record<string, unknown>,
	target: ReadingStatus,
	today: string,
	keyOfFn: (canonical: string) => string,
): Record<string, unknown> {
	const statusKey = keyOfFn('status');
	const startedKey = keyOfFn('startedAt');
	const finishedKey = keyOfFn('finishedAt');
	const updates: Record<string, unknown> = { [statusKey]: target };

	const hasStarted = typeof current[startedKey] === 'string' && current[startedKey] !== '';
	const hasFinished = typeof current[finishedKey] === 'string' && current[finishedKey] !== '';

	if (target === 'reading' && !hasStarted) {
		updates[startedKey] = today;
	}
	if (target === 'read') {
		if (!hasFinished) updates[finishedKey] = today;
		if (!hasStarted) updates[startedKey] = today;
	}
	return updates;
}

export function replaceAutoBlock(
	body: string,
	newContent: string,
): { updated: string; found: boolean } {
	const startIdx = body.indexOf(AUTO_START);
	if (startIdx < 0) return { updated: body, found: false };
	const endIdx = body.indexOf(AUTO_END, startIdx + AUTO_START.length);
	if (endIdx < 0) return { updated: body, found: false };
	const before = body.slice(0, startIdx + AUTO_START.length);
	const after = body.slice(endIdx);
	const trimmed = newContent.trim();
	const middle = trimmed ? `\n${trimmed}\n` : '\n';
	return { updated: before + middle + after, found: true };
}

/**
 * Turns a `Book` from the search modal into a note file in the vault, matching
 * bongho's existing `85. References (Book Search)/` schema by default, but with
 * anpigon book-search style customization hooks:
 *
 *  - templateFile: use a custom markdown template for the body
 *  - useDefaultFrontmatter: turn off to only emit custom frontmatter
 *  - defaultFrontmatterKeyType: 'as-is' | camelCase | snake_case | kebab-case
 *  - frontmatterAdditional: YAML fragment appended after default block
 *  - enableCoverImageSave: actually download cover to coverFolder
 *  - openNoteAfterCreate: caller controls this
 */
export class NoteWriter {
	constructor(
		private readonly app: App,
		private readonly settings: BookMetasearchSettings,
		private readonly vaultIndex?: VaultBookIndex,
	) {}

	async create(book: Book): Promise<TFile> {
		// M1-A: ISBN dedupe runs *before* the path-existence check so that a
		// second edition (different filename, same ISBN13) is caught. Callers
		// decide how to react to DuplicateBookError based on
		// `settings.duplicateAction`.
		if (this.vaultIndex) {
			const isbnKey = book.isbn13 || book.isbn10;
			if (isbnKey) {
				const existing = this.vaultIndex.findByIsbn(isbnKey);
				if (existing) throw new DuplicateBookError(existing, isbnKey);
			}
		}

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
		const file = await this.app.vault.create(path, content);

		if (this.settings.enableCoverImageSave && book.coverUrl) {
			void this.downloadCover(book.coverUrl, filename);
		}
		return file;
	}

	/**
	 * Set the reading status on an existing book note, stamping `startedAt` /
	 * `finishedAt` on first transition (idempotent). No-op when the plugin's
	 * Reading Log is turned off.
	 */
	async setStatus(file: TFile, status: ReadingStatus): Promise<void> {
		if (!this.settings.readingStatusEnabled) return;
		const kind = this.settings.defaultFrontmatterKeyType;
		const keyFn = (k: string) => keyOf(k, kind);
		const today = formatDate(new Date());
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const updates = deriveStatusUpdates(fm, status, today, keyFn);
				Object.assign(fm, updates);
			},
		);
	}

	/**
	 * Refresh an existing note's frontmatter with fresh data from a provider,
	 * preserving user edits in the body and any manually-added frontmatter
	 * keys. Only the provider-derived fields are overwritten.
	 */
	async update(file: TFile, book: Book): Promise<void> {
		const filename = file.basename;
		const kind = this.settings.defaultFrontmatterKeyType;
		const localCover = book.coverUrl
			? `${this.settings.coverFolder}/${filename}.jpg`
			: '';
		const isbnCombined = [book.isbn10, book.isbn13]
			.filter(Boolean)
			.join(' ');

		const updates: Record<string, unknown> = {
			[keyOf('type', kind)]: 'reference',
			[keyOf('title', kind)]: book.title,
			[keyOf('subtitle', kind)]: book.subtitle ?? '',
			[keyOf('author', kind)]: book.authors,
			[keyOf('authors', kind)]: book.translators ?? [],
			[keyOf('category', kind)]: book.categoryLeaf ? [book.categoryLeaf] : [],
			[keyOf('categories', kind)]: book.categories ?? [],
			[keyOf('total', kind)]: book.pageCount ?? '',
			[keyOf('provider', kind)]: book.provider,
		};
		if (book.publisher) updates[keyOf('publisher', kind)] = book.publisher;
		if (book.publishYear) updates[keyOf('publish', kind)] = book.publishYear;
		if (isbnCombined) updates[keyOf('isbn', kind)] = isbnCombined;
		if (book.coverUrl) updates[keyOf('cover', kind)] = book.coverUrl;
		if (localCover) updates[keyOf('localCover', kind)] = localCover;
		if (book.providerUrl) updates[keyOf('providerUrl', kind)] = book.providerUrl;

		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				Object.assign(fm, updates);
			},
		);

		if (this.settings.autoFillDescription) {
			const cleaned = stripHtml(book.description ?? '');
			// process() reads and writes atomically, so a concurrent user edit
			// can't be clobbered between the two. Returning body unchanged when
			// the markers are missing leaves the note untouched.
			let markersFound = true;
			await this.app.vault.process(file, (body) => {
				const { updated, found } = replaceAutoBlock(body, cleaned);
				markersFound = found;
				return found ? updated : body;
			});
			if (!markersFound) {
				console.warn(
					`[book-metasearch] auto-block markers missing in ${file.path}; description not refreshed`,
				);
			}
		}

		if (this.settings.enableCoverImageSave && book.coverUrl) {
			void this.downloadCover(book.coverUrl, filename);
		}
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
		return this.renderSkeleton(book, filename);
	}

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
				`[book-metasearch] template load failed (${templatePath})`,
				e,
			);
			return null;
		}
	}

	private renderSkeleton(book: Book, filename: string): string {
		const lines: string[] = [];
		lines.push('---');
		if (this.settings.useDefaultFrontmatter) {
			lines.push(...this.renderDefaultFrontmatter(book, filename));
		}
		if (this.settings.frontmatterAdditional.trim()) {
			const additional = this.substituteVariables(
				this.settings.frontmatterAdditional,
				book,
				filename,
			);
			lines.push(additional.trimEnd());
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
		lines.push(AUTO_START);
		if (this.settings.autoFillDescription && book.description) {
			lines.push(stripHtml(book.description));
		}
		lines.push(AUTO_END);

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

	private renderDefaultFrontmatter(
		book: Book,
		filename: string,
	): string[] {
		const lines: string[] = [];
		const kind = this.settings.defaultFrontmatterKeyType;
		const k = (canonicalKey: string) => keyOf(canonicalKey, kind);
		const localCover = book.coverUrl
			? `${this.settings.coverFolder}/${filename}.jpg`
			: '';
		const isbnCombined = [book.isbn10, book.isbn13]
			.filter(Boolean)
			.join(' ');
		const created = formatCreated(new Date());

		lines.push(`${k('type')}: reference`);
		lines.push(`${k('tags')}:`);
		lines.push('  - book');
		lines.push(`${k('created')}: ${created}`);
		if (this.settings.readingStatusEnabled) {
			lines.push(`${k('status')}: ${this.settings.initialStatus}`);
		}
		lines.push(`${k('title')}: ${yamlQuote(book.title)}`);
		lines.push(`${k('subtitle')}: ${yamlQuote(book.subtitle ?? '')}`);
		lines.push(`${k('author')}: ${yamlArray(book.authors)}`);
		lines.push(`${k('authors')}: ${yamlArray(book.translators ?? [])}`);
		if (book.categoryLeaf) {
			lines.push(`${k('category')}: ${yamlArray([book.categoryLeaf])}`);
		} else {
			lines.push(`${k('category')}: []`);
		}
		lines.push(`${k('categories')}: ${yamlArray(book.categories ?? [])}`);
		if (book.publisher) {
			lines.push(`${k('publisher')}: ${yamlScalar(book.publisher)}`);
		}
		if (book.publishYear) {
			lines.push(`${k('publish')}: ${book.publishYear}`);
		}
		lines.push(`${k('total')}: ${book.pageCount ?? ''}`);
		if (isbnCombined) {
			lines.push(`${k('isbn')}: ${yamlQuote(isbnCombined)}`);
		}
		if (book.coverUrl) {
			lines.push(`${k('cover')}: ${book.coverUrl}`);
		}
		if (localCover) {
			lines.push(`${k('localCover')}: ${localCover}`);
		}
		lines.push(`${k('provider')}: ${book.provider}`);
		if (book.providerUrl) {
			lines.push(`${k('providerUrl')}: ${book.providerUrl}`);
		}
		return lines;
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
			publishDate: book.publishYear ?? '',
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
			const value = vars[key];
			if (value !== undefined) return value;
			return match;
		});
	}

	/**
	 * Fetch cover bytes via Obsidian requestUrl (CORS-bypass) and persist to
	 * `<coverFolder>/<filename>.jpg`. Fire-and-forget — errors are logged but
	 * not surfaced to callers so note creation stays fast.
	 */
	private async downloadCover(url: string, filename: string): Promise<void> {
		try {
			const folder = normalizePath(this.settings.coverFolder);
			if (!(await this.app.vault.adapter.exists(folder))) {
				await this.app.vault.createFolder(folder);
			}
			const path = normalizePath(`${folder}/${filename}.jpg`);
			if (await this.app.vault.adapter.exists(path)) return;

			const res = await requestUrl({ url, method: 'GET', throw: false });
			if (res.status < 200 || res.status >= 300) {
				console.warn(
					`[book-metasearch] cover download HTTP ${res.status}: ${url}`,
				);
				return;
			}
			await this.app.vault.adapter.writeBinary(path, res.arrayBuffer);
		} catch (e) {
			console.warn('[book-metasearch] cover download failed', e);
		}
	}
}

// ────────────────────────────────────────────────────────────
// key case conversion

/**
 * Field-name conventions: keys are provided in the canonical `camelCase` form
 * (e.g. `providerUrl`, `localCover`). We translate to the user-selected style
 * at render time. The 'as-is' mode preserves bongho's live vault schema
 * (localCover is camelCase but provider_url is snake_case).
 */
const AS_IS_OVERRIDES: Record<string, string> = {
	providerUrl: 'provider_url',
};

function keyOf(canonicalKey: string, kind: FrontmatterKeyCase): string {
	if (kind === 'as-is') {
		return AS_IS_OVERRIDES[canonicalKey] ?? canonicalKey;
	}
	// Split canonical camelCase into words
	const words = canonicalKey.split(/(?=[A-Z])/).map((w) => w.toLowerCase());
	switch (kind) {
		case 'camelCase':
			return (
				(words[0] ?? '') +
				words
					.slice(1)
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join('')
			);
		case 'snake_case':
			return words.join('_');
		case 'kebab-case':
			return words.join('-');
	}
}

// ────────────────────────────────────────────────────────────
// YAML helpers

function yamlQuote(s: string): string {
	const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function yamlScalar(s: string): string {
	if (/[:#[\]{}&*!|>'"%@`,\n-]/.test(s) || s.trim() !== s) {
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

/** YYYY-MM-DD only, for `startedAt` / `finishedAt` reading-log stamps. */
function formatDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
