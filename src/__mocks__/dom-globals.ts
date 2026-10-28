/**
 * Obsidian's DOM helper globals, for Vitest.
 *
 * Obsidian extends `Node` with `createEl`/`appendText` and installs a global
 * `createFragment`, and `eslint-plugin-obsidianmd` requires plugin code to use
 * them instead of `document.createElement`. happy-dom has no idea about any of
 * that, so the helpers the plugin actually calls are shimmed here and loaded
 * through `setupFiles`.
 *
 * Deliberately a subset: only the options the plugin passes are honoured, so a
 * call site reaching for something new fails loudly instead of silently
 * rendering an element missing half its attributes.
 *
 * `no-explicit-any` is off for `src/__mocks__/**` via the eslint config.
 */

interface CreateElOptions {
	text?: string;
	href?: string;
	cls?: string;
	attr?: Record<string, string>;
}

function createEl(
	this: Node,
	tag: string,
	options?: CreateElOptions,
): HTMLElement {
	const el = document.createElement(tag);
	if (options?.text !== undefined) el.textContent = options.text;
	if (options?.href !== undefined) el.setAttribute('href', options.href);
	if (options?.cls !== undefined) el.className = options.cls;
	for (const [name, value] of Object.entries(options?.attr ?? {})) {
		el.setAttribute(name, value);
	}
	this.appendChild(el);
	return el;
}

function appendText(this: Node, value: string): void {
	this.appendChild(document.createTextNode(value));
}

Object.assign(Node.prototype, { createEl, appendText });

(globalThis as any).createFragment = (
	callback?: (el: DocumentFragment) => void,
): DocumentFragment => {
	const fragment = document.createDocumentFragment();
	callback?.(fragment);
	return fragment;
};
