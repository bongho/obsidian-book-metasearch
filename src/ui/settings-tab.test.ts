import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';

import { BookMetasearchSettingTab, PRIORITY_ORDER_KEY } from './settings-tab';
import { DEFAULT_SETTINGS } from '../settings';
import type { BookMetasearchSettings } from '../settings';
import type BookMetasearchPlugin from '../main';

/**
 * The declarative API binds a control to a storage key and reads it back
 * through `getControlValue`. A key that names no settings field therefore
 * fails silently: the row renders empty and the write lands on a property
 * nothing reads. These tests exist to make that loud.
 */

/** Just enough of the plugin for the definitions and the storage bridge. */
function tabWith(
	overrides: Partial<BookMetasearchSettings> = {},
	/** Stands in for `app.secretStorage`: ids absent here resolve to ''. */
	secrets: Record<string, string> = {},
): {
	tab: BookMetasearchSettingTab;
	settings: BookMetasearchSettings;
	saves: number;
} {
	const settings: BookMetasearchSettings = {
		...DEFAULT_SETTINGS,
		...overrides,
	};
	const state = { saves: 0 };
	const plugin = {
		settings,
		secret: (id: string) => secrets[id] ?? '',
		saveSettings: async () => {
			state.saves += 1;
		},
	} as unknown as BookMetasearchPlugin;
	const tab = new BookMetasearchSettingTab({} as App, plugin);
	return {
		tab,
		settings,
		get saves() {
			return state.saves;
		},
	};
}

interface CollectedControl {
	name: string;
	type: string;
	key: string;
}

/** Flattens the definition tree down to its `control` rows. */
function collectControls(items: readonly unknown[]): CollectedControl[] {
	const out: CollectedControl[] = [];
	for (const item of items) {
		if (typeof item !== 'object' || item === null) continue;
		const record = item as Record<string, unknown>;
		if (Array.isArray(record.items)) {
			out.push(...collectControls(record.items));
		}
		const control = record.control as
			| { type?: unknown; key?: unknown }
			| undefined;
		if (!control) continue;
		out.push({
			name: String(record.name),
			type: String(control.type),
			key: String(control.key),
		});
	}
	return out;
}

describe('BookMetasearchSettingTab.getSettingDefinitions', () => {
	it('binds every control to a real settings field', () => {
		const { tab } = tabWith();
		const controls = collectControls(tab.getSettingDefinitions());
		expect(controls.length).toBeGreaterThan(0);
		const unknown = controls.filter(
			(c) => c.key !== PRIORITY_ORDER_KEY && !(c.key in DEFAULT_SETTINGS),
		);
		expect(unknown).toEqual([]);
	});

	it('never binds two controls to the same key', () => {
		const { tab } = tabWith();
		const keys = collectControls(tab.getSettingDefinitions()).map((c) => c.key);
		expect(keys).toEqual([...new Set(keys)]);
	});

	it('routes the four API keys through secret controls', () => {
		const { tab } = tabWith();
		const secrets = collectControls(tab.getSettingDefinitions())
			.filter((c) => c.type === 'secret')
			.map((c) => c.key)
			.sort();
		expect(secrets).toEqual([
			'aladinSecretId',
			'googleBooksSecretId',
			'kakaoSecretId',
			'yes24SecretId',
		]);
	});
});

describe('BookMetasearchSettingTab control storage', () => {
	it('reads a plain field straight off the settings object', () => {
		const { tab } = tabWith({ notesFolder: 'Books' });
		expect(tab.getControlValue('notesFolder')).toBe('Books');
	});

	it('writes a plain field and persists it', async () => {
		const state = tabWith();
		await state.tab.setControlValue('notesFolder', 'Shelf');
		expect(state.settings.notesFolder).toBe('Shelf');
		expect(state.saves).toBe(1);
	});

	it('falls back to the default when a text field is cleared', async () => {
		const { tab, settings } = tabWith({ notesFolder: 'Books' });
		await tab.setControlValue('notesFolder', '   ');
		expect(settings.notesFolder).toBe(DEFAULT_SETTINGS.notesFolder);
	});

	it('keeps a cleared field empty when its fallback is empty', async () => {
		const { tab, settings } = tabWith({ templateFile: 'T.md' });
		await tab.setControlValue('templateFile', '  ');
		expect(settings.templateFile).toBe('');
	});

	it('renders priorityOrder as a comma-separated string', () => {
		const { tab } = tabWith({ priorityOrder: ['yes24', 'kakao'] });
		expect(tab.getControlValue(PRIORITY_ORDER_KEY)).toBe('yes24, kakao');
	});

	it('parses priorityOrder back into a trimmed list', async () => {
		const { tab, settings } = tabWith();
		await tab.setControlValue(PRIORITY_ORDER_KEY, ' yes24 ,kakao,, google ');
		expect(settings.priorityOrder).toEqual(['yes24', 'kakao', 'google']);
	});

	it('ignores a write to a key that is not a settings field', async () => {
		const state = tabWith();
		await state.tab.setControlValue('somethingRemoved', 'x');
		expect('somethingRemoved' in state.settings).toBe(false);
		expect(state.saves).toBe(0);
	});
});

/** The description text of the row with this exact name, flattened. */
function descOf(items: readonly unknown[], name: string): string {
	for (const item of items) {
		if (typeof item !== 'object' || item === null) continue;
		const record = item as Record<string, unknown>;
		if (Array.isArray(record.items)) {
			const nested = descOf(record.items, name);
			if (nested) return nested;
		}
		if (record.name !== name) continue;
		const desc = record.desc;
		if (typeof desc === 'string') return desc;
		if (desc && typeof desc === 'object' && 'textContent' in desc) {
			return (desc as { textContent: string | null }).textContent ?? '';
		}
	}
	return '';
}

/**
 * `data.json` carries a secret's id and travels with a synced vault, while
 * `app.secretStorage` carries the value and stays on the machine. The row has
 * to tell those two apart or a second device shows a configured key that every
 * search then fails on.
 */
describe('a secret id with no value behind it', () => {
	it('warns on the row whose value this machine is missing', () => {
		const { tab } = tabWith({ yes24SecretId: 'bookmetasearchyes24' });

		const desc = descOf(tab.getSettingDefinitions(), 'YES24 API key');
		expect(desc).toContain('이 기기에는');
		// The original description has to survive alongside the warning.
		expect(desc).toContain('YES24 Open API');
	});

	it('stays quiet once the value is stored on this machine', () => {
		const { tab } = tabWith(
			{ yes24SecretId: 'bookmetasearchyes24' },
			{ bookmetasearchyes24: 'a-real-key' },
		);

		expect(descOf(tab.getSettingDefinitions(), 'YES24 API key')).not.toContain(
			'이 기기에는',
		);
	});

	it('stays quiet when no key was ever configured', () => {
		// An empty id is "not configured", which the row already conveys.
		const { tab } = tabWith();

		expect(descOf(tab.getSettingDefinitions(), 'YES24 API key')).not.toContain(
			'이 기기에는',
		);
	});

	it('warns only on the provider that is missing one', () => {
		const { tab } = tabWith({
			yes24SecretId: 'bookmetasearchyes24',
			kakaoSecretId: 'bookmetasearchkakao',
		}, { bookmetasearchkakao: 'a-real-key' });

		const defs = tab.getSettingDefinitions();
		const kakao = descOf(defs, 'Kakao REST API key');
		expect(descOf(defs, 'YES24 API key')).toContain('이 기기에는');
		// A row name that matches nothing returns '', which would pass the
		// negative assertion for the wrong reason.
		expect(kakao).not.toBe('');
		expect(kakao).not.toContain('이 기기에는');
	});
});
