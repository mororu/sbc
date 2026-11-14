// The one email layout (UX: email format). Blocks in, `{ subject, html, text }` out: the HTML and
// the plain-text part carry the same content in the same order. The HTML root has `lang`, the
// `color-scheme` meta is set, and nothing sets a colour: no wrapper backgrounds, no images, no
// tracking. Every email ends with the signature. Pure.
import { htmlLang } from '#lib/i18n/locale-switch.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/time/index.ts';

/** Text, or a link: a `mailto:` or `tel:` href with the address or number as its visible text. */
export type Inline = string | { text: string; href: string };

export type Block =
	| { type: 'heading'; text: string }
	| { type: 'paragraph'; content: Inline[] }
	/** Label–value lines: "Date: Tue 12 January". */
	| { type: 'details'; items: { term: string; value: string }[] };

export type RenderedEmail = {
	subject: string;
	html: string;
	text: string;
	/** The `lang` of the HTML root and the `Content-Language` header: `de-CH` or `en`. */
	lang: string;
};

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function inlineHtml(content: Inline[]): string {
	return content
		.map((part) =>
			typeof part === 'string' ? escapeHtml(part) : `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`
		)
		.join('');
}

function inlineText(content: Inline[]): string {
	return content.map((part) => (typeof part === 'string' ? part : part.text)).join('');
}

function blockHtml(block: Block): string {
	switch (block.type) {
		case 'heading':
			return `<h1>${escapeHtml(block.text)}</h1>`;
		case 'paragraph':
			return `<p>${inlineHtml(block.content)}</p>`;
		case 'details':
			return `<p>${block.items
				.map((item) => `<strong>${escapeHtml(item.term)}:</strong> ${escapeHtml(item.value)}`)
				.join('<br>\n')}</p>`;
	}
}

function blockText(block: Block): string {
	switch (block.type) {
		case 'heading':
			return block.text;
		case 'paragraph':
			return inlineText(block.content);
		case 'details':
			return block.items.map((item) => `${item.term}: ${item.value}`).join('\n');
	}
}

export function renderEmail(input: { locale: Locale; subject: string; blocks: Block[] }): RenderedEmail {
	const { locale, subject } = input;
	const lang = htmlLang(locale);
	const blocks: Block[] = [...input.blocks, { type: 'paragraph', content: [m.mail_signature({}, { locale })] }];
	const html = [
		'<!DOCTYPE html>',
		`<html lang="${lang}">`,
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'<meta name="color-scheme" content="light dark">',
		'<meta name="supported-color-schemes" content="light dark">',
		`<title>${escapeHtml(subject)}</title>`,
		'</head>',
		'<body>',
		...blocks.map(blockHtml),
		'</body>',
		'</html>',
		''
	].join('\n');
	const text = blocks.map(blockText).join('\n\n') + '\n';
	return { subject, html, text, lang };
}
