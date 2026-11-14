// Story 2.1: the worker drains the outbox into the sink, logs without contact data, records the
// heartbeat, and starts only once per process. Runs on a temp-file database.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notice } from '#lib/domain/index.ts';
import { claimDueRow, createBooking } from '#lib/server/commands/index.ts';
import { createMailer, type Mailer } from '#lib/server/mail/index.ts';
// The test sets up its own temp database; app code reaches the db only through commands and queries.
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from '../db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { randomId } from '../ids.ts';
import { sendClaimedRow, startWorker, stopWorker, tick, TICK_INTERVAL_MS } from './index.ts';

const NOW = '2027-01-10T09:00:00Z';
const COLD_1800: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };

let dir: string;
let sqlite: ReturnType<typeof openDatabase>;
let db: Db;
let mailer: Mailer;
let lines: string[];

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
});

afterEach(() => {
	stopWorker();
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const book = (start = '2027-01-12T17:00:00Z') => {
	const result = createBooking(
		{
			start,
			durationMin: 90,
			partySize: 3,
			name: 'Lena Muster',
			email: 'lena@example.ch',
			mobile: '+41791234567',
			locale: 'de',
			submitToken: randomId(),
			displayedNotice: COLD_1800
		},
		{ now: NOW, db }
	);
	if (!result.ok) throw new Error(result.code);
};

/** Yields to real immediates (not faked) until `done` holds, or gives up after a while. */
const until = async (done: () => boolean) => {
	for (let i = 0; i < 500 && !done(); i++) await new Promise((resolve) => setImmediate(resolve));
};

const states = () => (sqlite.prepare('select id, state from outbox order by id').all() as { id: number; state: string }[]);
const deps = () => ({ db, mailer, now: () => NOW, log: (line: string) => lines.push(line) });

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
		expect(lines).toEqual(['[worker] tick failed: SQLITE_ERROR']);
	});

	it('records the heartbeat with nothing to send', async () => {
		await tick(deps());
		expect(sqlite.prepare('select beat_at from worker_heartbeat').get()).toEqual({ beat_at: NOW });
		expect(lines).toEqual([]);
		expect(existsSync(join(dir, 'mail-sink'))).toBe(false);
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
			sqlite.prepare("update outbox set due_at = '2027-01-10T09:00:30Z'").run();
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
		sqlite.prepare("update outbox set state = 'in_flight', claimed_at = '2027-01-10T08:00:00Z'").run();
		expect(startWorker(deps())).toBe(true);
		await vi.waitFor(() => expect(states()[0].state).toBe('accepted'));
		expect(lines[0]).toBe('[worker] released 1 stale claims');
	});
});
