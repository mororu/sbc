// Server render of the guest shell, the three content pages and the error pages: the layout puts the
// admin contact in the footer and labels the skip link by its target, each content page has its own
// <title>, and an unknown path renders the 404 in the guest shell.
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import RootError from '../+error.svelte';
import { load as loadUnknown } from './[...path]/+page.server.ts';
import GuestError from './+error.svelte';
import Layout from './+layout.svelte';
import ImprintPage from './imprint/+page.svelte';
import InfoPage from './info/+page.svelte';
import PrivacyPage from './privacy/+page.svelte';

const state = vi.hoisted(() => ({
	locale: 'de' as 'de' | 'en',
	page: { data: {} as unknown, status: 200, url: new URL('http://localhost/info') }
}));

vi.mock('$app/state', () => ({ page: state.page }));

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => state.locale
}));

const children = createRawSnippet(() => ({ render: () => '<p>Inhalt</p>' }));

describe('guest layout (server render)', () => {
	it('renders the footer with the admin contact as the last item', () => {
		const adminContact = { address: 'sauna@example.ch', href: 'mailto:sauna@example.ch' };
		const { body } = render(Layout, { props: { data: { adminContact }, children } as never });
		expect(body).toContain('<p>Inhalt</p>');
		const footer = body.match(/<footer.*?<\/footer>/s)?.[0] ?? '';
		const items = footer.match(/<li>.*?<\/li>/gs) ?? [];
		expect(items).toHaveLength(4);
		expect(items[3]).toMatch(/<a[^>]*href="mailto:sauna@example.ch"[^>]*>.*sauna@example.ch<\/a>/s);
	});

	it('renders without a contact link when none is set', () => {
		const { body } = render(Layout, { props: { data: { adminContact: null }, children } as never });
		expect(body).not.toContain('mailto:');
	});
});

describe('content pages (server render)', () => {
	it.each([
		['info', InfoPage, "So funktioniert's · Sauna Luegisee"],
		['privacy', PrivacyPage, 'Datenschutz · Sauna Luegisee'],
		['imprint', ImprintPage, 'Impressum · Sauna Luegisee']
	] as const)('/%s has its own title', (_, Page, title) => {
		expect(render(Page).head).toContain(`<title>${title}</title>`);
	});
});

describe('skip link (server render)', () => {
	const skipLink = (data: unknown, locale: 'de' | 'en' = 'de') => {
		state.page.data = data;
		state.locale = locale;
		try {
			const { body } = render(Layout, { props: { data: { adminContact: null }, children } as never });
			return body.match(/<a class="skip-link[^"]*" href="([^"]*)"[^>]*>\s*(.*?)\s*<\/a>/s)?.slice(1);
		} finally {
			state.page.data = {};
			state.locale = 'de';
		}
	};

	it('skips to the times on a day page', () => {
		expect(skipLink({ page: { kind: 'day' } })).toEqual(['#times', 'Zu den Zeiten']);
		expect(skipLink({ page: { kind: 'day' } }, 'en')).toEqual(['#times', 'Skip to times']);
	});

	it.each([['a content page', {}], ['the season notice', { page: { kind: 'season' } }]])(
		'skips to the content on %s',
		(_, data) => {
			expect(skipLink(data)).toEqual(['#main', 'Zum Inhalt']);
			expect(skipLink(data, 'en')).toEqual(['#main', 'Skip to content']);
		}
	);
});

describe('unknown paths', () => {
	it('answer 404 from the guest catch-all route', () => {
		try {
			(loadUnknown as (e: unknown) => unknown)({ params: { path: 'nope/deeper' } });
		} catch (e) {
			expect(isHttpError(e) && e.status).toBe(404);
			return;
		}
		throw new Error('expected a 404');
	});

	it.each([
		['de', 'Nicht gefunden · Sauna Luegisee', 'Diese Seite gibt es nicht.', 'Zum Kalender'],
		['en', 'Not found · Sauna Luegisee', "This page doesn't exist.", 'To the calendar']
	] as const)('render the 404 inside the guest shell (%s)', (locale, title, heading, link) => {
		state.page.status = 404;
		state.locale = locale;
		try {
			const page = render(GuestError);
			expect(page.head).toContain(`<title>${title}</title>`);
			expect(page.head).toContain('<meta name="robots" content="noindex"');
			expect(page.body).toContain(heading);
			expect(page.body).toContain(link);
			// The guest layout wraps it: header and footer with the contact.
			const children = createRawSnippet(() => ({ render: () => `<div>${page.body}</div>` }));
			const adminContact = { address: 'sauna@example.ch', href: 'mailto:sauna@example.ch' };
			const shell = render(Layout, { props: { data: { adminContact }, children } as never }).body;
			expect(shell).toMatch(/<header[^>]*class="app-header/);
			expect(shell).toContain('mailto:sauna@example.ch');
			expect(shell).toContain(heading);
		} finally {
			state.page.status = 200;
			state.locale = 'de';
		}
	});

	it('fall back to the root error page with the header outside the guest layout', () => {
		state.page.status = 500;
		try {
			const page = render(RootError);
			expect(page.head).toContain('<title>Fehler · Sauna Luegisee</title>');
			expect(page.head).toContain('<meta name="robots" content="noindex"');
			expect(page.body).toMatch(/<header[^>]*class="app-header/);
			expect(page.body).toContain('Das hat nicht geklappt.');
			expect(page.body).toContain('Zum Kalender');
		} finally {
			state.page.status = 200;
		}
	});
});
