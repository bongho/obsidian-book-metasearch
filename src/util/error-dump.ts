import { App, normalizePath, TFile } from 'obsidian';

import type { BookMetasearchSettings } from '../settings';
import type { HealthStatus } from '../apis/base';

/**
 * Dumps a plugin failure (healthcheck / migration / search) to a markdown note
 * in the vault so users have a concrete artifact to attach to a bug report.
 *
 * Design notes:
 *  - **Never throws** — dumping the error must not compound the original error.
 *  - Secrets configured in `settings` are redacted before writing. Any future
 *    secret field on `BookMetasearchSettings` matching the SECRET_FIELDS heuristic
 *    (name ending in `Key`, `Token`, `Secret`, `Password`) is auto-redacted.
 *  - File naming: `<errorDumpFolder>/YYYY-MM-DD HHMM - <kind>-<provider>.md`.
 *  - Returns the created TFile or null on any failure. Null is expected in
 *    tests where `app.vault.create` is stubbed.
 */

export interface DumpErrorInput {
	kind: 'healthcheck' | 'migration' | 'search' | 'other';
	provider?: string;
	/** Original error — Error, HealthStatus, or arbitrary. */
	error: unknown;
	/** Any additional structured context to include. */
	context?: Record<string, unknown>;
}

const SECRET_SUFFIX_RE = /(Key|Token|Secret|Password)$/;

/**
 * Detect secret-carrying setting fields by name convention and replace their
 * values in `text` with `***REDACTED***`. Very short values (< 6 chars) are
 * skipped since they're unlikely to be real secrets and might collide with
 * common words.
 */
export function redactSecrets(
	text: string,
	settings: BookMetasearchSettings,
): string {
	let out = text;
	for (const [key, value] of Object.entries(settings)) {
		if (typeof value !== 'string') continue;
		if (!SECRET_SUFFIX_RE.test(key)) continue;
		if (value.length < 6) continue;
		const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		out = out.replace(new RegExp(escaped, 'g'), '***REDACTED***');
	}
	return out;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function formatTimestamp(d: Date): string {
	return (
		`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
		`${pad2(d.getHours())}${pad2(d.getMinutes())}`
	);
}

function stringifyError(error: unknown): {
	message: string;
	code?: string;
	stack?: string;
} {
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}
	if (typeof error === 'object' && error !== null) {
		const h = error as Partial<HealthStatus & { message: string }>;
		if ('ok' in h && h.ok === false) {
			return { message: h.message ?? 'health check failed', code: h.code };
		}
		try {
			return { message: JSON.stringify(error) };
		} catch {
			return { message: Object.prototype.toString.call(error) };
		}
	}
	if (typeof error === 'string') return { message: error };
	if (typeof error === 'number' || typeof error === 'boolean') {
		return { message: String(error) };
	}
	return { message: Object.prototype.toString.call(error) };
}

function renderNote(
	input: DumpErrorInput,
	settings: BookMetasearchSettings,
	now: Date,
): string {
	const err = stringifyError(input.error);
	const lines: string[] = [];
	lines.push('---');
	lines.push('type: reference');
	lines.push('tags: [book-metasearch, error-dump]');
	lines.push(`created: ${now.toISOString()}`);
	lines.push(`kind: ${input.kind}`);
	if (input.provider) lines.push(`provider: ${input.provider}`);
	if (err.code) lines.push(`error_code: ${err.code}`);
	lines.push('---');
	lines.push('');
	lines.push(`# ⚠️ Book Metasearch error — ${input.kind}${input.provider ? ` · ${input.provider}` : ''}`);
	lines.push('');
	lines.push('## Error');
	lines.push('');
	lines.push('```');
	lines.push(redactSecrets(err.message, settings));
	if (err.code) lines.push(`code: ${err.code}`);
	lines.push('```');
	if (err.stack) {
		lines.push('');
		lines.push('### Stack');
		lines.push('');
		lines.push('```');
		lines.push(redactSecrets(err.stack, settings));
		lines.push('```');
	}
	if (input.context && Object.keys(input.context).length > 0) {
		lines.push('');
		lines.push('## Context');
		lines.push('');
		lines.push('```json');
		lines.push(redactSecrets(JSON.stringify(input.context, null, 2), settings));
		lines.push('```');
	}
	lines.push('');
	lines.push('## What to do');
	lines.push('');
	lines.push(
		'Attach this file (or its contents) to a GitHub issue at ' +
			'https://github.com/bongho/obsidian-book-metasearch/issues — ' +
			'secrets have been redacted automatically. Delete this note when the issue is resolved.',
	);
	return lines.join('\n') + '\n';
}

export async function dumpErrorNote(
	app: App,
	settings: BookMetasearchSettings,
	input: DumpErrorInput,
): Promise<TFile | null> {
	try {
		const folder = normalizePath(settings.errorDumpFolder);
		if (!(await app.vault.adapter.exists(folder))) {
			await app.vault.createFolder(folder);
		}
		const now = new Date();
		const label = [input.kind, input.provider].filter(Boolean).join('-');
		const base = `${formatTimestamp(now)} - ${label}`;
		let path = normalizePath(`${folder}/${base}.md`);
		let n = 2;
		while (await app.vault.adapter.exists(path)) {
			path = normalizePath(`${folder}/${base} (${n}).md`);
			n += 1;
			if (n > 20) break;
		}
		const content = renderNote(input, settings, now);
		const file = await app.vault.create(path, content);
		return file;
	} catch (e) {
		console.warn('[book-metasearch] error-dump failed', e);
		return null;
	}
}
