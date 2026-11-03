import { afterEach, describe, expect, it, vi } from 'vitest';

import BookMetasearchPlugin from './main';
import { ALADIN_API_RETIRED_ON } from './apis/aladin';

/**
 * The slice of `App` that `onload()` actually touches. Commands register their
 * callbacks lazily, so nothing here is called during load except the workspace
 * and vault listeners.
 */
function appStub() {
	return {
		workspace: {
			on: vi.fn(),
			getActiveFile: () => null,
			onLayoutReady: (cb: () => void) => cb(),
		},
		vault: {
			on: vi.fn(),
			getMarkdownFiles: () => [],
			getAbstractFileByPath: () => null,
		},
		metadataCache: { on: vi.fn(), getFileCache: () => null },
		plugins: { enabledPlugins: new Set<string>(), plugins: {} },
		loadLocalStorage: () => null,
		saveLocalStorage: () => undefined,
	};
}

/** Loads the plugin with the clock pinned, and reports the search registry. */
async function registeredIds(at: Date): Promise<string[]> {
	vi.setSystemTime(at);
	const plugin = new BookMetasearchPlugin(appStub() as never, {} as never);
	await plugin.onload();
	return plugin.registry.list().map((p) => p.id);
}

describe('provider registration', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('carries Aladin while its Open API is still serving keys', async () => {
		vi.useFakeTimers();

		expect(await registeredIds(new Date(2026, 9, 29, 12, 0, 0))).toEqual([
			'yes24',
			'aladin',
			'kakao',
			'google',
			'openlibrary',
		]);
	});

	it(`drops Aladin from the search path on ${ALADIN_API_RETIRED_ON}`, async () => {
		// A registered dead provider fails silently: `sequential` moves to the
		// next one and `fanout` files the error in a field the search modal
		// never reads, so nothing would tell the user it is gone.
		vi.useFakeTimers();

		expect(await registeredIds(new Date(2026, 9, 30, 0, 0, 0))).toEqual([
			'yes24',
			'kakao',
			'google',
			'openlibrary',
		]);
	});
});
