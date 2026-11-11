// Language switch helpers (FR-26, AD-11). Pure: no framework imports, testable in isolation.

/**
 * The path to return to after switching language. Only same-origin paths are accepted:
 * absolute URLs, protocol-relative `//host` and backslash tricks fall back to `/`.
 */
export function safeReturnPath(to: string | null): string {
	if (!to || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/';
	// Control characters (e.g. a newline) never belong in a redirect target.
	for (const char of to) {
		const code = char.charCodeAt(0);
		if (code < 0x20 || code === 0x7f) return '/';
	}
	// A Location header must be ASCII: percent-encode anything beyond (e.g. `/über`).
	return to.replace(/[^\x20-\x7e]+/gu, (chars) => encodeURIComponent(chars));
}

/** The query of a language-switch link (`/lang/{locale}` + this) that returns to the current page. */
export function returnQuery(pathname: string, search: string): `?${string}` {
	return `?to=${encodeURIComponent(pathname + search)}`;
}

/** `<html lang>` value: German is Swiss German, English stays plain `en` (UX-DR74). */
export function htmlLang(locale: string): string {
	return locale === 'de' ? 'de-CH' : locale;
}
