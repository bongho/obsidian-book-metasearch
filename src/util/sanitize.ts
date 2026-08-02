/**
 * Filesystem-safe filename derived from arbitrary text.
 *
 * Obsidian / macOS / Windows all reject these characters in filenames:
 *   / \ : * ? " < > |
 * We also strip control chars, collapse whitespace, trim leading/trailing dots
 * (Windows quirk), and cap length to 200 chars so total path stays comfortably
 * under most filesystem limits.
 *
 * Empty output falls back to "untitled" so callers never produce a broken path.
 */
export function sanitizeFilename(input: string): string {
	if (!input) return 'untitled';

	let s = input;
	// Replace disallowed chars with spaces (preserve word separation)
	s = s.replace(/[/\\:*?"<>|]/g, ' ');
	// Remove ASCII control chars
	// eslint-disable-next-line no-control-regex
	s = s.replace(/[\x00-\x1f\x7f]/g, '');
	// Collapse repeated whitespace
	s = s.replace(/\s+/g, ' ').trim();
	// Trim leading/trailing dots (Windows)
	s = s.replace(/^\.+|\.+$/g, '').trim();
	// Cap length (leave room for `.md` extension and folders)
	if (s.length > 200) s = s.slice(0, 200).trim();

	return s || 'untitled';
}
