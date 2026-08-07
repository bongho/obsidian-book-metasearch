import { describe, expect, it } from 'vitest';

import { deriveStatusUpdates, replaceAutoBlock } from './note-writer';

const identity = (k: string) => k;
const TODAY = '2026-08-07';

const START = '<!-- BOOKSEARCH:AUTO-START -->';
const END = '<!-- BOOKSEARCH:AUTO-END -->';

describe('replaceAutoBlock', () => {
	it('replaces content between the first marker pair, preserving surrounding text', () => {
		const body = [
			'## Why to Read',
			'- user note',
			'',
			'## Abstract / Description',
			'',
			START,
			'stale description',
			END,
			'',
			'trailing user text',
			'',
		].join('\n');
		const { updated, found } = replaceAutoBlock(body, 'fresh description');
		expect(found).toBe(true);
		expect(updated).toContain('- user note');
		expect(updated).toContain('trailing user text');
		expect(updated).toContain(`${START}\nfresh description\n${END}`);
		expect(updated).not.toContain('stale description');
	});

	it('returns found=false when start marker is missing (never injects new markers)', () => {
		const body = 'user-only content, no auto block\n';
		const { updated, found } = replaceAutoBlock(body, 'ignored');
		expect(found).toBe(false);
		expect(updated).toBe(body);
	});

	it('collapses empty content to a single blank line between markers', () => {
		const body = `${START}\nprevious\n${END}`;
		const { updated, found } = replaceAutoBlock(body, '   ');
		expect(found).toBe(true);
		expect(updated).toBe(`${START}\n${END}`);
	});

	it('touches only the first pair when the body contains multiple auto blocks', () => {
		const body = `${START}\nA\n${END}\n\n${START}\nB\n${END}`;
		const { updated, found } = replaceAutoBlock(body, 'X');
		expect(found).toBe(true);
		expect(updated.startsWith(`${START}\nX\n${END}`)).toBe(true);
		expect(updated).toContain(`${START}\nB\n${END}`);
	});

	it('returns found=false when end marker precedes start marker only variant is missing', () => {
		const body = `content ${START} but no end marker`;
		const { updated, found } = replaceAutoBlock(body, 'ignored');
		expect(found).toBe(false);
		expect(updated).toBe(body);
	});
});

describe('deriveStatusUpdates', () => {
	it('wishlist target only sets status', () => {
		const out = deriveStatusUpdates({}, 'wishlist', TODAY, identity);
		expect(out).toEqual({ status: 'wishlist' });
	});

	it('reading target stamps startedAt when missing', () => {
		const out = deriveStatusUpdates({}, 'reading', TODAY, identity);
		expect(out).toEqual({ status: 'reading', startedAt: TODAY });
	});

	it('reading target preserves existing startedAt (idempotent)', () => {
		const out = deriveStatusUpdates(
			{ startedAt: '2025-01-01' },
			'reading',
			TODAY,
			identity,
		);
		expect(out).toEqual({ status: 'reading' });
	});

	it('read target stamps finishedAt AND startedAt if both are missing', () => {
		const out = deriveStatusUpdates({}, 'read', TODAY, identity);
		expect(out).toEqual({
			status: 'read',
			startedAt: TODAY,
			finishedAt: TODAY,
		});
	});

	it('read target only adds finishedAt when startedAt already exists', () => {
		const out = deriveStatusUpdates(
			{ startedAt: '2025-01-01' },
			'read',
			TODAY,
			identity,
		);
		expect(out).toEqual({ status: 'read', finishedAt: TODAY });
	});

	it('honors key-case renaming (snake_case)', () => {
		const rename = (k: string) =>
			({
				status: 'status',
				startedAt: 'started_at',
				finishedAt: 'finished_at',
			})[k] ?? k;
		const out = deriveStatusUpdates({}, 'read', TODAY, rename);
		expect(out).toEqual({
			status: 'read',
			started_at: TODAY,
			finished_at: TODAY,
		});
	});
});
