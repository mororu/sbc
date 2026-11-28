// The admin routes on the server (Story 3.1 matrix, "Sign in", "Bad target", "Wrong", "Sign out",
// and the nav counts; Story 3.2 matrix, "Default", "Accept", "Detail" and "Home"; Story 3.3, the
// delete action: success, stale, past, gone and a lock timeout; Story 3.4, the replyDone action on
// the home and the day view: done, already done, a lock timeout, and the replies on both pages;
// Story 3.5, the Blocks list and form: check, save and delete outcomes, the empty list and the day
// view's block rows; Story 3.6, the called action: called, already done, stale, failure, bad id,
// and the home list agreeing with the nav badge): an in-memory database, DEV_NOW at Tue 12 Jan 2027, 10:00 Zurich.
import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates and edits its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
// eslint-disable-next-line no-restricted-imports
import { getDb } from '#lib/server/db/index.ts';
import { resetSignInAttempts, setAdminPassword } from '#lib/server/commands/index.ts';
import { hashPassword } from '#lib/server/password.ts';
import { actions, load as loadLogin } from './login/+page.server.ts';
import { POST as logout } from './logout/+server.ts';
import { load as loadShell } from './(portal)/+layout.server.ts';
import { actions as homeActions, load as loadHome } from './(portal)/+page.server.ts';
import { load as loadDefaultDay } from './(portal)/day/+page.server.ts';
import { actions as dayActions, load as loadDay } from './(portal)/day/[date]/+page.server.ts';
import { actions as bookingActions, load as loadBooking } from './(portal)/booking/[id]/+page.server.ts';
import { actions as blocksActions, load as loadBlocks } from './(portal)/blocks/+page.server.ts';
import { actions as newBlockActions, load as loadNewBlock } from './(portal)/blocks/new/+page.server.ts';

const clock = vi.hoisted(() => ({ now: '2027-01-12T09:00:00Z', locale: 'de' as 'de' | 'en', busy: false, createInvalid: false }));

const busyError = () => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

// A switch to make signIn and signOut hit a lock timeout; otherwise the real commands.
vi.mock('#lib/server/commands/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/commands/index.ts')>();
	return {
		...actual,
		signIn: (...args: Parameters<typeof actual.signIn>) => (clock.busy ? Promise.reject(busyError()) : actual.signIn(...args)),
		signOut: (...args: Parameters<typeof actual.signOut>) => {
			if (clock.busy) throw busyError();
			return actual.signOut(...args);
		},
		deleteBooking: (...args: Parameters<typeof actual.deleteBooking>) => {
			if (clock.busy) throw busyError();
			return actual.deleteBooking(...args);
		},
		createBlock: (...args: Parameters<typeof actual.createBlock>) => {
			if (clock.busy) throw busyError();
			// The command's own range check refusing a form that passed the schema.
			if (clock.createInvalid) return { ok: false as const, code: 'invalid' as const };
			return actual.createBlock(...args);
		},
		deleteBlock: (...args: Parameters<typeof actual.deleteBlock>) => {
			if (clock.busy) throw busyError();
			return actual.deleteBlock(...args);
		},
		markReplyDone: (...args: Parameters<typeof actual.markReplyDone>) => {
			if (clock.busy) throw busyError();
			return actual.markReplyDone(...args);
		},
		markCalled: (...args: Parameters<typeof actual.markCalled>) => {
			if (clock.busy) throw busyError();
			return actual.markCalled(...args);
		}
	};
});

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => clock.locale
}));

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: clock.now
	})
}));

const PASSWORD = 'correct horse battery';

beforeAll(async () => {
	applyMigrations();
	setAdminPassword({ hash: await hashPassword(PASSWORD), reset: false });
});

beforeEach(() => {
	clock.now = '2027-01-12T09:00:00Z';
	clock.locale = 'de';
	clock.busy = false;
	clock.createInvalid = false;
	resetSignInAttempts();
	getDb().$client.exec('delete from admin_session');
});

type Outcome =
	| { redirect: { status: number; location: string } }
	| { failure: { status: number; data: unknown } }
	| { error: number }
	| { data: unknown };

async function run(fn: () => unknown): Promise<Outcome> {
	try {
		const result = await fn();
		if (isActionFailure(result)) return { failure: { status: result.status, data: result.data } };
		return { data: result };
	} catch (e) {
		if (isRedirect(e)) return { redirect: { status: e.status, location: e.location } };
		if (isHttpError(e)) return { error: e.status };
		throw e;
	}
}

const fakeCookies = (value?: string) => {
	const set: unknown[][] = [];
	const deleted: unknown[][] = [];
	return {
		set,
		deleted,
		cookies: {
			get: (name: string) => (name === 'admin_session' ? value : undefined),
			set: (...args: unknown[]) => set.push(args),
			delete: (...args: unknown[]) => deleted.push(args)
		}
	};
};

const submit = (fields: Record<string, string>, address = '10.0.0.1') => {
	const jar = fakeCookies();
	const request = new Request('http://localhost/admin/login', { method: 'POST', body: new URLSearchParams(fields) });
	const outcome = run(() =>
		(actions.default as (e: unknown) => unknown)({ request, cookies: jar.cookies, getClientAddress: () => address })
	);
	return outcome.then((o) => ({ ...o, jar }));
};

const sessions = () => getDb().$client.prepare('select id, expires_at from admin_session').all() as { id: string; expires_at: string }[];

describe('sign-in page load', () => {
	it('passes a safe return target and the expired flag', async () => {
		const login = (query: string) => run(() => (loadLogin as (e: unknown) => unknown)({ url: new URL(`http://localhost/admin/login${query}`) }));
		expect(await login('?to=%2Fadmin%2Fsettings&expired=1')).toEqual({ data: { to: '/admin/settings', expired: true } });
		expect(await login('?to=https%3A%2F%2Fevil.example')).toEqual({ data: { to: '/admin', expired: false } });
	});
});

describe('sign-in action', () => {
	it('creates a session, sets the one cookie and goes to the return target', async () => {
		const outcome = await submit({ username: 'admin', password: PASSWORD, to: '/admin/settings' });
		expect(outcome).toMatchObject({ redirect: { status: 303, location: '/admin/settings' } });
		const [row] = sessions();
		expect(row.expires_at).toBe('2027-02-11T09:00:00Z');
		expect(outcome.jar.set).toEqual([
			['admin_session', row.id, { path: '/admin', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000 }]
		]);
	});

	it.each(['https://evil.example', '//evil.example', '/adminx', '/admin/../x', '/admin\\x', '/admin/login', ''])(
		'ignores the return target %j and goes to /admin',
		async (to) => {
			expect(await submit({ password: PASSWORD, to })).toMatchObject({ redirect: { status: 303, location: '/admin' } });
		}
	);

	it('fails a wrong password with password_wrong, no session, no cookie and no password in the data', async () => {
		const outcome = await submit({ password: 'wrong password!!', to: '/admin/settings' });
		expect(outcome).toMatchObject({
			failure: { status: 400, data: { error: 'password_wrong', values: { to: '/admin/settings' } } }
		});
		expect(JSON.stringify(outcome)).not.toContain('wrong password!!');
		expect(outcome.jar.set).toEqual([]);
		expect(sessions()).toEqual([]);
	});

	it('asks for the password when it is empty', async () => {
		expect(await submit({ password: '' })).toMatchObject({ failure: { status: 400, data: { error: 'field_required' } } });
	});

	it('refuses the 6th try inside the minute with the time of the next allowed try', async () => {
		for (const t of ['00', '05', '10', '15', '20']) {
			clock.now = `2027-01-12T09:00:${t}Z`;
			await submit({ password: 'wrong password!!' });
		}
		clock.now = '2027-01-12T09:00:30Z';
		const outcome = await submit({ password: PASSWORD });
		expect(outcome).toMatchObject({
			failure: { status: 429, data: { error: 'rate_limited', retryAt: '2027-01-12T09:01:20Z', retryInSeconds: 50 } }
		});
		expect(JSON.stringify(outcome)).not.toContain(PASSWORD);
		expect(await submit({ password: PASSWORD }, '10.0.0.2')).toMatchObject({ redirect: { location: '/admin' } });
	});
});

describe('sign-in action under a lock timeout', () => {
	it('fails with action_failed and the return target, nothing more', async () => {
		clock.busy = true;
		const outcome = await submit({ password: PASSWORD, to: '/admin/settings' });
		expect(outcome).toMatchObject({ failure: { status: 503, data: { error: 'action_failed', values: { to: '/admin/settings' } } } });
		expect((outcome as { failure: { data: unknown } }).failure.data).toEqual({ error: 'action_failed', values: { to: '/admin/settings' } });
		expect(outcome.jar.set).toEqual([]);
	});
});

describe('sign-out', () => {
	it('deletes the session row, clears the cookie and goes to sign-in', async () => {
		await submit({ password: PASSWORD });
		const [row] = sessions();
		const jar = fakeCookies(row.id);
		const outcome = await run(() => (logout as (e: unknown) => unknown)({ cookies: jar.cookies, locals: { adminSession: { id: row.id } } }));
		expect(outcome).toEqual({ redirect: { status: 303, location: '/admin/login' } });
		expect(sessions()).toEqual([]);
		expect(jar.deleted).toEqual([['admin_session', expect.objectContaining({ path: '/admin', httpOnly: true, secure: true })]]);
	});
});

describe('sign-out under a lock timeout', () => {
	it('still clears the cookie and goes to sign-in', async () => {
		clock.busy = true;
		const jar = fakeCookies('A'.repeat(22));
		const outcome = await run(() => (logout as (e: unknown) => unknown)({ cookies: jar.cookies, locals: { adminSession: { id: 'A'.repeat(22) } } }));
		expect(outcome).toEqual({ redirect: { status: 303, location: '/admin/login' } });
		expect(jar.deleted).toHaveLength(1);
	});
});

describe('admin shell and home', () => {
	const shell = (locals: App.Locals, path = '/admin') =>
		run(() => (loadShell as (e: unknown) => unknown)({ locals, url: new URL(`http://localhost${path}`), depends: () => {} }));

	it('counts call-list entries and open replies, 0 when empty', async () => {
		expect(await shell({ adminSession: { id: 'x', expiresAt: '2027-02-11T09:00:00Z' } })).toEqual({ data: { counts: { calls: 0, replies: 0 } } });
		const sqlite = getDb().$client;
		const insert = sqlite.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, email, deleted_at, last_told_notice) values (?, 90, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'lena@example.ch', ?, ?)"
		);
		// Told hot, now cold, keybox email sent: a call. A deleted booking with an email: a reply.
		const told = insert.run('2027-01-12T17:00:00Z', 'P1', 'T1', null, '{"heat":"hot","earliest":null,"latest":null}');
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'keybox', 'accepted', '2027-01-11T17:00:00Z')").run(told.lastInsertRowid);
		insert.run('2027-01-13T17:00:00Z', 'P2', 'T2', '2027-01-10T08:00:00Z', null);
		expect(await shell({ adminSession: { id: 'x', expiresAt: '2027-02-11T09:00:00Z' } })).toEqual({ data: { counts: { calls: 1, replies: 1 } } });
		sqlite.exec('delete from outbox; delete from booking');
	});

	it('loads nothing without a session, and sends back to the requested page after sign-in', async () => {
		expect(await shell({})).toEqual({ redirect: { status: 303, location: '/admin/login' } });
		expect(await shell({}, '/admin/settings?x=1')).toEqual({ redirect: { status: 303, location: '/admin/login?to=%2Fadmin%2Fsettings%3Fx%3D1' } });
	});

	it('warns on the home page that the worker is not running before its first tick', async () => {
		expect(await run(() => (loadHome as (e: unknown) => unknown)({}))).toMatchObject({ data: { home: { warning: 'Der Versand läuft nicht.' } } });
	});

	it('warns in English when the admin uses English', async () => {
		clock.locale = 'en';
		expect(await run(() => (loadHome as (e: unknown) => unknown)({}))).toMatchObject({ data: { home: { warning: "Sending isn't running." } } });
	});
});

describe('admin day and booking routes', () => {
	const sqlite = () => getDb().$client;
	let n = 0;
	const insertBooking = (start: string, over: { deletedAt?: string; durationMin?: number } = {}) => {
		const id = `RT${String(++n).padStart(20, '0')}`;
		return Number(
			sqlite()
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, email, deleted_at) values (?, ?, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'Tom Brunner', 'tom@example.ch', ?)"
				)
				.run(start, over.durationMin ?? 60, id, id, over.deletedAt ?? null).lastInsertRowid
		);
	};
	const day = (date: string) => run(() => (loadDay as (e: unknown) => unknown)({ params: { date } }));
	const detail = (id: string) => run(() => (loadBooking as (e: unknown) => unknown)({ params: { id } }));
	const home = () => run(() => (loadHome as (e: unknown) => unknown)({})) as Promise<{ data: { home: Record<string, never> } }>;

	beforeEach(() => {
		sqlite().exec(
			"delete from outbox; delete from booking; delete from block; delete from season where id <> 1; update season set start_date = '2027-01-09', end_date = '2027-03-31'; update setting set open_minute = 960, close_minute = 1320, keybox_code = '4711'"
		);
	});

	it.each([
		['today in season', null, '/admin/day/2027-01-12'],
		['today before the season', "update season set start_date = '2027-02-01'", '/admin/day/2027-02-01'],
		['no current or next season', "update season set start_date = '2026-11-01', end_date = '2026-12-31'", '/admin/day/2027-01-12']
	])('/admin/day redirects (%s)', async (_, sql, location) => {
		if (sql) sqlite().exec(sql);
		expect(await run(() => (loadDefaultDay as (e: unknown) => unknown)({}))).toEqual({ redirect: { status: 303, location } });
	});

	it('accepts a past season day and a block-only day; anything else is an admin 404', async () => {
		sqlite().exec("insert into season (id, start_date, end_date) values (2, '2026-11-20', '2026-12-20')");
		sqlite().exec("insert into block (start_at, end_at, reason) values ('2027-04-05T07:00:00Z', '2027-04-05T09:00:00Z', 'cleaning')");
		expect(await day('2026-12-01')).toMatchObject({ data: { view: { kind: 'admin-day', date: '2026-12-01' } } });
		expect(await day('2027-04-05')).toMatchObject({ data: { view: { kind: 'admin-day', date: '2027-04-05' } } });
		for (const date of ['2027-05-01', '2027-13-01', 'x']) expect(await day(date)).toEqual({ error: 404 });
	});

	it('shows the day with its live bookings and the empty line without', async () => {
		const live = insertBooking('2027-01-12T16:15:00Z');
		insertBooking('2027-01-13T16:15:00Z', { deletedAt: '2027-01-10T08:00:00Z' });
		expect(await day('2027-01-12')).toMatchObject({
			data: { view: { entries: [{ kind: 'booking', row: { id: live, name: 'Tom Brunner', email: 'tom@example.ch' } }] } }
		});
		expect(await day('2027-01-13')).toMatchObject({ data: { view: { entries: [], empty: 'Keine Buchungen an diesem Tag.' } } });
	});

	it('shows a live booking detail, the gone view of a deleted one; unknown and malformed ids are an admin 404', async () => {
		const live = insertBooking('2027-01-12T16:15:00Z');
		const gone = insertBooking('2027-01-12T18:00:00Z', { deletedAt: '2027-01-10T08:00:00Z' });
		expect(await detail(String(live))).toMatchObject({ data: { view: { kind: 'admin-booking', heading: '17:15–18:15' } } });
		expect(await detail(String(gone))).toMatchObject({
			data: { view: { kind: 'admin-booking-gone', message: 'Diese Buchung gibt es nicht mehr.', back: { href: '/admin/day/2027-01-12' } } }
		});
		for (const id of ['9999', 'abc']) expect(await detail(id)).toEqual({ error: 404 });
	});

	describe('delete action', () => {
		const post = (id: string, impactToken?: string) => {
			const body = new URLSearchParams(impactToken === undefined ? {} : { impactToken });
			const request = new Request(`http://localhost/admin/booking/${id}?/delete`, { method: 'POST', body });
			return run(() => (bookingActions.delete as (e: unknown) => unknown)({ params: { id }, request }));
		};
		const tokenOf = async (id: number) => {
			const outcome = (await detail(String(id))) as { data: { view: { delete: { token: string } | null } } };
			const token = outcome.data.view.delete?.token;
			if (!token) throw new Error('no delete dialog');
			return token;
		};
		const deletedAt = (id: number) =>
			(sqlite().prepare('select deleted_at from booking where id = ?').get(id) as { deleted_at: string | null }).deleted_at;

		it('deletes with the token the dialog showed and goes to the day', async () => {
			const anna = insertBooking('2027-01-12T15:00:00Z');
			expect(await post(String(anna), await tokenOf(anna))).toEqual({ redirect: { status: 303, location: '/admin/day/2027-01-12' } });
			expect(deletedAt(anna)).toBe('2027-01-12T09:00:00Z');
		});

		it('refuses a stale token with 409 and deletes nothing', async () => {
			const anna = insertBooking('2027-01-12T15:00:00Z');
			const token = await tokenOf(anna);
			// Meanwhile Tom books 17:15, told hot: deleting Anna now changes his notice.
			insertBooking('2027-01-12T16:15:00Z');
			sqlite().exec("update booking set last_told_notice = '{\"heat\":\"hot\",\"earliest\":null,\"latest\":null}'");
			expect(await post(String(anna), token)).toEqual({ failure: { status: 409, data: { code: 'stale' } } });
			expect(await post(String(anna))).toEqual({ failure: { status: 409, data: { code: 'stale' } } });
			expect(deletedAt(anna)).toBeNull();
		});

		it('refuses a booking that has started with 409 past', async () => {
			const anna = insertBooking('2027-01-12T15:00:00Z');
			const token = await tokenOf(anna);
			clock.now = '2027-01-12T15:00:00Z';
			expect(await post(String(anna), token)).toEqual({ failure: { status: 409, data: { code: 'past' } } });
			expect(deletedAt(anna)).toBeNull();
		});

		it('answers 410 not_found for a booking another admin deleted, and 404 for a malformed id', async () => {
			const anna = insertBooking('2027-01-12T15:00:00Z');
			const token = await tokenOf(anna);
			await post(String(anna), token);
			expect(await post(String(anna), token)).toEqual({ failure: { status: 410, data: { code: 'not_found' } } });
			expect(await post('9999', token)).toEqual({ failure: { status: 410, data: { code: 'not_found' } } });
			expect(await post('abc', token)).toEqual({ error: 404 });
		});

		it('answers a lock timeout with 503 failed and changes nothing', async () => {
			const anna = insertBooking('2027-01-12T15:00:00Z');
			const token = await tokenOf(anna);
			clock.busy = true;
			expect(await post(String(anna), token)).toEqual({ failure: { status: 503, data: { code: 'failed' } } });
			expect(deletedAt(anna)).toBeNull();
		});

		it('has no delete dialog on a started booking', async () => {
			const started = insertBooking('2027-01-12T08:30:00Z');
			expect(await detail(String(started))).toMatchObject({ data: { view: { started: 'Hat schon begonnen.', delete: null } } });
		});
	});

	it('fills the home: a row under Heute, the empty line under Morgen, one flag, two refused-email links', async () => {
		insertBooking('2027-01-12T16:15:00Z');
		insertBooking('2027-01-14T20:30:00Z', { durationMin: 90 });
		for (const start of ['2027-01-15T16:00:00Z', '2027-01-16T16:00:00Z']) {
			const id = insertBooking(start);
			sqlite().prepare("insert into outbox (booking_id, kind, state, due_at, reason) values (?, 'confirmation', 'refused', '2027-01-07T10:00:00Z', 'smtp 550')").run(id);
		}
		const { data } = await home();
		const view = data.home as unknown as {
			next: { groups: { label: string; rows: unknown[]; empty: string | null }[] };
			flags: { kind: string; text: string; links: unknown[] }[];
		};
		expect(view.next.groups.map((g) => [g.label, g.rows.length, g.empty])).toEqual([
			['Heute · Di 12. Januar', 1, null],
			['Morgen · Mi 13. Januar', 0, 'Keine Buchungen an diesem Tag.']
		]);
		expect(view.flags.map((f) => [f.kind, f.text, f.links.length])).toEqual([
			['outside', '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.', 1],
			['refused', '2 Buchungen haben eine abgelehnte Mail.', 2]
		]);
	});

	describe('replyDone action (Story 3.4)', () => {
		const deleted = (start: string, over: { email?: string | null; replyDoneAt?: string } = {}) => {
			const id = insertBooking(start, { deletedAt: '2027-01-12T08:00:00Z' });
			sqlite()
				.prepare('update booking set email = ?, reply_done_at = ? where id = ?')
				.run(over.email === undefined ? 'tom@example.ch' : over.email, over.replyDoneAt ?? null, id);
			return id;
		};
		const post = (page: 'home' | 'day', bookingId?: string) => {
			const body = new URLSearchParams(bookingId === undefined ? {} : { bookingId });
			const path = page === 'home' ? '/admin' : '/admin/day/2027-01-12';
			const request = new Request(`http://localhost${path}?/replyDone`, { method: 'POST', body });
			const action = (page === 'home' ? homeActions : dayActions).replyDone as (e: unknown) => unknown;
			return run(() => action({ params: { date: '2027-01-12' }, request }));
		};
		const doneAt = (id: number) =>
			(sqlite().prepare('select reply_done_at as r from booking where id = ?').get(id) as { r: string | null }).r;
		const counts = async () =>
			((await run(() => (loadShell as (e: unknown) => unknown)({ locals: { adminSession: { id: 'x', expiresAt: '2027-02-11T09:00:00Z' } }, url: new URL('http://localhost/admin'), depends: () => {} }))) as { data: { counts: { replies: number } } }).data.counts.replies;

		it.each(['home', 'day'] as const)('marks it done from the %s page: gone from home, day and badge', async (page) => {
			const anna = deleted('2027-01-12T15:00:00Z');
			const { data } = await home();
			expect((data.home as unknown as { replies: { count: number; items: { id: number }[] } }).replies).toMatchObject({ count: 1, items: [{ id: anna }] });
			expect(await day('2027-01-12')).toMatchObject({ data: { view: { replies: { items: [{ id: anna }] } } } });
			expect(await counts()).toBe(1);
			expect(await post(page, String(anna))).toEqual({ data: { done: true } });
			expect(doneAt(anna)).toBe('2027-01-12T09:00:00Z');
			expect(((await home()).data.home as unknown as { replies: { count: number; items: unknown[] } }).replies).toMatchObject({ count: 0, items: [] });
			expect(await day('2027-01-12')).toMatchObject({ data: { view: { replies: { items: [] } } } });
			expect(await counts()).toBe(0);
		});

		it('answers 409 already_done for one done by another admin, a purged email, a live or unknown id; 404 for a malformed one', async () => {
			const done = deleted('2027-01-12T15:00:00Z', { replyDoneAt: '2027-01-12T08:30:00Z' });
			const purged = deleted('2027-01-12T16:30:00Z', { email: null });
			const live = insertBooking('2027-01-12T18:00:00Z');
			for (const id of [done, purged, live, 9999]) {
				expect(await post('home', String(id))).toEqual({ failure: { status: 409, data: { code: 'already_done', bookingId: id } } });
			}
			for (const id of ['abc', '0', '01', undefined]) expect(await post('day', id)).toEqual({ error: 404 });
			expect(doneAt(done)).toBe('2027-01-12T08:30:00Z');
			expect(doneAt(purged)).toBeNull();
			expect(doneAt(live)).toBeNull();
		});

		it('answers a lock timeout with 503 failed and writes nothing', async () => {
			const anna = deleted('2027-01-12T15:00:00Z');
			clock.busy = true;
			expect(await post('day', String(anna))).toEqual({ failure: { status: 503, data: { code: 'failed', bookingId: anna } } });
			expect(doneAt(anna)).toBeNull();
		});
	});
	describe('called action (Story 3.6)', () => {
		const HOT = '{"heat":"hot","earliest":null,"latest":null}';
		/** 17:15 Zurich with nobody before: cold 16:35–16:45. */
		const COLD = '{"heat":"cold","earliest":"2027-01-12T15:35:00Z","latest":"2027-01-12T15:45:00Z"}';
		/** Tom: keybox email sent, told hot, now cold: *Anruf nötig*. */
		const tom = () => {
			const id = insertBooking('2027-01-12T16:15:00Z');
			sqlite().prepare("update booking set last_told_notice = ?, mobile = '+41794123581' where id = ?").run(HOT, id);
			sqlite().prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'keybox', 'accepted', '2027-01-11T16:15:00Z')").run(id);
			return id;
		};
		const post = (fields: Record<string, string>) => {
			const request = new Request('http://localhost/admin?/called', { method: 'POST', body: new URLSearchParams(fields) });
			return run(() => (homeActions.called as (e: unknown) => unknown)({ request }));
		};
		const told = (id: number) =>
			(sqlite().prepare('select last_told_notice as n from booking where id = ?').get(id) as { n: string | null }).n;
		const counts = async () =>
			((await run(() => (loadShell as (e: unknown) => unknown)({ locals: { adminSession: { id: 'x', expiresAt: '2027-02-11T09:00:00Z' } }, url: new URL('http://localhost/admin'), depends: () => {} }))) as { data: { counts: { calls: number } } }).data.counts.calls;
		const calls = async () => ((await home()).data.home as unknown as { calls: { count: number; items: { bookingId: number; token: string; tel: unknown }[] } }).calls;

		it('lists Tom on the home with the nav badge agreeing, then marks him called: gone from both (Called)', async () => {
			const id = tom();
			const before = await calls();
			expect(before).toMatchObject({ count: 1, items: [{ bookingId: id, token: COLD, tel: { href: 'tel:+41794123581', text: '+41794123581' } }] });
			expect(await counts()).toBe(1);
			expect(await post({ bookingId: String(id), notice: before.items[0].token })).toEqual({
				data: { action: 'called', called: true, bookingId: id, firstName: 'Tom' }
			});
			expect(told(id)).toBe(COLD);
			expect(await calls()).toMatchObject({ count: 0, items: [] });
			expect(await counts()).toBe(0);
		});

		it('answers 409 already_done when called by another admin, deleted or started, and writes nothing (Gone)', async () => {
			const id = tom();
			expect(await post({ bookingId: String(id), notice: COLD })).toMatchObject({ data: { called: true } });
			expect(await post({ bookingId: String(id), notice: COLD })).toEqual({ failure: { status: 409, data: { action: 'called', code: 'already_done' } } });
			const deleted = tom();
			sqlite().prepare("update booking set deleted_at = '2027-01-12T08:00:00Z' where id = ?").run(deleted);
			expect(await post({ bookingId: String(deleted), notice: COLD })).toEqual({ failure: { status: 409, data: { action: 'called', code: 'already_done' } } });
			expect(told(deleted)).toBe(HOT);
			const started = tom();
			clock.now = '2027-01-12T16:20:00Z';
			expect(await post({ bookingId: String(started), notice: COLD })).toEqual({ failure: { status: 409, data: { action: 'called', code: 'already_done' } } });
			expect(told(started)).toBe(HOT);
			expect(await post({ bookingId: '9999', notice: COLD })).toEqual({ failure: { status: 409, data: { action: 'called', code: 'already_done' } } });
		});

		it('answers 409 stale with the booking id for a changed notice, a missing or garbage token, and writes nothing (Stale)', async () => {
			const id = tom();
			const displayed = '{"heat":"cold","earliest":"2027-01-12T15:45:00Z","latest":"2027-01-12T15:50:00Z"}';
			for (const fields of [{ notice: displayed }, { notice: 'x' }, {}] as Record<string, string>[]) {
				expect(await post({ bookingId: String(id), ...fields })).toEqual({ failure: { status: 409, data: { action: 'called', code: 'stale', bookingId: id } } });
			}
			expect(told(id)).toBe(HOT);
			expect((await calls()).count).toBe(1);
		});

		it('answers a lock timeout with 503 failed and writes nothing (Failure); a malformed id is an admin 404', async () => {
			const id = tom();
			clock.busy = true;
			expect(await post({ bookingId: String(id), notice: COLD })).toEqual({ failure: { status: 503, data: { action: 'called', code: 'failed', bookingId: id } } });
			expect(told(id)).toBe(HOT);
			clock.busy = false;
			for (const bookingId of ['abc', '0', '01']) expect(await post({ bookingId, notice: COLD })).toEqual({ error: 404 });
			expect(await post({ notice: COLD })).toEqual({ error: 404 });
		});
	});

	describe('Blocks (Story 3.5)', () => {
		const blocksPage = (query = '') =>
			run(() => (loadBlocks as (e: unknown) => unknown)({ url: new URL(`http://localhost/admin/blocks${query}`) })) as Promise<{
				data: { view: { rows: { id: number; text: string; delete: { token: string } | null }[]; empty: string | null; status: string | null } };
			}>;
		const insertBlock = (start: string, end: string) =>
			Number(sqlite().prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(start, end).lastInsertRowid);
		const blockCount = () => (sqlite().prepare('select count(*) as c from block').get() as { c: number }).c;
		const form = (fields: Record<string, string>) => new URLSearchParams(fields);
		const postNew = (action: 'check' | 'save', fields: Record<string, string>) => {
			const request = new Request(`http://localhost/admin/blocks/new?/${action}`, { method: 'POST', body: form(fields) });
			return run(() => (newBlockActions[action] as (e: unknown) => unknown)({ request }));
		};
		const postDelete = (fields: Record<string, string>) => {
			const request = new Request('http://localhost/admin/blocks?/delete', { method: 'POST', body: form(fields) });
			return run(() => (blocksActions.delete as (e: unknown) => unknown)({ request }));
		};
		const cleaning = { date: '2027-01-13', start: '09:00', end: '11:00', reason: 'cleaning' };
		const tokenOf = async (fields: Record<string, string>) => {
			const outcome = (await postNew('check', fields)) as { data: { dialog: { token: string } } };
			return outcome.data.dialog.token;
		};

		it('shows "Keine Blocks geplant." without upcoming blocks, and the statuses from the flags', async () => {
			insertBlock('2027-01-11T08:00:00Z', '2027-01-11T10:00:00Z');
			expect(await blocksPage()).toMatchObject({ data: { view: { rows: [], empty: 'Keine Blocks geplant.', status: null } } });
			expect((await blocksPage('?saved')).data.view.status).toBe('Gespeichert.');
			expect((await blocksPage('?deleted')).data.view.status).toBe('Block gelöscht.');
		});

		it('loads the form with today and Reinigung', async () => {
			expect(await run(() => (loadNewBlock as (e: unknown) => unknown)({}))).toMatchObject({
				data: { view: { defaults: { date: '2027-01-12', reason: 'cleaning' } } }
			});
		});

		it('check: 400 with errors and the values kept; 409 past at the start; 409 with the overlap refusal', async () => {
			expect(await postNew('check', { ...cleaning, start: '09:03', end: '' })).toEqual({
				failure: { status: 400, data: { values: { ...cleaning, start: '09:03', end: '' }, errors: { start: 'block_time_step', end: 'field_required' } } }
			});
			expect(await postNew('check', { ...cleaning, date: '2027-01-12', start: '09:00', end: '11:00' })).toEqual({
				failure: { status: 409, data: { values: { ...cleaning, date: '2027-01-12' }, errors: { start: 'block_past' } } }
			});
			insertBooking('2027-01-13T09:00:00Z');
			expect(await postNew('check', cleaning)).toEqual({
				failure: {
					status: 409,
					data: { values: cleaning, refusal: 'Dieser Block überschneidet 1 Buchung: Mi 10:00 (Tom). Blocks löschen keine Buchungen.' }
				}
			});
			// 02:30 on the spring switch (28 Mar 2027) does not exist.
			const skipped = { ...cleaning, date: '2027-03-28', start: '02:30', end: '03:00' };
			expect(await postNew('check', skipped)).toEqual({
				failure: { status: 400, data: { values: skipped, errors: { start: 'block_time_missing' } } }
			});
			expect(blockCount()).toBe(0);
		});

		it('check then save: the dialog with its token, then 303 to the list with "Gespeichert." and the block on the day view', async () => {
			const checked = (await postNew('check', cleaning)) as { data: { dialog: { title: string; what: string; token: string } } };
			expect(checked.data.dialog).toMatchObject({ title: 'Block speichern?', what: 'Reinigung · Mi 13. Januar, 09:00–11:00' });
			expect(await postNew('save', { ...cleaning, impactToken: checked.data.dialog.token })).toEqual({
				redirect: { status: 303, location: '/admin/blocks?saved' }
			});
			const { data } = await blocksPage('?saved');
			expect(data.view.rows.map((r) => r.text)).toEqual(['Mi 13. Januar · 09:00–11:00 · Reinigung']);
			expect(await day('2027-01-13')).toMatchObject({
				data: { view: { entries: [{ kind: 'block', block: { time: '09:00–11:00', text: 'Block · Reinigung' } }] } }
			});
		});

		it('save: 409 stale with the new dialog, 409 conflict with the refusal, 503 on a lock timeout; nothing saved', async () => {
			const token = await tokenOf({ ...cleaning, start: '08:00', end: '10:15' });
			// Meanwhile Tom books 11:00 told hot: the block now makes him a cold start.
			insertBooking('2027-01-13T10:00:00Z');
			sqlite().exec("update booking set last_told_notice = '{\"heat\":\"hot\",\"earliest\":null,\"latest\":null}'");
			const stale = (await postNew('save', { ...cleaning, start: '08:00', end: '10:15', impactToken: token })) as {
				failure: { status: number; data: { code: string; dialog: { token: string } } };
			};
			expect(stale.failure).toMatchObject({ status: 409, data: { code: 'stale' } });
			expect(stale.failure.data.dialog.token).not.toBe(token);
			insertBooking('2027-01-13T08:30:00Z');
			expect(await postNew('save', { ...cleaning, impactToken: token })).toMatchObject({
				failure: { status: 409, data: { refusal: 'Dieser Block überschneidet 1 Buchung: Mi 09:30 (Tom). Blocks löschen keine Buchungen.' } }
			});
			clock.busy = true;
			expect(await postNew('save', { ...cleaning, date: '2027-01-14', impactToken: 'x' })).toEqual({
				failure: { status: 503, data: { values: { ...cleaning, date: '2027-01-14' }, code: 'failed' } }
			});
			expect(blockCount()).toBe(0);
		});

		it('save: refused with past after "Prüfen" (inline at the start), nothing saved', async () => {
			const token = await tokenOf(cleaning);
			clock.now = '2027-01-13T08:00:00Z';
			expect(await postNew('save', { ...cleaning, impactToken: token })).toEqual({
				failure: { status: 409, data: { values: cleaning, errors: { start: 'block_past' } } }
			});
			expect(blockCount()).toBe(0);
		});

		it('check and save: the gap refusal for a block inside a back-to-back changeover', async () => {
			// Two bookings 10:00–11:00 and 11:15–12:15, back to back with the recorded 15 minutes.
			insertBooking('2027-01-13T09:00:00Z');
			insertBooking('2027-01-13T10:15:00Z');
			const gap = { ...cleaning, start: '11:00', end: '11:15' };
			const refusal = 'Zwischen diesen zwei Buchungen ist kein Platz für einen Block.';
			expect(await postNew('check', gap)).toEqual({ failure: { status: 409, data: { values: gap, refusal } } });
			// The command refuses a conflict before it looks at the token.
			expect(await postNew('save', { ...gap, impactToken: 'x' })).toEqual({ failure: { status: 409, data: { values: gap, refusal } } });
			expect(blockCount()).toBe(0);
		});

		it('save: a command `invalid` is a 400 at the end', async () => {
			clock.createInvalid = true;
			expect(await postNew('save', { ...cleaning, impactToken: 'x' })).toEqual({
				failure: { status: 400, data: { values: cleaning, errors: { end: 'block_end_not_after_start' } } }
			});
		});

		it('delete: 303 to the list with "Block gelöscht."; 410 when gone; 409 stale and past; 503; 404 for a malformed id', async () => {
			const id = insertBlock('2027-01-13T08:00:00Z', '2027-01-13T10:00:00Z');
			const token = (await blocksPage()).data.view.rows[0].delete?.token ?? '';
			clock.busy = true;
			expect(await postDelete({ blockId: String(id), impactToken: token })).toEqual({ failure: { status: 503, data: { code: 'failed', blockId: id } } });
			clock.busy = false;
			expect(await postDelete({ blockId: String(id), impactToken: 'x' })).toEqual({ failure: { status: 409, data: { code: 'stale', blockId: id } } });
			expect(await postDelete({ blockId: String(id), impactToken: token })).toEqual({ redirect: { status: 303, location: '/admin/blocks?deleted' } });
			expect(await postDelete({ blockId: String(id), impactToken: token })).toEqual({ failure: { status: 410, data: { code: 'not_found', blockId: id } } });
			const running = insertBlock('2027-01-12T08:30:00Z', '2027-01-12T10:00:00Z');
			expect(await postDelete({ blockId: String(running), impactToken: token })).toEqual({ failure: { status: 409, data: { code: 'past', blockId: running } } });
			expect((await blocksPage()).data.view.rows).toMatchObject([{ id: running, delete: null }]);
			for (const blockId of ['abc', '0']) expect(await postDelete({ blockId, impactToken: token })).toEqual({ error: 404 });
			expect(await postDelete({ impactToken: token })).toEqual({ error: 404 });
		});
	});
});
