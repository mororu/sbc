// A `mailto:` href for an address shown as visible text. The address is URI-encoded, keeping the `@`
// readable, so characters such as `+` or `?` cannot change the link. Client-safe.

/** `mailto:` href for `address`: "sauna+info@example.ch" → "mailto:sauna%2Binfo@example.ch". */
export function mailtoHref(address: string): string {
	return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}`;
}
