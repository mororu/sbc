// Server render of the content pages and the footer: title, one h1, an h2 per slot, paragraphs and
// line breaks, the untranslated fallback marked lang="de", and the footer's admin contact link.
// The slot texts that the tests depend on are fixtures, so filling the catalogues breaks nothing.
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppFooter from './AppFooter.svelte';
import ContentPage from './ContentPage.svelte';

const state = vi.hoisted(() => ({ locale: 'de' as 'de' | 'en', fixtures: false }));

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => state.locale
}));

// With `fixtures` on, the keybox text is German only (English empty, as an operator would leave it
// before translating) and the address text is a multi-line postal address with a blank-line run.
vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	type Msg = typeof original.m.info_keybox_body;
	const fixture = (real: Msg, deText: string, enText: string) =>
		((inputs?: object, options?: { locale?: 'de' | 'en' }) => {
			if (!state.fixtures) return real(inputs ?? {}, options);
			return (options?.locale ?? state.locale) === 'en' ? enText : deText;
		}) as Msg;
	const info_keybox_body = fixture(original.m.info_keybox_body, 'Die Box hängt links neben der Tür.', '');
	const imprint_address_body = fixture(
		original.m.imprint_address_body,
		'  Verein Sauna Luegisee\nSeestrasse 1\n6000 Luzern\n\n\n\nSchweiz  ',
		'Verein Sauna Luegisee\nSeestrasse 1\n6000 Lucerne\n\n\n\nSwitzerland'
	);
	const overrides = { info_keybox_body, imprint_address_body };
	return { ...original, ...overrides, m: { ...original.m, ...overrides } };
});

const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

beforeEach(() => {
	state.locale = 'de';
	state.fixtures = false;
});

describe('ContentPage (server render)', () => {
	it('renders /info in German: title, one h1, five slots each with an h2 and text', () => {
		const { head, body } = render(ContentPage, { props: { id: 'info' } });
		expect(head).toContain("<title>So funktioniert's · Sauna Luegisee</title>");
		expect(count(body, /<h1[\s>]/g)).toBe(1);
		expect(body).toMatch(/<h1[^>]*>So funktioniert's<\/h1>/);
		expect(count(body, /<section[\s>]/g)).toBe(5);
		expect(count(body, /<h2[\s>]/g)).toBe(5);
	});

	it('renders /privacy in English with six slots', () => {
		state.locale = 'en';
		const { head, body } = render(ContentPage, { props: { id: 'privacy' } });
		expect(head).toContain('<title>Privacy · Sauna Luegisee</title>');
		expect(body).toMatch(/<h1[^>]*>Privacy<\/h1>/);
		expect(count(body, /<h2[\s>]/g)).toBe(6);
	});

	it('has the German and English imprint titles', () => {
		expect(render(ContentPage, { props: { id: 'imprint' } }).head).toContain('<title>Impressum · Sauna Luegisee</title>');
		state.locale = 'en';
		expect(render(ContentPage, { props: { id: 'imprint' } }).head).toContain('<title>Imprint · Sauna Luegisee</title>');
	});

	it('shows the German text inside lang="de" when the English one is empty', () => {
		state.locale = 'en';
		state.fixtures = true;
		const { body } = render(ContentPage, { props: { id: 'info' } });
		expect(count(body, /lang="de"/g)).toBe(1);
		expect(body).toMatch(/<div[^>]*lang="de"[^>]*>\s*(<!--[^>]*-->)?\s*<p[^>]*>Die Box hängt links neben der Tür\.<\/p>/);
		expect(body).toMatch(/<section aria-labelledby="info_keybox"[^>]*><h2[^>]*>[^<]+<\/h2>\s*<div[^>]*lang="de"/);
	});

	it('keeps the lines of an address in one paragraph and drops empty paragraphs', () => {
		state.fixtures = true;
		const { body } = render(ContentPage, { props: { id: 'imprint' } });
		const section = body.match(/<section aria-labelledby="imprint_address".*?<\/section>/s)?.[0] ?? '';
		const paras = [...section.matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map((p) => p[1]);
		expect(paras).toEqual(['Verein Sauna Luegisee\nSeestrasse 1\n6000 Luzern', 'Schweiz']);
	});
});

describe('AppFooter (server render)', () => {
	const contact = { address: 'platzhalter@sauna-luegisee.ch', href: 'mailto:platzhalter@sauna-luegisee.ch' };

	it('ends with the admin contact as a mailto link, the address as visible text', () => {
		const { body } = render(AppFooter, { props: { contact } });
		const items = body.match(/<li>.*?<\/li>/gs) ?? [];
		expect(items).toHaveLength(4);
		expect(items[2]).toContain('Impressum');
		expect(items[3]).toMatch(
			/<a[^>]*href="mailto:platzhalter@sauna-luegisee.ch"[^>]*><span class="visually-hidden">Kontakt: <\/span>platzhalter@sauna-luegisee.ch<\/a>/
		);
	});

	it('names the link "Contact:" for screen readers in English', () => {
		state.locale = 'en';
		expect(render(AppFooter, { props: { contact } }).body).toContain('<span class="visually-hidden">Contact: </span>');
	});

	it('shows no contact link when none is set', () => {
		const { body } = render(AppFooter, { props: { contact: null } });
		expect(body).not.toContain('mailto:');
		expect(body.match(/<li>/g)).toHaveLength(3);
	});
});
