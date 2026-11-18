// Server render of the admin pages (Story 3.1 acceptance): the sign-in page (title, h1, hidden
// username, password field, the alert and autofocus after a wrong password, the disabled button
// after too many tries, the ended-session line), the admin shell (nav order, aria-current, badges)
// and the admin home (h1, worker warning).
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './login/+page.svelte';
import Shell from './(portal)/+layout.svelte';
import HomePage from './(portal)/+page.svelte';

const state = vi.hoisted(() => ({
	locale: 'de' as 'de' | 'en',
	page: { data: {} as unknown, status: 200, url: new URL('http://localhost/admin') }
}));

vi.mock('$app/state', () => ({ page: state.page }));

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => state.locale
}));

const children = createRawSnippet(() => ({ render: () => '<p>Inhalt</p>' }));

const login = (form: unknown = null, data = { to: '/admin', expired: false }) =>
	render(LoginPage, { props: { data, form } as never });

const passwordInput = (body: string) => body.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? '';

describe('sign-in page', () => {
	it('has one h1, its title, a hidden username and a labelled password field', () => {
		const { head, body } = login();
		expect(head).toContain('<title>Anmelden · Sauna Luegisee</title>');
		expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<h1[^>]*>Anmelden<\/h1>/);
		expect(body).toMatch(/<input[^>]*type="text"[^>]*name="username"[^>]*value="admin"[^>]*hidden[^>]*>/);
		const input = passwordInput(body);
		expect(input).toContain('type="password"');
		expect(input).toContain('autocomplete="current-password"');
		expect(input).toContain('id="password"');
		expect(input).not.toContain('autofocus');
		expect(input).not.toMatch(/value="[^"]/);
		expect(body).toMatch(/<label for="password"[^>]*>Passwort<\/label>/);
		expect(body).toMatch(/<input type="hidden" name="to" value="\/admin"/);
		expect(body).not.toContain('role="alert"');
		expect(body).not.toMatch(/<button[^>]*disabled/);
	});

	it('shows the alert and autofocuses the field after a wrong password', () => {
		const { body } = login({ error: 'password_wrong', values: { to: '/admin/settings' } });
		expect(body).toMatch(/role="alert"[^>]*>.*Das Passwort stimmt nicht\./s);
		const input = passwordInput(body);
		expect(input).toContain('autofocus');
		expect(input).toContain('aria-describedby="sign-in-error"');
		expect(body).toContain('id="sign-in-error"');
		expect(body).toMatch(/<input type="hidden" name="to" value="\/admin\/settings"/);
	});

	it('disables the button after too many tries', () => {
		const { body } = login({ error: 'rate_limited', retryAt: '2027-01-12T09:01:20Z', retryInSeconds: 50, values: { to: '/admin' } });
		expect(body).toContain('Zu viele Versuche. Versuch es in einer Minute wieder.');
		expect(body).toMatch(/<button[^>]*disabled/);
	});

	it('shows the action-failed alert after a lock timeout', () => {
		const { body } = login({ error: 'action_failed', values: { to: '/admin' } });
		expect(body).toMatch(/role="alert"[^>]*>.*Das hat nicht geklappt\. Nichts wurde geändert\. Versuch es bitte nochmal\./s);
		expect(body).not.toMatch(/<button[^>]*disabled/);
	});

	it('says to sign in again after a session ended', () => {
		const { body } = login(null, { to: '/admin', expired: true });
		expect(body).toMatch(/role="status"[^>]*>.*Bitte melde dich wieder an\./s);
	});

	it('renders in English', () => {
		state.locale = 'en';
		try {
			const { head, body } = login({ error: 'password_wrong', values: { to: '/admin' } });
			expect(head).toContain('<title>Sign in · Sauna Luegisee</title>');
			expect(body).toContain("That password isn't right.");
		} finally {
			state.locale = 'de';
		}
	});
});

describe('admin shell', () => {
	const shell = (counts: { calls: number; replies: number }, path = '/admin') => {
		state.page.url = new URL(`http://localhost${path}`);
		return render(Shell, { props: { data: { counts }, children } as never }).body;
	};
	const tabs = (body: string) =>
		[...body.matchAll(/<(a|button) class="tab[^"]*"([^>]*)>(.*?)<\/\1>/gs)].map((t) => ({
			attrs: t[2],
			text: t[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
		}));

	it('lists the tabs in order, Übersicht current, with both badges at 0', () => {
		const body = shell({ calls: 0, replies: 0 });
		const list = tabs(body);
		expect(list.map((t) => t.text)).toEqual([
			'Übersicht 0 0 Anrufe offen 0 0 Antworten offen',
			'Buchungen',
			'Blocks',
			'Einstellungen',
			'Auswertung',
			'Abmelden'
		]);
		expect(list[0].attrs).toContain('aria-current="page"');
		expect(list.slice(1).some((t) => t.attrs.includes('aria-current'))).toBe(false);
		expect(body).toMatch(/<form method="POST" action="\/admin\/logout"/);
		expect(body).toContain('<p>Inhalt</p>');
		expect(body.match(/<svg/g)).toHaveLength(4);
	});

	it('uses the singular for one call and one reply', () => {
		const list = tabs(shell({ calls: 1, replies: 1 }));
		expect(list[0].text).toBe('Übersicht 1 1 Anruf offen 1 1 Antwort offen');
		expect(tabs(shell({ calls: 2, replies: 3 }))[0].text).toBe('Übersicht 2 2 Anrufe offen 3 3 Antworten offen');
	});

	it('marks the tab of the current page', () => {
		const list = tabs(shell({ calls: 0, replies: 0 }, '/admin/settings'));
		expect(list.filter((t) => t.attrs.includes('aria-current="page"')).map((t) => t.text)).toEqual(['Einstellungen']);
	});

	it('renders the nav in English', () => {
		state.locale = 'en';
		try {
			expect(tabs(shell({ calls: 1, replies: 2 })).map((t) => t.text)).toEqual([
				'Overview 1 1 call open 2 2 replies open',
				'Bookings',
				'Blocks',
				'Settings',
				'Analytics',
				'Sign out'
			]);
		} finally {
			state.locale = 'de';
		}
	});
});

describe('admin home', () => {
	it('has the h1, its title, the warning and the empty grid', () => {
		const { head, body } = render(HomePage, { props: { data: { home: { warning: 'Der Versand läuft seit 09:55 nicht.' } } } as never });
		expect(head).toContain('<title>Übersicht · Sauna Luegisee</title>');
		expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<h1[^>]*>Übersicht<\/h1>/);
		expect(body).toMatch(/role="alert"[^>]*>.*Der Versand läuft seit 09:55 nicht\./s);
		expect(body.match(/class="column/g)).toHaveLength(2);
	});

	it('shows no message while the worker is healthy', () => {
		const { body } = render(HomePage, { props: { data: { home: { warning: null } } } as never });
		expect(body).not.toContain('role="alert"');
	});
});

describe('guest pages', () => {
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			return statSync(path).isDirectory() ? files(path) : [path];
		});

	it('never link to /admin', () => {
		const sources = [...files('src/routes/(guest)'), ...files('src/lib/components'), ...files('src/lib/content')].filter(
			(f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.test.ts')
		);
		expect(sources.length).toBeGreaterThan(10);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(/['"`(]\/admin/);
	});
});
