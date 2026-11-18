// The admin routes on the server (Story 3.1 matrix, "Sign in", "Bad target", "Wrong", "Sign out",
// and the nav counts): an in-memory database, DEV_NOW at Tue 12 Jan 2027, 10:00 Zurich.
import { isActionFailure, isRedirect } from '@sveltejs/kit';
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
import { load as loadHome } from './(portal)/+page.server.ts';

const clock = vi.hoisted(() => ({ now: '2027-01-12T09:00:00Z', locale: 'de' as 'de' | 'en', busy: false }));

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
	resetSignInAttempts();
	getDb().$client.exec('delete from admin_session');
});

type Outcome =
	| { redirect: { status: number; location: string } }
	| { failure: { status: number; data: unknown } }
	| { data: unknown };

async function run(fn: () => unknown): Promise<Outcome> {
	try {
		const result = await fn();
		if (isActionFailure(result)) return { failure: { status: result.status, data: result.data } };
		return { data: result };
	} catch (e) {
		if (isRedirect(e)) return { redirect: { status: e.status, location: e.location } };
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
		expect(await run(() => (loadHome as (e: unknown) => unknown)({}))).toEqual({ data: { home: { warning: 'Der Versand läuft nicht.' } } });
	});

	it('warns in English when the admin uses English', async () => {
		clock.locale = 'en';
		expect(await run(() => (loadHome as (e: unknown) => unknown)({}))).toEqual({ data: { home: { warning: "Sending isn't running." } } });
	});
});
