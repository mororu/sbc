// Story 2.1 matrix, outbox command rows (AD-23). Bookings are made through createBooking on a
// temp-file database (season 9 Jan – 30 Apr 2027); `now` is explicit everywhere.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KIND_ORDER, type Notice } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { getSendData } from '../db/queries/index.ts';
import { OUTBOX_KINDS } from '../db/schema.ts';
import { randomId } from '../ids.ts';
import { createBooking, type CreateBookingInput } from './create-booking.ts';
import {
	cancelInFlightOfDeleted,
	claimDueRow,
	recordHeartbeat,
	recordSendOutcome,
	releaseStaleClaims
} from './outbox.ts';

const DAY = '2027-01-12';
/** 09:00 in Zurich. */
const NOW = '2027-01-12T08:00:00Z';
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-outbox-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const COLD_1800: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };
const COLD_1800_JSON = '{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}';

const book = (over: Partial<CreateBookingInput> = {}, now = NOW) => {
	const result = createBooking(
		{
			start: at('18:00'),
			durationMin: 90,
			partySize: 3,
			name: 'Lena',
			email: 'lena@example.ch',
			mobile: '+41791234567',
			locale: 'en',
			submitToken: randomId(),
			displayedNotice: COLD_1800,
			...over
		},
		{ now, db }
	);
	if (!result.ok) throw new Error(`booking failed: ${result.code}`);
	return sqlite.prepare('select id from outbox order by id desc limit 1').get() as { id: number };
};

const row = (id: number) => sqlite.prepare('select * from outbox where id = ?').get(id) as Record<string, unknown>;
const setRow = (id: number, values: Record<string, unknown>) => {
	const cols = Object.keys(values);
	sqlite
		.prepare(`update outbox set ${cols.map((c) => `${c} = @${c}`).join(', ')} where id = @id`)
		.run({ ...values, id });
};
const lastTold = () => (sqlite.prepare('select last_told_notice as n from booking').get() as { n: string }).n;

describe('shared constants', () => {
	it('keeps the schema kinds and the drain order in step', () => {
		expect([...OUTBOX_KINDS]).toEqual([...KIND_ORDER]);
	});
});

describe('claimDueRow', () => {
	it('claims a due pending row and freezes the snapshot', () => {
		const { id } = book();
		const claimedAt = '2027-01-12T08:00:30Z';
		const result = claimDueRow({ now: claimedAt, db });
		expect(result).toEqual({
			ok: true,
			code: 'claimed',
			row: {
				id,
				bookingId: expect.any(Number),
				kind: 'confirmation',
				claimedAt,
				attempts: 1,
				snapshotNotice: COLD_1800_JSON,
				snapshotLocale: 'en'
			}
		});
		expect(row(id)).toMatchObject({
			state: 'in_flight',
			claimed_at: claimedAt,
			attempts: 1,
			snapshot_notice: COLD_1800_JSON,
			snapshot_locale: 'en'
		});
	});

	it('claims a due transient_failure row again', () => {
		const { id } = book();
		setRow(id, { state: 'transient_failure', attempts: 2, due_at: '2027-01-12T08:05:00Z' });
		expect(claimDueRow({ now: '2027-01-12T08:04:59Z', db })).toEqual({ ok: false, code: 'none' });
		const result = claimDueRow({ now: '2027-01-12T08:05:00Z', db });
		expect(result).toMatchObject({ ok: true, row: { id, attempts: 3 } });
		expect(row(id)).toMatchObject({ state: 'in_flight', attempts: 3 });
	});

	it('returns none when nothing is due, and never claims an in_flight or finished row', () => {
		expect(claimDueRow({ now: NOW, db })).toEqual({ ok: false, code: 'none' });
		const { id } = book();
		expect(claimDueRow({ now: NOW, db }).ok).toBe(true);
		expect(claimDueRow({ now: NOW, db })).toEqual({ ok: false, code: 'none' });
		for (const state of ['accepted', 'refused', 'expired', 'cancelled']) {
			setRow(id, { state });
			expect(claimDueRow({ now: NOW, db })).toEqual({ ok: false, code: 'none' });
		}
	});

	it('does not claim a kind that is not sendable yet', () => {
		const { id } = book();
		setRow(id, { kind: 'keybox' });
		expect(claimDueRow({ now: NOW, db })).toEqual({ ok: false, code: 'none' });
		expect(row(id).state).toBe('pending');
	});

	it('claims by due time, then kind, then id', () => {
		const a = book({ start: at('12:00') });
		const b = book({ start: at('15:00') });
		const c = book({ start: at('18:00') });
		setRow(a.id, { due_at: '2027-01-12T08:00:10Z' });
		const order: number[] = [];
		for (;;) {
			const result = claimDueRow({ now: '2027-01-12T08:01:00Z', db });
			if (!result.ok) break;
			order.push(result.row.id);
		}
		expect(order).toEqual([b.id, c.id, a.id]);
	});

	it('cancels a due open row of a deleted booking and does not send it', () => {
		const { id } = book();
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:10:00Z'").run();
		expect(claimDueRow({ now: '2027-01-12T08:11:00Z', db })).toEqual({ ok: false, code: 'none' });
		expect(row(id)).toMatchObject({ state: 'cancelled', outcome_at: '2027-01-12T08:11:00Z' });

		const other = book({ start: at('20:00') });
		setRow(other.id, { state: 'transient_failure' });
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:10:00Z'").run();
		claimDueRow({ now: '2027-01-12T08:12:00Z', db });
		expect(row(other.id).state).toBe('cancelled');
	});

	it('expires pending and transient_failure rows once the start has come, in the claim transaction', () => {
		const a = book({ start: at('12:00') });
		const b = book({ start: at('15:00') });
		setRow(b.id, { state: 'transient_failure' });
		expect(claimDueRow({ now: at('15:00'), db })).toEqual({ ok: false, code: 'none' });
		expect(row(a.id)).toMatchObject({ state: 'expired', outcome_at: at('15:00') });
		expect(row(b.id)).toMatchObject({ state: 'expired', outcome_at: at('15:00') });
	});

	it('records a deleted booking whose start has come as cancelled, not expired', () => {
		const { id } = book({ start: at('12:00') });
		sqlite.prepare("update booking set deleted_at = '2027-01-12T10:00:00Z'").run();
		claimDueRow({ now: at('13:00'), db });
		expect(row(id).state).toBe('cancelled');
	});

	it('never expires an in_flight row', () => {
		const { id } = book({ start: at('12:00') });
		expect(claimDueRow({ now: NOW, db }).ok).toBe(true);
		claimDueRow({ now: at('13:00'), db });
		expect(row(id).state).toBe('in_flight');
	});

	it('drains every row that fell due during downtime', () => {
		const ids = ['11:00', '13:00', '15:00', '17:00', '19:30'].map((t) => book({ start: at(t) }).id);
		let claimed = 0;
		while (claimDueRow({ now: '2027-01-12T09:30:00Z', db }).ok) claimed++;
		expect(claimed).toBe(ids.length);
		expect(ids.map((id) => row(id).state)).toEqual(ids.map(() => 'in_flight'));
	});
});

describe('recordSendOutcome', () => {
	const claimed = () => {
		const { id } = book();
		claimDueRow({ now: NOW, db });
		return id;
	};

	it('records accepted with its outcome time and leaves last_told_notice unchanged', () => {
		const id = claimed();
		const before = lastTold();
		expect(recordSendOutcome(id, 'accepted', null, { now: '2027-01-12T08:00:05Z', db })).toEqual({
			ok: true,
			code: 'accepted'
		});
		expect(row(id)).toMatchObject({ state: 'accepted', outcome_at: '2027-01-12T08:00:05Z', reason: null });
		expect(lastTold()).toBe(before);
	});

	it('records refused with the SMTP code as reason', () => {
		const id = claimed();
		const before = lastTold();
		expect(recordSendOutcome(id, 'refused', 'smtp 550', { now: NOW, db })).toEqual({ ok: true, code: 'refused' });
		expect(row(id)).toMatchObject({ state: 'refused', reason: 'smtp 550', outcome_at: NOW });
		expect(lastTold()).toBe(before);
	});

	it('records a transient failure and moves the due time to the backoff', () => {
		const id = claimed();
		expect(recordSendOutcome(id, 'transient_failure', 'smtp 421', { now: NOW, db })).toEqual({
			ok: true,
			code: 'transient_failure',
			dueAt: '2027-01-12T08:01:00Z'
		});
		expect(row(id)).toMatchObject({
			state: 'transient_failure',
			reason: 'smtp 421',
			due_at: '2027-01-12T08:01:00Z',
			attempts: 1
		});
		// Second attempt fails too: 2 minutes.
		claimDueRow({ now: '2027-01-12T08:01:00Z', db });
		recordSendOutcome(id, 'transient_failure', 'ECONNECTION', { now: '2027-01-12T08:01:00Z', db });
		expect(row(id)).toMatchObject({ due_at: '2027-01-12T08:03:00Z', attempts: 2, reason: 'ECONNECTION' });
	});

	it('writes nothing for a row that is not in_flight', () => {
		const { id } = book();
		const before = row(id);
		expect(recordSendOutcome(id, 'accepted', null, { now: NOW, db })).toEqual({ ok: false, code: 'not_in_flight' });
		expect(row(id)).toEqual(before);
		claimDueRow({ now: NOW, db });
		recordSendOutcome(id, 'accepted', null, { now: NOW, db });
		const done = row(id);
		expect(recordSendOutcome(id, 'refused', 'smtp 550', { now: NOW, db })).toEqual({
			ok: false,
			code: 'not_in_flight'
		});
		expect(row(id)).toEqual(done);
		expect(recordSendOutcome(9999, 'accepted', null, { now: NOW, db })).toEqual({ ok: false, code: 'not_in_flight' });
	});
});

describe('cancelInFlightOfDeleted', () => {
	it('cancels an in_flight row whose booking was deleted after the claim', () => {
		const { id } = book();
		claimDueRow({ now: NOW, db });
		expect(cancelInFlightOfDeleted(id, { now: NOW, db })).toEqual({ ok: false, code: 'not_deleted' });
		expect(row(id).state).toBe('in_flight');
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:01:00Z'").run();
		expect(cancelInFlightOfDeleted(id, { now: '2027-01-12T08:02:00Z', db })).toEqual({ ok: true, code: 'cancelled' });
		expect(row(id)).toMatchObject({ state: 'cancelled', outcome_at: '2027-01-12T08:02:00Z' });
		expect(cancelInFlightOfDeleted(id, { now: NOW, db })).toEqual({ ok: false, code: 'not_in_flight' });
	});
});

describe('the outbox schema', () => {
	it('allows only one confirmation row per booking', () => {
		const { id } = book();
		const bookingId = row(id).booking_id;
		const insert = (kind: string) =>
			sqlite
				.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, ?, 'pending', ?)")
				.run(bookingId, kind, NOW);
		expect(() => insert('confirmation')).toThrow(/UNIQUE/);
		expect(() => insert('keybox')).not.toThrow();
		expect(() => insert('heat_change')).not.toThrow();
	});

	it('accepts only the app locales as snapshot locale', () => {
		const { id } = book();
		expect(() => setRow(id, { snapshot_locale: 'fr' })).toThrow(/CHECK/);
		expect(() => setRow(id, { snapshot_locale: 'de' })).not.toThrow();
	});
});

describe('releaseStaleClaims', () => {
	it('returns stale in_flight rows to pending and leaves fresh claims alone', () => {
		const stale = book({ start: at('12:00') });
		const fresh = book({ start: at('15:00') });
		const done = book({ start: at('18:00') });
		setRow(stale.id, { state: 'in_flight', claimed_at: '2027-01-12T07:50:00Z' });
		setRow(fresh.id, { state: 'in_flight', claimed_at: '2027-01-12T07:55:00Z' });
		setRow(done.id, { state: 'accepted', claimed_at: '2027-01-12T07:00:00Z' });
		expect(releaseStaleClaims({ now: NOW, db })).toEqual({ ok: true, code: 'released', count: 1 });
		expect(row(stale.id)).toMatchObject({ state: 'pending', claimed_at: null });
		expect(row(fresh.id)).toMatchObject({ state: 'in_flight' });
		expect(row(done.id)).toMatchObject({ state: 'accepted' });
		// Released, it is claimed again on the next tick.
		expect(claimDueRow({ now: NOW, db })).toMatchObject({ ok: true, row: { id: stale.id } });
	});
});

describe('recordHeartbeat', () => {
	it('keeps one row with the latest beat', () => {
		expect(recordHeartbeat({ now: NOW, db })).toEqual({ ok: true, code: 'recorded' });
		recordHeartbeat({ now: '2027-01-12T08:01:00Z', db });
		expect(sqlite.prepare('select * from worker_heartbeat').all()).toEqual([
			{ id: 1, beat_at: '2027-01-12T08:01:00Z' }
		]);
	});
});

describe('getSendData', () => {
	it('reads the address, the booking facts and the admin contact at send time', () => {
		const { id } = book();
		expect(getSendData(id, db)).toEqual({
			email: 'lena@example.ch',
			start: at('18:00'),
			durationMin: 90,
			partySize: 3,
			createdAt: NOW,
			deletedAt: null,
			adminContact: 'platzhalter@sauna-luegisee.ch'
		});
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:30:00Z'").run();
		expect(getSendData(id, db)?.deletedAt).toBe('2027-01-12T08:30:00Z');
		sqlite.prepare("update setting set admin_contact = '  '").run();
		expect(getSendData(id, db)?.adminContact).toBeNull();
		expect(getSendData(9999, db)).toBeNull();
	});
});
