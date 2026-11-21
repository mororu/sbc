// Server render of the admin pages (Story 3.1 acceptance): the sign-in page (title, h1, hidden
// username, password field, the alert and autofocus after a wrong password, the disabled button
// after too many tries, the ended-session line), the admin shell (nav order, aria-current, badges)
// and the admin home (h1, worker warning). Story 3.2: the admin day view (skip link target, strip
// with aria-current, rows and the table, empty line), the booking detail, the home's next bookings
// and flags, and the admin 404.
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './login/+page.svelte';
import Shell from './(portal)/+layout.svelte';
import HomePage from './(portal)/+page.svelte';
import AdminError from './(portal)/+error.svelte';
import DayPage from './(portal)/day/[date]/+page.svelte';
import BookingPage from './(portal)/booking/[id]/+page.svelte';
import { buildAdminBookingView, buildAdminDayView, type AdminRowContext } from '#lib/server/admin-day-view.ts';
import { buildHomeFlags, buildNextBookings } from '#lib/server/admin-view.ts';
import type { AdminBooking } from '#lib/server/db/queries/index.ts';

const state = vi.hoisted(() => ({
	locale: 'de' as 'de' | 'en',
	page: { data: {} as unknown, status: 200, url: new URL('http://localhost/admin') }
}));

vi.mock('$app/state', () => ({ page: state.page, navigating: { to: null } }));

vi.mock('$app/navigation', () => ({ afterNavigate: () => {} }));

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

const NOW = '2027-01-12T09:00:00Z';
const context: AdminRowContext = {
	now: NOW,
	locale: 'de',
	seasons: [{ startDate: '2027-01-09', endDate: '2027-03-31' }],
	settings: { openMinute: 960, closeMinute: 1320 },
	keyboxCode: '4711'
};
const COLD = { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' } as const;
const booking = (over: Partial<AdminBooking> = {}): AdminBooking => ({
	id: 7,
	start: '2027-01-12T16:15:00Z',
	durationMin: 60,
	partySize: 2,
	locale: 'de',
	name: 'Tom Brunner',
	email: 'tom@example.ch',
	mobile: '+41791234567',
	current: COLD,
	lastTold: { heat: 'hot', earliest: null, latest: null },
	keybox: { state: 'accepted', dueAt: '2027-01-11T16:15:00Z', outcomeAt: '2027-01-11T15:00:00Z', reason: null, snapshotKeyboxCode: '4711' },
	refusals: [],
	...over
});
const emptyHome = { warning: null, next: buildNextBookings([], context), flags: [] };

describe('admin home', () => {
	it('has the h1, its title, the warning and the grid', () => {
		const { head, body } = render(HomePage, { props: { data: { home: { ...emptyHome, warning: 'Der Versand läuft seit 09:55 nicht.' } } } as never });
		expect(head).toContain('<title>Übersicht · Sauna Luegisee</title>');
		expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<h1[^>]*>Übersicht<\/h1>/);
		expect(body).toMatch(/role="alert"[^>]*>.*Der Versand läuft seit 09:55 nicht\./s);
		expect(body.match(/class="column/g)).toHaveLength(2);
	});

	it('shows no message while the worker is healthy', () => {
		const { body } = render(HomePage, { props: { data: { home: emptyHome } } as never });
		expect(body).not.toContain('role="alert"');
	});

	it('lists the next bookings under two h3 labels, the empty line, and the flags with links', () => {
		const home = {
			warning: null,
			next: buildNextBookings([booking()], context),
			flags: buildHomeFlags([{ id: 9, start: '2027-01-12T20:30:00Z', durationMin: 90, name: 'Mia Keller', refused: false }], context)
		};
		const { body } = render(HomePage, { props: { data: { home } } as never });
		expect(body).toMatch(/<h2[^>]*>Nächste Buchungen<\/h2>/);
		expect([...body.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((h) => h[1])).toEqual(['Heute · Di 12. Januar', 'Morgen · Mi 13. Januar']);
		const today = body.slice(body.indexOf('Heute · '), body.indexOf('Morgen · '));
		expect(today).toContain('href="/admin/booking/7"');
		expect(body.slice(body.indexOf('Morgen · '))).toContain('Keine Buchungen an diesem Tag.');
		expect(body).toContain('1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.');
		expect(body).toMatch(/<a href="\/admin\/booking\/9"[^>]*>Di 12. Januar, 21:30 · Mia Keller<\/a>/);
	});
});

describe('admin day view', () => {
	const view = (bookings: AdminBooking[]) =>
		buildAdminDayView({
			date: '2027-01-12',
			bookings,
			stripDates: ['2027-01-11', '2027-01-12', '2027-04-05'],
			flaggedDates: new Set(['2027-04-05']),
			context
		});
	const page = (bookings: AdminBooking[] = [booking()]) => render(DayPage, { props: { data: { view: view(bookings) } } as never });

	it('has a unique title, the h1, the strip with aria-current on the day and a flagged cell', () => {
		const { head, body } = page();
		expect(head).toContain('<title>Di, 12. Januar · Buchungen · Sauna Luegisee</title>');
		expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
		const current = body.match(/<a[^>]*aria-current="date"[^>]*>(.*?)<\/a>/s)?.[0] ?? '';
		expect(current).toContain('href="/admin/day/2027-01-12"');
		expect(body.match(/aria-current="date"/g)).toHaveLength(1);
		expect(body).toContain('Montag, 5. April, ausserhalb der Zeiten');
		expect(body).toMatch(/class="flag[^"]*" aria-hidden="true"/);
	});

	it('renders the rows and the table with column headers, both linking to the detail', () => {
		const { body } = page();
		expect(body).toMatch(/id="bookings"[^>]*aria-busy="false"/);
		const row = body.match(/<a class="admin-row[^"]*" href="\/admin\/booking\/7">(.*?)<\/a>/s)?.[1] ?? '';
		const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
		expect(text).toBe('17:15–18:15 Kaltstart Tom Brunner · 2 Personen Hinweis geändert Code 4711');
		const headers = [...body.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((h) => h[1]);
		expect(headers).toEqual(['Zeit', 'Name', 'Personen', 'E-Mail', 'Handy', 'Hinweis jetzt', 'Zuletzt gesagt', 'Code verschickt']);
		expect(body).toContain('tom@example.ch');
	});

	it('shows the old-code tag instead of the code', () => {
		const old = booking({ keybox: { state: 'accepted', dueAt: NOW, outcomeAt: NOW, reason: null, snapshotKeyboxCode: '1234' } });
		const { body } = page([old]);
		expect(body).toContain('Alter Code 1234');
		expect(body).not.toContain('Code 4711');
	});

	it('shows only the empty line on a day without bookings', () => {
		const { body } = page([]);
		expect(body).toContain('<p class="empty');
		expect(body).toContain('Keine Buchungen an diesem Tag.');
		expect(body).not.toContain('<table');
	});

	it('makes the skip link "Zu den Buchungen" the first focusable element of the admin shell', () => {
		state.page.data = { view: { kind: 'admin-day' } };
		state.page.url = new URL('http://localhost/admin/day/2027-01-12');
		try {
			const { body } = render(Shell, { props: { data: { counts: { calls: 0, replies: 0 } }, children } as never });
			const first = body.match(/<(a|button)\b[^>]*>.*?<\/\1>/s)?.[0] ?? '';
			expect(first).toMatch(/class="skip-link[^"]*" href="#bookings"/);
			expect(first).toContain('Zu den Buchungen');
		} finally {
			state.page.data = {};
			state.page.url = new URL('http://localhost/admin');
		}
	});

	it('uses the row header and shows the notice texts, with a hidden word behind a missing notice', () => {
		const { body } = page([booking({ lastTold: null })]);
		expect(body).toMatch(/<th class="time[^"]*" scope="row"><a class="stretch[^"]*" href="\/admin\/booking\/7">/);
		const table = body.slice(body.indexOf('<table'));
		expect(table).toContain('Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.');
		expect(table).toMatch(/<span aria-hidden="true">–<\/span><span class="visually-hidden">nicht gespeichert<\/span>/);
	});

	it('renders in English', () => {
		state.locale = 'en';
		try {
			const v = buildAdminDayView({
				date: '2027-01-13',
				bookings: [booking({ start: '2027-01-13T16:15:00Z', current: { heat: 'hot', earliest: null, latest: null } })],
				stripDates: ['2027-01-13'],
				flaggedDates: new Set(),
				context: { ...context, locale: 'en' }
			});
			const { head, body } = render(DayPage, { props: { data: { view: v } } as never });
			expect(head).toContain('<title>Wed, 13 January · Bookings · Sauna Luegisee</title>');
			expect(body).toMatch(/<h1[^>]*>.*Wednesday.*13 January.*<\/h1>/s);
			expect([...body.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((h) => h[1])).toEqual([
				'Time',
				'Name',
				'People',
				'Email',
				'Mobile',
				'Notice now',
				'Last told',
				'Code sent'
			]);
			expect(body).toContain('Tom Brunner · 2 people');
		} finally {
			state.locale = 'de';
		}
	});
});

describe('booking detail', () => {
	it('renders in English', () => {
		state.locale = 'en';
		try {
			const view = buildAdminBookingView(booking({ start: '2027-01-12T20:30:00Z', durationMin: 90 }), { ...context, locale: 'en' });
			const { head, body } = render(BookingPage, { props: { data: { view } } as never });
			expect(head).toContain('<title>Booking Tue, 12 January, 21:30–23:00 · Sauna Luegisee</title>');
			expect([...body.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((t) => t[1])).toEqual(['Name', 'Email', 'Mobile', 'People', 'Duration', 'Keybox email']);
			expect(body).toContain('sent Mon 16:00 · code 4711');
			expect(body).toContain('Notice now');
			expect(body).toContain('Last told');
			expect(body).toContain('This booking falls outside the new times. It stays valid.');
		} finally {
			state.locale = 'de';
		}
	});

	const detail = (b: AdminBooking) => render(BookingPage, { props: { data: { view: buildAdminBookingView(b, context) } } as never });

	it('has the back link, eyebrow, time-range h1, the term list with mailto/tel links and both notices', () => {
		const { head, body } = detail(booking());
		expect(head).toContain('<title>Buchung Di, 12. Januar, 17:15–18:15 · Sauna Luegisee</title>');
		expect(body).toMatch(/<a class="back[^"]*" href="\/admin\/day\/2027-01-12">.*Di, 12. Januar<\/a>/s);
		expect(body).toMatch(/<h1[^>]*>.*17:15–18:15.*<\/h1>/s);
		const terms = [...body.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((t) => t[1]);
		expect(terms).toEqual(['Name', 'E-Mail', 'Handy', 'Personen', 'Dauer', 'Schlüsselmail']);
		expect(body).toMatch(/<a href="mailto:tom@example.ch"[^>]*>tom@example.ch<\/a>/);
		expect(body).toMatch(/<a href="tel:\+41791234567"[^>]*>\+41791234567<\/a>/);
		expect(body).toContain('verschickt Mo 16:00 · Code 4711');
		expect(body).toContain('Hinweis jetzt');
		expect(body).toContain('Zuletzt gesagt');
		expect(body).toContain('Schon heiss um 17:15.');
		expect(body).toContain('Hinweis geändert');
	});

	it('shows the flag and the refused emails when they apply', () => {
		const { body } = detail(
			booking({ start: '2027-01-12T20:30:00Z', durationMin: 90, refusals: [{ kind: 'confirmation', reason: 'smtp 550', outcomeAt: null }] })
		);
		expect(body).toContain('Diese Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.');
		expect(body).toMatch(/<h2[^>]*>Abgelehnte Mails<\/h2>/);
		expect(body).toContain('Bestätigung abgelehnt: smtp 550');
	});
});

describe('admin error page', () => {
	it('says the page does not exist, with a link to Buchungen', () => {
		state.page.status = 404;
		try {
			const { head, body } = render(AdminError);
			expect(head).toContain('<title>Nicht gefunden · Sauna Luegisee</title>');
			expect(body).toMatch(/<h1[^>]*>Diese Seite gibt es nicht\.<\/h1>/);
			expect(body).toMatch(/<a href="\/admin\/day"[^>]*>Zu den Buchungen<\/a>/);
		} finally {
			state.page.status = 200;
		}
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
