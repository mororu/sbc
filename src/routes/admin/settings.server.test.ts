// The settings route on the server (Story 3.7): every action's saved and invalid results (the values
// kept, never the password), the pre-heat check (unchanged, dialog), save and stale, the password
// card (hash replaced, other sessions deleted, own kept), a lock timeout (503 in the card), and a
// guest read after a save seeing the new value. An in-memory database; DEV_NOW Tue 12 Jan 2027,
// 11:06 Zurich. Story 3.8: the season and keybox actions (saved, order/empty, overlap → 400 on
// start, not_found/past/lock timeout → 503 failed), never writing an outbox row or a booking.
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates and edits its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
// eslint-disable-next-line no-restricted-imports
import { getDb } from '#lib/server/db/index.ts';
import { setAdminPassword } from '#lib/server/commands/index.ts';
import { getSettings } from '#lib/server/db/queries/index.ts';
import { hashPassword, verifyPassword } from '#lib/server/password.ts';
import { actions, load } from './(portal)/settings/+page.server.ts';
import { load as loadGuestLayout } from '../(guest)/+layout.server.ts';

const clock = vi.hoisted(() => ({
	now: '2027-01-12T10:06:00Z',
	busy: false,
	/** The command's own range check refusing a form that passed the schema. */
	settingsInvalid: false,
	/** The password command refusing the computed hash. */
	passwordInvalid: false
}));

const busyError = () => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

vi.mock('#lib/server/commands/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/commands/index.ts')>();
	return {
		...actual,
		changeSettings: (...args: Parameters<typeof actual.changeSettings>) => {
			if (clock.busy) throw busyError();
			if (clock.settingsInvalid) return { ok: false as const, code: 'invalid' as const };
			return actual.changeSettings(...args);
		},
		changeAdminPassword: (...args: Parameters<typeof actual.changeAdminPassword>) => {
			if (clock.busy) throw busyError();
			if (clock.passwordInvalid) return { ok: false as const, code: 'invalid' as const };
			return actual.changeAdminPassword(...args);
		}
	};
});

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => 'de'
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

/** The seeded setting row as each test starts from it. */
const SEED =
	"update setting set changeover_min = 15, preheat_min_min = 30, preheat_max_min = 40, horizon_days = 14, open_minute = 600, close_minute = 1320, admin_contact = 'platzhalter@sauna-luegisee.ch', keybox_instructions_de = null, keybox_instructions_en = null, keybox_code = null";

const OWN = 'AAAAAAAAAAAAAAAAAAAAAA';
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBB';
const sqlite = () => getDb().$client;

beforeAll(() => {
	applyMigrations();
});

beforeEach(async () => {
	clock.busy = false;
	clock.settingsInvalid = false;
	clock.passwordInvalid = false;
	sqlite().exec(SEED);
	sqlite().exec('delete from outbox; delete from booking; delete from admin_session');
	sqlite().exec("delete from season where id <> 1; update season set start_date = '2027-01-09', end_date = '2027-04-30' where id = 1");
	clock.now = '2027-01-12T10:06:00Z';
	setAdminPassword({ hash: await hashPassword('correct horse battery'), reset: true });
	const insert = sqlite().prepare("insert into admin_session (id, created_at, expires_at) values (?, '2027-01-12T09:00:00Z', '2027-02-11T09:00:00Z')");
	insert.run(OWN);
	insert.run(OTHER);
});

type Outcome = { redirect: { status: number; location: string } } | { failure: { status: number; data: unknown } } | { data: unknown };

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

type Action = keyof typeof actions;
const deletedCookies: unknown[][] = [];
const cookies = { delete: (...args: unknown[]) => deletedCookies.push(args) };
const post = (action: Action, fields: Record<string, string>, locals: App.Locals = { adminSession: { id: OWN, expiresAt: '2027-02-11T09:00:00Z' } }) => {
	const request = new Request(`http://localhost/admin/settings?/${action}`, { method: 'POST', body: new URLSearchParams(fields) });
	const url = new URL('http://localhost/admin/settings');
	return run(() => (actions[action] as (e: unknown) => unknown)({ request, locals, url, cookies }));
};
const outboxCount = () => (sqlite().prepare('select count(*) as c from outbox').get() as { c: number }).c;
const insertBooking = (start: string, lastTold: string | null) =>
	Number(
		sqlite()
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'Lena Graf', ?)"
			)
			.run(start, `P${start}`, `T${start}`, lastTold).lastInsertRowid
	);
const COLD_1800 = JSON.stringify({ heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' });

describe('load', () => {
	it('gives the settings view', async () => {
		const outcome = (await run(() => (load as (e: unknown) => unknown)({}))) as { data: { view: { kind: string; cards: { card: string }[] } } };
		expect(outcome.data.view.kind).toBe('admin-settings');
		expect(outcome.data.view.cards.map((c) => c.card)).toEqual([
			'season',
			'hours',
			'changeover',
			'horizon',
			'preheat',
			'keybox',
			'instructions',
			'contact',
			'password'
		]);
	});
});

describe('plain cards', () => {
	it('save hours, changeover, horizon, instructions and contact; no outbox row', async () => {
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		expect(await post('hours', { open: '12:00', close: '21:00' })).toEqual({ data: { card: 'hours', saved: true } });
		expect(await post('changeover', { minutes: '30' })).toEqual({ data: { card: 'changeover', saved: true } });
		expect(await post('horizon', { days: '21' })).toEqual({ data: { card: 'horizon', saved: true } });
		expect(await post('instructions', { de: 'Box links.', en: 'Box left.' })).toEqual({ data: { card: 'instructions', saved: true } });
		expect(await post('contact', { email: 'sauna@example.ch' })).toEqual({ data: { card: 'contact', saved: true } });
		expect(getSettings()).toMatchObject({ openMinute: 720, closeMinute: 1260, changeoverMin: 30, horizonDays: 21 });
		expect(outboxCount()).toBe(0);
	});

	it('answers 400 with per-field keys and the values kept; nothing saved', async () => {
		const before = JSON.stringify(sqlite().prepare('select * from setting').get());
		expect(await post('changeover', { minutes: '7' })).toEqual({
			failure: { status: 400, data: { card: 'changeover', errors: { minutes: 'settings_changeover_range' }, values: { minutes: '7' } } }
		});
		expect(await post('horizon', { days: '0' })).toEqual({
			failure: { status: 400, data: { card: 'horizon', errors: { days: 'settings_horizon_range' }, values: { days: '0' } } }
		});
		expect(await post('hours', { open: '12:00', close: '12:00' })).toEqual({
			failure: { status: 400, data: { card: 'hours', errors: { close: 'settings_hours_order' }, values: { open: '12:00', close: '12:00' } } }
		});
		expect(await post('instructions', { de: '', en: 'x' })).toEqual({
			failure: { status: 400, data: { card: 'instructions', errors: { de: 'field_required' }, values: { de: '', en: 'x' } } }
		});
		expect(await post('contact', { email: 'sauna@' })).toEqual({
			failure: { status: 400, data: { card: 'contact', errors: { email: 'settings_contact_invalid' }, values: { email: 'sauna@' } } }
		});
		expect(await post('preheatCheck', { min: '50', max: '40' })).toEqual({
			failure: { status: 400, data: { card: 'preheat', errors: { min: 'settings_preheat_swapped' }, values: { min: '50', max: '40' } } }
		});
		expect(JSON.stringify(sqlite().prepare('select * from setting').get())).toBe(before);
	});

	it('answers 503 failed in the card on a lock timeout; nothing saved', async () => {
		clock.busy = true;
		expect(await post('changeover', { minutes: '30' })).toEqual({ failure: { status: 503, data: { card: 'changeover', code: 'failed' } } });
		expect(await post('preheat', { min: '40', max: '50', impactToken: 'x' })).toEqual({ failure: { status: 503, data: { card: 'preheat', code: 'failed' } } });
		expect(await post('password', { password: 'a new long password' })).toEqual({ failure: { status: 503, data: { card: 'password', code: 'failed' } } });
		expect(getSettings().changeoverMin).toBe(15);
	});

	it('answers a command `invalid` on a form the schema passed with 400 at the card’s fallback field; nothing saved', async () => {
		clock.settingsInvalid = true;
		expect(await post('hours', { open: '12:00', close: '21:00' })).toEqual({
			failure: { status: 400, data: { card: 'hours', errors: { close: 'settings_hours_order' }, values: { open: '12:00', close: '21:00' } } }
		});
		expect(await post('instructions', { de: 'Box links.', en: 'Box left.' })).toEqual({
			failure: { status: 400, data: { card: 'instructions', errors: { de: 'field_required' }, values: { de: 'Box links.', en: 'Box left.' } } }
		});
		expect(await post('preheat', { min: '40', max: '50', impactToken: 'x' })).toEqual({
			failure: { status: 400, data: { card: 'preheat', errors: { min: 'settings_preheat_range' }, values: { min: '40', max: '50' } } }
		});
		expect(getSettings()).toMatchObject({ openMinute: 600, preheatMinMin: 30 });
	});

	it('a guest read after a save sees the new contact (no cache)', async () => {
		const guest = () => (loadGuestLayout as unknown as () => { adminContact: { address: string } | null })();
		expect(guest().adminContact?.address).toBe('platzhalter@sauna-luegisee.ch');
		await post('contact', { email: 'sauna@example.ch' });
		expect(guest().adminContact).toEqual({ address: 'sauna@example.ch', href: 'mailto:sauna@example.ch' });
	});
});

describe('season and keybox (Story 3.8)', () => {
	const seasons = () => sqlite().prepare('select * from season order by id').all();
	const bookings = () => JSON.stringify(sqlite().prepare('select * from booking order by id').all());

	it('Edit current: saves in place; no outbox row, bookings unchanged', async () => {
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		const before = bookings();
		expect(await post('season', { start: '2027-01-09', end: '2027-04-15', id: '1' })).toEqual({ data: { card: 'season', saved: true } });
		expect(seasons()).toEqual([{ id: 1, start_date: '2027-01-09', end_date: '2027-04-15' }]);
		expect(bookings()).toBe(before);
		expect(outboxCount()).toBe(0);
	});

	it('Order / empty: 400 on end / start, values kept; nothing saved', async () => {
		expect(await post('season', { start: '2027-01-09', end: '2027-01-09', id: '1' })).toEqual({
			failure: {
				status: 400,
				data: { card: 'season', errors: { end: 'settings_season_order' }, values: { start: '2027-01-09', end: '2027-01-09', id: '1' } }
			}
		});
		expect(await post('season', { start: '', end: '2027-04-15', id: '1' })).toEqual({
			failure: { status: 400, data: { card: 'season', errors: { start: 'field_required' }, values: { start: '', end: '2027-04-15', id: '1' } } }
		});
		expect(seasons()).toEqual([{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' }]);
	});

	it('Overlap: 400 with the overlap error on start, values kept; nothing written', async () => {
		expect(await post('season', { start: '2027-04-01', end: '2027-05-31' })).toEqual({
			failure: {
				status: 400,
				data: { card: 'season', errors: { start: 'settings_season_overlap' }, values: { start: '2027-04-01', end: '2027-05-31', id: '' } }
			}
		});
		expect(seasons()).toHaveLength(1);
		expect(outboxCount()).toBe(0);
	});

	it('Ended: creates the next season without an id; posting the ended row is `past` → 503 failed', async () => {
		clock.now = '2027-05-10T08:00:00Z';
		expect(await post('season', { start: '2027-12-20', end: '2028-04-30' })).toEqual({ data: { card: 'season', saved: true } });
		expect(seasons()).toEqual([
			{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' },
			{ id: 2, start_date: '2027-12-20', end_date: '2028-04-30' }
		]);
		expect(await post('season', { start: '2027-01-09', end: '2027-05-31', id: '1' })).toEqual({ failure: { status: 503, data: { card: 'season', code: 'failed' } } });
		expect(seasons()).toHaveLength(2);
	});

	it('an unknown id (the row is gone) → 503 failed; a lock timeout → 503 failed', async () => {
		expect(await post('season', { start: '2027-12-20', end: '2028-04-30', id: '9' })).toEqual({ failure: { status: 503, data: { card: 'season', code: 'failed' } } });
		clock.busy = true;
		expect(await post('season', { start: '2027-01-09', end: '2027-04-15', id: '1' })).toEqual({ failure: { status: 503, data: { card: 'season', code: 'failed' } } });
		expect(await post('keybox', { code: '5822' })).toEqual({ failure: { status: 503, data: { card: 'keybox', code: 'failed' } } });
		expect(seasons()).toEqual([{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' }]);
	});

	it('an end before today is 400 on end; a changed start of the running season and a malformed id are 503 failed', async () => {
		expect(await post('season', { start: '2027-01-09', end: '2027-01-11', id: '1' })).toEqual({
			failure: {
				status: 400,
				data: { card: 'season', errors: { end: 'settings_season_end_past' }, values: { start: '2027-01-09', end: '2027-01-11', id: '1' } }
			}
		});
		expect(await post('season', { start: '2026-11-01', end: '2026-12-31' })).toEqual({
			failure: { status: 400, data: { card: 'season', errors: { end: 'settings_season_end_past' }, values: { start: '2026-11-01', end: '2026-12-31', id: '' } } }
		});
		expect(await post('season', { start: '2027-01-10', end: '2027-04-30', id: '1' })).toEqual({ failure: { status: 503, data: { card: 'season', code: 'failed' } } });
		expect(await post('season', { start: '2027-01-09', end: '2027-04-30', id: 'x' })).toEqual({ failure: { status: 503, data: { card: 'season', code: 'failed' } } });
		expect(await post('season', { start: '2027-01-09', end: '2027-04-30', id: '1000000000' })).toEqual({
			failure: { status: 503, data: { card: 'season', code: 'failed' } }
		});
		expect(seasons()).toEqual([{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' }]);
	});

	it('a code over 32 characters is 400 settings_keybox_invalid', async () => {
		const long = 'A'.repeat(33);
		expect(await post('keybox', { code: long })).toEqual({
			failure: { status: 400, data: { card: 'keybox', errors: { code: 'settings_keybox_invalid' }, values: { code: long } } }
		});
	});

	it('Code change: replaced and saved, no outbox row; an empty code is 400 field_required', async () => {
		sqlite().exec("update setting set keybox_code = '4711'");
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		const before = bookings();
		expect(await post('keybox', { code: '5822' })).toEqual({ data: { card: 'keybox', saved: true } });
		expect(sqlite().prepare('select keybox_code as code from setting').get()).toEqual({ code: '5822' });
		expect(bookings()).toBe(before);
		expect(outboxCount()).toBe(0);
		expect(await post('keybox', { code: '  ' })).toEqual({
			failure: { status: 400, data: { card: 'keybox', errors: { code: 'field_required' }, values: { code: '  ' } } }
		});
		expect(sqlite().prepare('select keybox_code as code from setting').get()).toEqual({ code: '5822' });
	});
});

describe('pre-heat', () => {
	it('check with an unchanged window saves nothing and answers saved', async () => {
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		expect(await post('preheatCheck', { min: '30', max: '40' })).toEqual({ data: { card: 'preheat', saved: true } });
		expect(outboxCount()).toBe(0);
	});

	it('check opens the dialog; save with its token saves and enqueues', async () => {
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		const checked = (await post('preheatCheck', { min: '40', max: '50' })) as {
			data: { card: string; values: unknown; dialog: { what: string; token: string; values: unknown } };
		};
		expect(checked.data.card).toBe('preheat');
		expect(checked.data.values).toEqual({ min: '40', max: '50' });
		expect(checked.data.dialog.what).toBe('30–40 → 40–50 Minuten · 1 Buchung bekommt eine neue Ankunftszeit');
		expect(getSettings().preheatMinMin).toBe(30);
		expect(await post('preheat', { min: '40', max: '50', impactToken: checked.data.dialog.token })).toEqual({ data: { card: 'preheat', saved: true } });
		expect(getSettings()).toMatchObject({ preheatMinMin: 40, preheatMaxMin: 50 });
		expect(outboxCount()).toBe(1);
	});

	it('save with a stale token answers 409 with the new dialog; nothing saved', async () => {
		insertBooking('2027-01-12T17:00:00Z', COLD_1800);
		const checked = (await post('preheatCheck', { min: '40', max: '50' })) as { data: { dialog: { token: string } } };
		insertBooking('2027-01-13T17:00:00Z', JSON.stringify({ heat: 'cold', earliest: '2027-01-13T16:20:00Z', latest: '2027-01-13T16:30:00Z' }));
		const stale = (await post('preheat', { min: '40', max: '50', impactToken: checked.data.dialog.token })) as {
			failure: { status: number; data: { card: string; code: string; dialog: { what: string } } };
		};
		expect(stale.failure.status).toBe(409);
		expect(stale.failure.data).toMatchObject({ card: 'preheat', code: 'stale' });
		expect(stale.failure.data.dialog.what).toBe('30–40 → 40–50 Minuten · 2 Buchungen bekommen eine neue Ankunftszeit');
		expect(getSettings().preheatMinMin).toBe(30);
		expect(outboxCount()).toBe(0);
	});
});

describe('password', () => {
	const hash = () => (sqlite().prepare('select admin_password_hash as h from setting').get() as { h: string }).h;
	const sessionIds = () => (sqlite().prepare('select id from admin_session order by id').all() as { id: string }[]).map((r) => r.id);

	it('refuses a short or empty password with 400, never echoing it', async () => {
		const short = await post('password', { password: 'short pass' });
		expect(short).toEqual({ failure: { status: 400, data: { card: 'password', errors: { password: 'admin_password_too_short' }, values: {} } } });
		expect(JSON.stringify(short)).not.toContain('short pass');
		expect(await post('password', {})).toEqual({ failure: { status: 400, data: { card: 'password', errors: { password: 'field_required' }, values: {} } } });
		expect(sessionIds()).toEqual([OWN, OTHER]);
	});

	it('replaces the hash, deletes the other sessions and keeps the own one', async () => {
		const result = await post('password', { password: 'a new long password' });
		expect(result).toEqual({ data: { card: 'password', saved: true } });
		expect(JSON.stringify(result)).not.toContain('a new long password');
		expect(await verifyPassword(hash(), 'a new long password')).toBe(true);
		expect(sessionIds()).toEqual([OWN]);
	});

	it('clears the cookie and sends to sign in again when another admin’s change ended the own session first', async () => {
		deletedCookies.length = 0;
		const before = hash();
		sqlite().prepare('delete from admin_session where id = ?').run(OWN);
		expect(await post('password', { password: 'a new long password' })).toEqual({
			redirect: { status: 303, location: '/admin/login?to=%2Fadmin%2Fsettings&expired=1' }
		});
		expect(deletedCookies).toEqual([['admin_session', expect.objectContaining({ path: '/admin' })]]);
		expect(hash()).toBe(before);
		expect(sessionIds()).toEqual([OTHER]);
	});

	it('throws (a 500) when the command refuses the computed hash, naming neither hash nor password', async () => {
		clock.passwordInvalid = true;
		const error = await post('password', { password: 'a new long password' }).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).not.toContain('a new long password');
		expect((error as Error).message).not.toContain('$argon2id$');
	});

	it('sends a request without a session to sign in', async () => {
		expect(await post('password', { password: 'a new long password' }, {})).toEqual({
			redirect: { status: 303, location: '/admin/login?to=%2Fadmin%2Fsettings' }
		});
		expect(sessionIds()).toEqual([OWN, OTHER]);
	});
});
