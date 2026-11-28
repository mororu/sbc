// Stories 2.1–2.4: the worker drains the outbox into the sink, logs without contact data or the
// keybox code, records the heartbeat, and starts only once per process. Runs on a temp-file database.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callList, RETRY_BACKOFF_MIN, sendProblems, workerHealth, type Notice } from '#lib/domain/index.ts';
import { changeSettings, claimDueRow, createBooking } from '#lib/server/commands/index.ts';
import { createMailer, type Mailer } from '#lib/server/mail/index.ts';
import { getHeartbeat, getSendProblemRows } from '#lib/server/db/queries/index.ts';
// The test sets up its own temp database; app code reaches the db only through commands and queries.
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from '../db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { randomId } from '../ids.ts';
import { addMinutes } from '#lib/time/index.ts';
import type { ClaimedRow } from '#lib/server/commands/index.ts';
import { sendClaimedRow, startWorker, stopWorker, tick, TICK_INTERVAL_MS } from './index.ts';

const NOW = '2027-01-10T09:00:00Z';
const COLD_1800: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };

let dir: string;
let sqlite: ReturnType<typeof openDatabase>;
let db: Db;
let mailer: Mailer;
let lines: string[];
/** The scheduled jobs' log lines (Epic 4), kept apart from the mail lines. */
let jobLines: string[];

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-worker-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	mailer = createMailer({
		production: false,
		databasePath: join(dir, 'app.sqlite'),
		guestKeySecret: 'dev-only-x',
		mailTransport: 'sink',
		smtp: null,
		devNow: null
	});
	lines = [];
	jobLines = [];
});

afterEach(() => {
	stopWorker();
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const book = (start = '2027-01-12T17:00:00Z', now = NOW, durationMin = 90, locale: 'de' | 'en' = 'de') => {
	const result = createBooking(
		{
			start,
			durationMin,
			partySize: 3,
			name: 'Lena Muster',
			email: 'lena@example.ch',
			mobile: '+41791234567',
			locale,
			submitToken: randomId(),
			displayedNotice: COLD_1800
		},
		{ now, db }
	);
	if (!result.ok) throw new Error(result.code);
};

/** Yields to real immediates (not faked) until `done` holds, or gives up after a while. */
const until = async (done: () => boolean) => {
	for (let i = 0; i < 500 && !done(); i++) await new Promise((resolve) => setImmediate(resolve));
};

/** The confirmation rows; each booking's keybox row is not due yet at `NOW`. */
const states = () =>
	sqlite.prepare("select id, state from outbox where kind = 'confirmation' order by id").all() as { id: number; state: string }[];
const log = (line: string) => (/^\[worker\] (analytics|purge)/.test(line) ? jobLines : lines).push(line);
const deps = () => ({ db, mailer, now: () => NOW, log, guestKeySecret: 'test-secret' });

describe('tick', () => {
	it('sends a due confirmation to the sink, records accepted and the heartbeat, and logs no contact data', async () => {
		book();
		await tick(deps());
		const [row] = states();
		expect(row.state).toBe('accepted');
		expect(readdirSync(join(dir, 'mail-sink'))).toEqual([`${row.id}-confirmation-1.eml`]);
		expect(sqlite.prepare('select beat_at from worker_heartbeat').get()).toEqual({ beat_at: NOW });
		expect(lines).toEqual([`[worker] outbox ${row.id} confirmation attempt=1 accepted smtp=-`]);
		const log = lines.join('\n');
		for (const secret of ['Lena', 'lena@example.ch', '+41791234567', '791234567']) expect(log).not.toContain(secret);
		expect(sqlite.prepare('select last_told_notice = notice_at_booking as same from booking').get()).toEqual({ same: 1 });
	});

	it('runs the analytics snapshot, logs counts only, and nothing on the next tick (Story 4.1)', async () => {
		book();
		const after = '2027-01-12T17:00:00Z';
		await tick({ ...deps(), now: () => after });
		// 9 to 11 January have passed; the booking has just started.
		expect(jobLines).toEqual(['[worker] analytics bookings=1 days=3']);
		await tick({ ...deps(), now: () => after });
		expect(jobLines).toHaveLength(1);
	});

	it('records the heartbeat when the snapshot fails (Story 4.1)', async () => {
		sqlite.exec('drop table analytics_day');
		await tick(deps());
		expect(jobLines).toEqual(['[worker] analytics failed: SQLITE_ERROR']);
		expect(sqlite.prepare('select beat_at from worker_heartbeat').get()).toEqual({ beat_at: NOW });
	});

	it('drains every due row in one tick', async () => {
		book('2027-01-12T10:00:00Z');
		book('2027-01-12T13:00:00Z');
		book('2027-01-12T17:00:00Z');
		await tick(deps());
		expect(states().map((r) => r.state)).toEqual(['accepted', 'accepted', 'accepted']);
		expect(readdirSync(join(dir, 'mail-sink'))).toHaveLength(3);
	});

	it('records a transient failure with backoff when the send fails', async () => {
		book();
		const failing: Mailer = { send: async () => ({ outcome: 'transient_failure', smtpCode: 421, reason: 'smtp 421' }) };
		await tick({ ...deps(), mailer: failing });
		expect(sqlite.prepare('select state, reason, due_at from outbox').get()).toEqual({
			state: 'transient_failure',
			reason: 'smtp 421',
			due_at: '2027-01-10T09:01:00Z'
		});
		expect(lines).toEqual([
			expect.stringMatching(/^\[worker\] outbox \d+ confirmation attempt=1 transient_failure smtp=421 due=2027-01-10T09:01:00Z$/)
		]);
	});

	it('records a transient failure when the send throws unexpectedly', async () => {
		book();
		const throwing: Mailer = {
			send: async () => {
				throw new Error('boom for lena@example.ch');
			}
		};
		await tick({ ...deps(), mailer: throwing });
		expect(sqlite.prepare('select state, reason from outbox').get()).toEqual({ state: 'transient_failure', reason: 'error' });
		expect(lines.join('\n')).not.toContain('lena');
	});

	it('refuses a row without an address and writes no sink file', async () => {
		book();
		sqlite.prepare('update booking set email = null').run();
		await tick(deps());
		expect(sqlite.prepare('select state, reason from outbox').get()).toEqual({ state: 'refused', reason: 'no_address' });
		expect(existsSync(join(dir, 'mail-sink'))).toBe(false);
	});

	it('refuses a row that cannot be rendered, without a retry', async () => {
		book();
		// Only a broken stored notice makes rendering fail; the trigger normally keeps it immutable.
		sqlite.exec('drop trigger booking_notice_at_booking_immutable');
		sqlite.prepare("update booking set notice_at_booking = 'not json'").run();
		await tick(deps());
		expect(sqlite.prepare('select state, reason from outbox').get()).toEqual({ state: 'refused', reason: 'render_error' });
		expect(existsSync(join(dir, 'mail-sink'))).toBe(false);
	});

	it('cancels and does not send a row whose booking was deleted after the claim', async () => {
		book();
		const claim = claimDueRow({ now: NOW, db });
		if (!claim.ok) throw new Error('nothing claimed');
		sqlite.prepare("update booking set deleted_at = '2027-01-10T09:00:10Z'").run();
		const never: Mailer = {
			send: async () => {
				throw new Error('must not send');
			}
		};
		await sendClaimedRow(claim.row, { ...deps(), mailer: never });
		expect(sqlite.prepare('select state from outbox').get()).toEqual({ state: 'cancelled' });
		expect(lines).toEqual([`[worker] outbox ${claim.row.id} confirmation attempt=1 cancelled`]);
	});

	it('records no heartbeat when the drain fails, and logs the failure', async () => {
		sqlite.exec('drop table outbox');
		await tick(deps());
		expect(sqlite.prepare('select * from worker_heartbeat').all()).toEqual([]);
		// The snapshot does not need the outbox: 9 January is still recorded.
		expect(jobLines).toEqual(['[worker] analytics bookings=0 days=1']);
		// The held list is still checked, and fails the same way here.
		expect(lines).toEqual(['[worker] tick failed: SQLITE_ERROR', '[worker] held check failed: SQLITE_ERROR']);
	});

	it('turns failing after 15 minutes of transient failures while beat_at stays fresh, and ok after an accepted send (Story 2.5)', async () => {
		let now = NOW;
		let outcome: 'transient_failure' | 'accepted' = 'transient_failure';
		const sends: string[] = [];
		const flaky: Mailer = {
			send: async () => {
				sends.push(now);
				return outcome === 'accepted'
					? { outcome, smtpCode: 250, reason: null }
					: { outcome, smtpCode: 421, reason: 'smtp 421' };
			}
		};
		const health = () => workerHealth(getHeartbeat(db), now);
		// An earlier tick beat with nothing to send: without a heartbeat row a failure writes nothing.
		await tick({ ...deps(), now: () => addMinutes(NOW, -1), mailer: flaky });
		book();
		// One tick a minute; the backoff (1, 2, 5, 10 min) leaves most ticks with nothing to send.
		for (let minute = 0; minute <= 15; minute++) {
			now = addMinutes(NOW, minute);
			await tick({ ...deps(), now: () => now, mailer: flaky });
			expect(getHeartbeat(db)).toEqual({ beatAt: now, failingSince: NOW });
			expect(health()).toBe(minute < 15 ? 'ok' : 'failing');
		}
		// Each send waits the backoff step after the previous one: 0, 1, 3, 8 (and next 18) minutes.
		const offsets = RETRY_BACKOFF_MIN.reduce<number[]>((acc, step) => [...acc, acc.at(-1)! + step], [0]);
		expect(sends).toEqual(offsets.filter((m) => m <= 15).map((m) => addMinutes(NOW, m)));
		// The server is back: the next due send is accepted and the health is ok again.
		outcome = 'accepted';
		now = addMinutes(NOW, offsets.find((m) => m > 15)!);
		await tick({ ...deps(), now: () => now, mailer: flaky });
		expect(getHeartbeat(db)).toEqual({ beatAt: now, failingSince: null });
		expect(health()).toBe('ok');
	});

	it('records the heartbeat with nothing to send', async () => {
		await tick(deps());
		expect(sqlite.prepare('select beat_at from worker_heartbeat').get()).toEqual({ beat_at: NOW });
		expect(lines).toEqual([]);
		expect(existsSync(join(dir, 'mail-sink'))).toBe(false);
	});
});

describe('tick: the keybox email (Story 2.2)', () => {
	/** 15:30 on the day, for 18:00: past the cutoff, so both rows are due now. */
	const LATE = '2027-01-12T14:30:00Z';
	const lateDeps = () => ({ ...deps(), now: () => '2027-01-12T14:31:00Z' });
	const setKeybox = (code: string | null, de: string | null) =>
		sqlite.prepare('update setting set keybox_code = ?, keybox_instructions_de = ? where id = 1').run(code, de);
	const rows = () =>
		sqlite.prepare('select id, kind, state, reason from outbox order by id').all() as {
			id: number;
			kind: string;
			state: string;
			reason: string | null;
		}[];

	it('sends the confirmation, then the keybox email, and logs neither the code nor contact data', async () => {
		setKeybox('4711', 'Die Box hängt links an der Tür.\n\nLeg den Schlüssel danach zurück.');
		book('2027-01-12T17:00:00Z', LATE);
		await tick(lateDeps());
		const [confirmation, keybox] = rows();
		expect([confirmation.state, keybox.state]).toEqual(['accepted', 'accepted']);
		expect(lines).toEqual([
			`[worker] outbox ${confirmation.id} confirmation attempt=1 accepted smtp=-`,
			`[worker] outbox ${keybox.id} keybox attempt=1 accepted smtp=-`
		]);
		expect(readdirSync(join(dir, 'mail-sink')).sort()).toEqual([
			`${confirmation.id}-confirmation-1.eml`,
			`${keybox.id}-keybox-1.eml`
		]);
		const eml = readFileSync(join(dir, 'mail-sink', `${keybox.id}-keybox-1.eml`), 'utf8');
		expect(eml).toContain('Code: 4 7 1 1');
		const log = lines.join('\n');
		for (const secret of ['4711', '4 7 1 1', 'Lena', 'lena@example.ch', '+41791234567']) expect(log).not.toContain(secret);
		expect(sqlite.prepare('select snapshot_keybox_code as code from outbox where id = ?').get(keybox.id)).toEqual({ code: '4711' });
		expect(sqlite.prepare('select last_told_notice = (select snapshot_notice from outbox where id = ?) as same from booking').get(keybox.id)).toEqual({ same: 1 });
	});

	it('sends the code saved on the settings page since, resending nothing already sent and logging no code (Story 3.8)', async () => {
		setKeybox('4711', 'Box links.');
		book('2027-01-12T17:00:00Z', LATE);
		await tick(lateDeps());
		const first = rows().find((r) => r.kind === 'keybox');
		expect(first?.state).toBe('accepted');
		expect(changeSettings({ card: 'keybox', code: '5822' }, { now: '2027-01-12T14:31:00Z', db })).toEqual({ ok: true });
		book('2027-01-12T19:00:00Z', LATE, 60);
		await tick(lateDeps());
		const keybox = rows().filter((r) => r.kind === 'keybox');
		expect(keybox.map((r) => r.state)).toEqual(['accepted', 'accepted']);
		const read = (id: number) => readFileSync(join(dir, 'mail-sink', `${id}-keybox-1.eml`), 'utf8');
		expect(read(keybox[0].id)).toContain('Code: 4 7 1 1');
		expect(read(keybox[1].id)).toContain('Code: 5 8 2 2');
		const sink = readdirSync(join(dir, 'mail-sink'));
		expect(sink.filter((f) => f.startsWith(`${keybox[0].id}-keybox-`))).toEqual([`${keybox[0].id}-keybox-1.eml`]);
		const snapshots = sqlite.prepare("select snapshot_keybox_code as code from outbox where kind = 'keybox' order by id").all();
		expect(snapshots).toEqual([{ code: '4711' }, { code: '5822' }]);
		const log = lines.join('\n');
		for (const secret of ['4711', '5822']) expect(log).not.toContain(secret);
	});

	it('holds a keybox row without a code, logging it once, and still sends the rest', async () => {
		setKeybox(null, 'Box links.');
		book('2027-01-12T17:00:00Z', LATE);
		await tick(lateDeps());
		await tick(lateDeps());
		const [confirmation, keybox] = rows();
		expect(confirmation.state).toBe('accepted');
		expect(keybox.state).toBe('pending');
		expect(lines).toEqual([
			`[worker] outbox ${confirmation.id} confirmation attempt=1 accepted smtp=-`,
			`[worker] outbox ${keybox.id} keybox held missing=keybox_code`
		]);
		expect(sqlite.prepare('select beat_at from worker_heartbeat').get()).toEqual({ beat_at: '2027-01-12T14:31:00Z' });
	});

	it('logs a held row again only when its missing setting changes, or once it is held anew', async () => {
		setKeybox(null, ' ');
		book('2027-01-12T17:00:00Z', LATE);
		await tick(lateDeps());
		const keybox = rows()[1].id;
		setKeybox('4711', ' ');
		await tick(lateDeps());
		await tick(lateDeps());
		expect(lines.slice(1)).toEqual([
			`[worker] outbox ${keybox} keybox held missing=keybox_code`,
			`[worker] outbox ${keybox} keybox held missing=keybox_instructions_de`
		]);
		expect(lines.join('\n')).not.toContain('4711');
		// A second held row is logged on its own; the first is not logged again.
		book('2027-01-12T19:00:00Z', LATE);
		await tick(lateDeps());
		const second = rows()[3].id;
		expect(lines.slice(3)).toEqual([
			`[worker] outbox ${rows()[2].id} confirmation attempt=1 accepted smtp=-`,
			`[worker] outbox ${second} keybox held missing=keybox_instructions_de`
		]);
		// Once sent it leaves the held set.
		setKeybox('4711', 'Box links.');
		await tick(lateDeps());
		expect(rows().map((r) => r.state)).toEqual(['accepted', 'accepted', 'accepted', 'accepted']);
	});

	it('logs the held rows even when the drain fails', async () => {
		setKeybox(null, 'Box links.');
		book('2027-01-12T17:00:00Z', LATE);
		// The claim of the confirmation fails; the held query still works.
		sqlite.exec('create trigger no_claim before update of state on outbox begin select raise(abort, \'nope\'); end;');
		await tick(lateDeps());
		expect(lines).toEqual([
			'[worker] tick failed: SQLITE_CONSTRAINT_TRIGGER',
			`[worker] outbox ${rows()[1].id} keybox held missing=keybox_code`
		]);
		expect(sqlite.prepare('select * from worker_heartbeat').all()).toEqual([]);
	});

	it('returns a claimed row whose instructions were blanked before the send to pending, held', async () => {
		setKeybox('4711', 'Box links.');
		book('2027-01-12T17:00:00Z', LATE);
		const now = '2027-01-12T14:31:00Z';
		const first = claimDueRow({ now, db });
		if (!first.ok) throw new Error('nothing claimed');
		await sendClaimedRow(first.row, lateDeps());
		const claim = claimDueRow({ now, db });
		if (!claim.ok || claim.row.kind !== 'keybox') throw new Error('no keybox row claimed');
		setKeybox('4711', null);
		await sendClaimedRow(claim.row, lateDeps());
		expect(rows()[1]).toMatchObject({ state: 'pending', reason: null });
		const held = `[worker] outbox ${claim.row.id} keybox held missing=keybox_instructions_de`;
		// The re-enqueue result names the row and the action only.
		expect(lines.slice(-2)).toEqual([held, `[worker] outbox ${claim.row.id} keybox held heat_change=none`]);
		// The next tick does not log it again; once fixed, it goes out.
		await tick(lateDeps());
		expect(lines.filter((l) => l === held)).toHaveLength(1);
		setKeybox('4711', 'Box links.');
		await tick(lateDeps());
		expect(rows()[1]).toMatchObject({ state: 'accepted' });
		expect(readdirSync(join(dir, 'mail-sink'))).toContain(`${claim.row.id}-keybox-2.eml`);
	});
	it('sends the instructions and the Reply-To saved on the settings page since, per locale, with no resend (Story 3.7)', async () => {
		setKeybox('4711', 'Alte Anleitung.');
		book('2027-01-12T17:00:00Z', LATE, 90, 'de');
		book('2027-01-12T19:00:00Z', LATE, 60, 'en');
		const at = '2027-01-12T14:31:00Z';
		expect(changeSettings({ card: 'instructions', de: 'Neue Box rechts.', en: 'New box on the right.' }, { now: at, db })).toEqual({ ok: true });
		expect(changeSettings({ card: 'contact', contact: 'neu@example.ch' }, { now: at, db })).toEqual({ ok: true });
		await tick(lateDeps());
		const keybox = rows().filter((r) => r.kind === 'keybox');
		expect(keybox.map((r) => r.state)).toEqual(['accepted', 'accepted']);
		const [de, en] = keybox.map((r) => readFileSync(join(dir, 'mail-sink', `${r.id}-keybox-1.eml`), 'utf8'));
		expect(de).toContain('Neue Box rechts.');
		expect(de).not.toContain('Alte Anleitung.');
		expect(en).toContain('New box on the right.');
		for (const eml of [de, en]) expect(eml).toMatch(/^Reply-To: neu@example\.ch$/m);
		// Nothing is sent again: each keybox row has its one sink file, no second attempt.
		await tick(lateDeps());
		const sink = readdirSync(join(dir, 'mail-sink'));
		for (const row of keybox) expect(sink.filter((f) => f.startsWith(`${row.id}-keybox-`))).toEqual([`${row.id}-keybox-1.eml`]);
		expect(rows().filter((r) => r.kind === 'keybox').map((r) => r.state)).toEqual(['accepted', 'accepted']);
	});
});

describe('tick: the heat-change email (Story 2.3)', () => {
	const heatRow = () =>
		sqlite.prepare("select id, state, snapshot_notice, snapshot_urgent from outbox where kind = 'heat_change'").get() as
			| { id: number; state: string; snapshot_notice: string; snapshot_urgent: number }
			| undefined;

	it('sends the urgent email for a collapsed range at the first tick after the settle delay, and updates the last-told notice', async () => {
		// 18:00 told 17:20–17:30, then 16:30–17:30 is booked: come at 17:45.
		book('2027-01-12T17:00:00Z');
		await tick(deps());
		book('2027-01-12T15:30:00Z', NOW, 60);
		expect(heatRow()).toMatchObject({ state: 'pending' });
		// Before the settle delay ends: only the new confirmation goes out.
		await tick({ ...deps(), now: () => '2027-01-10T09:09:00Z' });
		expect(heatRow()).toMatchObject({ state: 'pending' });
		await tick({ ...deps(), now: () => '2027-01-10T09:11:00Z' });
		const sent = heatRow();
		expect(sent).toMatchObject({ state: 'accepted', snapshot_urgent: 1 });
		expect(lines.at(-1)).toBe(`[worker] outbox ${sent?.id} heat_change attempt=1 accepted smtp=-`);
		const eml = readFileSync(join(dir, 'mail-sink', `${sent?.id}-heat_change-1.eml`), 'utf8');
		expect(eml).toContain('multipart/alternative');
		expect(eml).toMatch(/Subject: =\?UTF-8\?Q\?Wichtig/);
		expect(
			sqlite.prepare("select last_told_notice as n from booking where start_at = '2027-01-12T17:00:00Z'").get()
		).toEqual({ n: sent?.snapshot_notice });
		expect(sent?.snapshot_notice).toBe('{"heat":"cold","earliest":"2027-01-12T16:45:00Z","latest":null}');
		for (const secret of ['Lena', 'lena@example.ch', '+41791234567']) expect(lines.join('\n')).not.toContain(secret);
	});
});

describe('sendClaimedRow: heat-change edge cases (Story 2.3)', () => {
	const TOLD = '{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}';
	const NOW_NOTICE = '{"heat":"cold","earliest":"2027-01-12T16:45:00Z","latest":null}';
	/** 18:00 told 17:20–17:30, then 16:30–17:30 booked; its heat-change row claimed by hand. */
	const claimedHeat = (over: Partial<ClaimedRow> = {}): ClaimedRow => {
		book('2027-01-12T17:00:00Z');
		book('2027-01-12T15:30:00Z', NOW, 60);
		const { id, booking_id: bookingId } = sqlite.prepare("select id, booking_id from outbox where kind = 'heat_change'").get() as {
			id: number;
			booking_id: number;
		};
		sqlite.prepare("update outbox set state = 'in_flight', claimed_at = ?, attempts = 1 where id = ?").run(NOW, id);
		return {
			id,
			bookingId,
			kind: 'heat_change',
			claimedAt: NOW,
			attempts: 1,
			snapshotNotice: NOW_NOTICE,
			snapshotKeyboxCode: null,
			snapshotLocale: 'de',
			snapshotLastTold: TOLD,
			snapshotUrgent: true,
			...over
		};
	};
	const state = (id: number) => sqlite.prepare('select state, reason from outbox where id = ?').get(id);

	it('refuses a heat-change row that cannot be rendered, without a retry, and leaves the last-told notice', async () => {
		const row = claimedHeat({ snapshotLastTold: NOW_NOTICE });
		await sendClaimedRow(row, deps());
		expect(state(row.id)).toEqual({ state: 'refused', reason: 'render_error' });
		expect(lines).toEqual([`[worker] outbox ${row.id} heat_change attempt=1 refused smtp=-`]);
		expect(existsSync(join(dir, 'mail-sink'))).toBe(false);
		expect(sqlite.prepare("select last_told_notice as n from booking where start_at = '2027-01-12T17:00:00Z'").get()).toEqual({ n: TOLD });
	});

	it('logs superseded, without a due time, for a transient failure while a newer change has its own row', async () => {
		const row = claimedHeat();
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'heat_change', 'pending', ?)").run(row.bookingId, NOW);
		const failing: Mailer = { send: async () => ({ outcome: 'transient_failure', smtpCode: 421, reason: 'smtp 421' }) };
		await sendClaimedRow(row, { ...deps(), mailer: failing });
		expect(state(row.id)).toEqual({ state: 'cancelled', reason: 'smtp 421' });
		expect(lines).toEqual([`[worker] outbox ${row.id} heat_change attempt=1 superseded smtp=421`]);
	});
});

describe('tick: the good-news email in English (Story 2.3)', () => {
	it('sends "Good news" for an EN booking that turns hot', async () => {
		// 16:00–17:00, then 18:30 (told cold 17:50–18:00), then 17:15–18:15 makes 18:30 hot.
		book('2027-01-12T15:00:00Z', NOW, 60);
		book('2027-01-12T17:30:00Z', NOW, 90, 'en');
		book('2027-01-12T16:15:00Z', NOW, 60);
		await tick({ ...deps(), now: () => '2027-01-10T09:10:00Z' });
		const sent = sqlite.prepare("select id, state, snapshot_urgent, snapshot_locale from outbox where kind = 'heat_change'").get() as {
			id: number;
			state: string;
			snapshot_urgent: number;
			snapshot_locale: string;
		};
		expect(sent).toMatchObject({ state: 'accepted', snapshot_urgent: 0, snapshot_locale: 'en' });
		const eml = readFileSync(join(dir, 'mail-sink', `${sent.id}-heat_change-1.eml`), 'utf8');
		expect(eml).toContain('Subject: Good news: Tue 12 January, 18:30 is already hot');
		expect(eml).toContain('Content-Language: en');
		expect(
			sqlite.prepare("select last_told_notice as n from booking where start_at = '2027-01-12T17:30:00Z'").get()
		).toEqual({ n: '{"heat":"hot","earliest":null,"latest":null}' });
	});
});

describe('tick: refused and stuck sends (Story 2.4)', () => {
	/** 15:30 on the day, for 18:00: past the cutoff, so the confirmation and the keybox row are due now. */
	const LATE = '2027-01-12T14:30:00Z';
	const SENT = '2027-01-12T14:31:00Z';
	const lateDeps = () => ({ ...deps(), now: () => SENT });
	/** Throws like nodemailer for the keybox email only: the server's text names the guest. */
	const failingKeybox = (error: object): Mailer => ({
		send: async (message) => {
			if (message.kind !== 'keybox') return { outcome: 'accepted', smtpCode: 250, reason: null };
			throw Object.assign(new Error(`failed for ${message.to}`), error);
		}
	});
	const keyboxRow = () =>
		sqlite.prepare("select id, state, reason from outbox where kind = 'keybox'").get() as {
			id: number;
			state: string;
			reason: string | null;
		};
	const SECRETS = ['4711', '4 7 1 1', 'Lena', 'lena@example.ch', '+41791234567'];

	beforeEach(() => {
		sqlite.prepare("update setting set keybox_code = '4711', keybox_instructions_de = 'Box links.' where id = 1").run();
		book('2027-01-12T17:00:00Z', LATE);
	});

	it('logs a 5xx refusal with the row id, state and SMTP code only, and reports it as keybox_refused', async () => {
		const response = '550 5.1.1 <lena@example.ch>: Recipient address rejected';
		await tick({ ...lateDeps(), mailer: failingKeybox({ responseCode: 550, response }) });
		const keybox = keyboxRow();
		expect(keybox).toMatchObject({ state: 'refused', reason: 'smtp 550' });
		expect(lines.filter((l) => l.includes(` ${keybox.id} `))).toEqual([
			`[worker] outbox ${keybox.id} keybox attempt=1 refused smtp=550`
		]);
		for (const secret of SECRETS) expect(lines.join('\n')).not.toContain(secret);

		const feed = getSendProblemRows(SENT, db);
		expect(feed.size).toBe(1);
		const [entry] = feed.values();
		expect(sendProblems(entry, SENT)).toEqual({
			callRequired: [{ rowId: keybox.id, reason: 'keybox_refused' }],
			refusals: []
		});
	});

	it('logs a timeout as a transient failure with smtp=- and its retry time, and no contact data or code', async () => {
		await tick({ ...lateDeps(), mailer: failingKeybox({ code: 'ETIMEDOUT' }) });
		const keybox = keyboxRow();
		expect(keybox).toMatchObject({ state: 'transient_failure', reason: 'ETIMEDOUT' });
		expect(lines.filter((l) => l.includes(` ${keybox.id} `))).toEqual([
			`[worker] outbox ${keybox.id} keybox attempt=1 transient_failure smtp=- due=2027-01-12T14:32:00Z`
		]);
		for (const secret of SECRETS) expect(lines.join('\n')).not.toContain(secret);

		// Nothing is raised right away; the row is overdue 15 minutes after its original due time
		// (booked past the cutoff at 14:30Z), although its due_at moved to the retry.
		expect(callList(getSendProblemRows(SENT, db), SENT)).toEqual([]);
		expect(callList(getSendProblemRows('2027-01-12T14:44:59Z', db), '2027-01-12T14:44:59Z')).toEqual([]);
		const overdue = '2027-01-12T14:45:00Z';
		expect(callList(getSendProblemRows(overdue, db), overdue)).toEqual([
			expect.objectContaining({ callRequired: [{ rowId: keybox.id, reason: 'keybox_overdue' }], refusals: [] })
		]);
	});
});

describe('startWorker', () => {
	it('starts one loop only, even when called again (HMR)', async () => {
		book();
		expect(startWorker(deps())).toBe(true);
		expect(startWorker(deps())).toBe(false);
		await vi.waitFor(() => expect(states()[0].state).toBe('accepted'));
		expect(lines.filter((l) => l.includes('accepted'))).toHaveLength(1);
	});

	it('ticks again once the interval has passed after a tick', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			let clock = NOW;
			book();
			sqlite.prepare("update outbox set due_at = '2027-01-10T09:00:30Z' where kind = 'confirmation'").run();
			expect(startWorker({ ...deps(), now: () => clock })).toBe(true);
			await vi.advanceTimersByTimeAsync(0);
			// vi.waitFor would advance the fake timers itself; poll on real immediates instead.
			await until(() => sqlite.prepare('select 1 from worker_heartbeat').get() !== undefined);
			expect(states()[0].state).toBe('pending');

			clock = '2027-01-10T09:01:00Z';
			await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS - 1);
			expect(states()[0].state).toBe('pending');
			await vi.advanceTimersByTimeAsync(1);
			await until(() => states()[0].state === 'accepted');
			expect(states()[0].state).toBe('accepted');
		} finally {
			vi.useRealTimers();
		}
	});

	it('releases stale claims on start', async () => {
		book();
		sqlite.prepare("update outbox set state = 'in_flight', claimed_at = '2027-01-10T08:00:00Z' where kind = 'confirmation'").run();
		expect(startWorker(deps())).toBe(true);
		await vi.waitFor(() => expect(states()[0].state).toBe('accepted'));
		expect(lines[0]).toBe('[worker] released 1 stale claims, superseded 0');
	});
});
