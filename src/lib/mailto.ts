// A `mailto:` href for an address shown as visible text. The address is URI-encoded, keeping the `@`
// readable, so characters such as `+` or `?` cannot change the link. Optionally prefilled with a
// subject and a body (the reply reminder, Story 3.4): both `encodeURIComponent`-encoded, the body's
// lines joined by CRLF (RFC 6068). Client-safe.

export type MailtoFields = {
	subject?: string;
	/** The body's lines; an empty string is a blank line. */
	body?: readonly string[];
};

/** `mailto:` href for `address`: "sauna+info@example.ch" → "mailto:sauna%2Binfo@example.ch". */
export function mailtoHref(address: string, fields: MailtoFields = {}): string {
	const params: string[] = [];
	if (fields.subject !== undefined) params.push(`subject=${encodeURIComponent(fields.subject)}`);
	if (fields.body !== undefined) params.push(`body=${encodeURIComponent(fields.body.join('\r\n'))}`);
	const query = params.length > 0 ? `?${params.join('&')}` : '';
	return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}${query}`;
}
