/**
 * Minimal Obsidian API stubs for Vitest.
 *
 * Real Obsidian is an Electron runtime injected into the plugin at load time,
 * so unit tests cannot import it. We supply just enough surface for the code
 * under test to instantiate: types, sentinel classes, and pure helpers.
 *
 * Anything not exported here that a test file imports from 'obsidian' will
 * fail with "not exported" — grow the stub as new call sites appear.
 *
 * `no-explicit-any` is turned off for this file via the eslint config's
 * `src/__mocks__/**` override, so intentional `any` in these signatures is
 * allowed without per-line eslint-disable directives.
 */

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
}

export class Notice {
	constructor(
		public message: string,
		public timeout?: number,
	) {}
}

export class TFile {
	path = '';
	name = '';
	basename = '';
	extension = 'md';
	parent: unknown = null;
	stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder {
	path = '';
	name = '';
	children: TFile[] = [];
}

export class Modal {
	constructor(public app: any) {}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class SuggestModal<T> extends Modal {
	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	onChooseSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class Plugin {
	constructor(public app: any, public manifest: unknown) {}
	async loadData(): Promise<unknown> {
		return null;
	}
	async saveData(_data: unknown): Promise<void> {}
	addCommand(_cmd: unknown): void {}
	addSettingTab(_tab: unknown): void {}
	registerEvent(_ev: unknown): void {}
}

export class PluginSettingTab {
	constructor(public app: any, public plugin: unknown) {}
	display(): void {}
	hide(): void {}
}

export class Setting {
	constructor(public containerEl: any) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (t: any) => void): this {
		return this;
	}
	addToggle(_cb: (t: any) => void): this {
		return this;
	}
	addDropdown(_cb: (d: any) => void): this {
		return this;
	}
	addButton(_cb: (b: any) => void): this {
		return this;
	}
}

/** Not used in unit tests — every request goes through mocks. */
export async function requestUrl(_opts: unknown): Promise<{
	status: number;
	text: string;
	arrayBuffer: ArrayBuffer;
	json: any;
}> {
	throw new Error(
		'obsidian mock: requestUrl must be stubbed per-test via vi.mock or dependency injection',
	);
}

// Type-only exports satisfy `import type` sites in the codebase.
export type App = any;
export type Editor = any;
export type MarkdownView = any;
