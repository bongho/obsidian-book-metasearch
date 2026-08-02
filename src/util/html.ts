/**
 * Very small HTML stripper — good enough for Aladin/Google Books description
 * fields that occasionally contain `<b>`, `<i>`, `<br>` tags. We're NOT trying
 * to be a full-featured parser here — anything more elaborate should live in
 * a real markdown renderer or the note body itself.
 */
export function stripHtml(s: string): string {
	return s.replace(/<[^>]+>/g, '').trim();
}
