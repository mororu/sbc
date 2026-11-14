// Story 2.1, 2.2, 2.3 and 2.4 matrices, outbox command rows (AD-23). Bookings are made through createBooking
// on a temp-file database (season 9 Jan – 30 Apr 2027); `now` is explicit everywhere. Each booking
// also gets a keybox row; with the keybox settings empty (the migrated state) it is held, so the
// Story 2.1 tests see only the confirmation rows being claimed.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callList, KIND_ORDER, OUTBOX_STATE_LIST, sendProblems, type Notice } from '#lib/domain/index.ts';
import { addMinutes, toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { getHeldKeyboxRows, getSendData, getSendProblemRows } from '../db/queries/index.ts';
import { OUTBOX_KINDS, OUTBOX_STATES } from '../db/schema.ts';
import { randomId } from '../ids.ts';
import { createBooking, type CreateBookingInput } from './create-booking.ts';
import {
	cancelInFlightOfDeleted,
	claimDueRow,
	recordHeartbeat,
	recordSendOutcome,
	releaseHeldKeybox,
	releaseStaleClaims,
	SENDABLE_KINDS
} from './outbox.ts';
import { enqueueHeatChanges } from './heat-change.ts';

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
	return sqlite.prepare("select id from outbox where kind = 'confirmation' order by id desc limit 1").get() as {
		id: number;
	};
};

/** The keybox row of the booking whose confirmation row is `confirmationId`. */
const keyboxOf = (confirmationId: number) =>
	(
		sqlite
			.prepare("select id from outbox where kind = 'keybox' and booking_id = (select booking_id from outbox where id = ?)")
			.get(confirmationId) as { id: number }
	).id;

const setKeybox = (code: string | null, de: string | null = 'Box links.', en: string | null = 'Box on the left.') =>
	sqlite
		.prepare('update setting set keybox_code = ?, keybox_instructions_de = ?, keybox_instructions_en = ? where id = 1')
		.run(code, de, en);

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

	it('keeps the schema states and the domain states in step', () => {
		expect([...OUTBOX_STATES]).toEqual([...OUTBOX_STATE_LIST]);
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
				snapshotKeyboxCode: null,
				snapshotLocale: 'en',
				snapshotLastTold: null,
				snapshotUrgent: null
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

	it('sends every kind', () => {
		expect([...SENDABLE_KINDS]).toEqual([...KIND_ORDER]);
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
	it('allows only one confirmation row, one keybox row and one open heat-change row per booking', () => {
		const { id } = book();
		const bookingId = row(id).booking_id;
		const insert = (kind: string) =>
			sqlite
				.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, ?, 'pending', ?)")
				.run(bookingId, kind, NOW);
		expect(() => insert('confirmation')).toThrow(/UNIQUE/);
		expect(() => insert('keybox')).toThrow(/UNIQUE/);
		expect(() => insert('heat_change')).not.toThrow();
		// A second open heat-change row is not; a finished one is fine (Story 2.3).
		expect(() => insert('heat_change')).toThrow(/UNIQUE/);
		sqlite.prepare("update outbox set state = 'cancelled' where kind = 'heat_change'").run();
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
		expect(releaseStaleClaims({ now: NOW, db })).toEqual({ ok: true, code: 'released', released: 1, superseded: 0 });
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
			adminContact: 'platzhalter@sauna-luegisee.ch',
			keyboxInstructions: null
		});
		setKeybox('4711', '  Box links.  ', 'Box on the left.');
		// Only a keybox row reads the keybox settings.
		expect(getSendData(id, db)?.keyboxInstructions).toBeNull();
		const keybox = keyboxOf(id);
		expect(getSendData(keybox, db)?.keyboxInstructions).toBe('Box on the left.');
		sqlite.prepare("update booking set locale = 'de'").run();
		expect(getSendData(keybox, db)?.keyboxInstructions).toBe('Box links.');
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:30:00Z'").run();
		expect(getSendData(id, db)?.deletedAt).toBe('2027-01-12T08:30:00Z');
		sqlite.prepare("update setting set admin_contact = '  '").run();
		expect(getSendData(id, db)?.adminContact).toBeNull();
		expect(getSendData(9999, db)).toBeNull();
	});
});

describe('the keybox row (Story 2.2)', () => {
	/** Booked on Thu 7 Jan for Tue 12 Jan 18:00 (DE): the keybox row is due Mon 11 Jan 18:00. */
	const EARLY = '2027-01-07T10:00:00Z';
	const CUTOFF = '2027-01-11T17:00:00Z';
	const bookEarly = (over: Partial<CreateBookingInput> = {}) => keyboxOf(book({ locale: 'de', ...over }, EARLY).id);
	const bookingOf = (rowId: number) =>
		sqlite
			.prepare('select b.* from booking b join outbox o on o.booking_id = b.id where o.id = ?')
			.get(rowId) as Record<string, unknown>;
	const claimKeybox = (now: string) => {
		const result = claimDueRow({ now, db });
		if (!result.ok || result.row.kind !== 'keybox') throw new Error('no keybox row claimed');
		return result.row;
	};
	/** Marks the confirmations sent, so the next claim can only be a keybox row. */
	const drainConfirmations = () => sqlite.prepare("update outbox set state = 'accepted' where kind = 'confirmation'").run();

	beforeEach(() => setKeybox('4711'));

	it('is pending and due at the cutoff, and not claimed before it', () => {
		const id = bookEarly();
		drainConfirmations();
		expect(row(id)).toMatchObject({ state: 'pending', due_at: CUTOFF });
		expect(claimDueRow({ now: '2027-01-11T16:59:59Z', db })).toEqual({ ok: false, code: 'none' });
		expect(claimDueRow({ now: CUTOFF, db })).toMatchObject({ ok: true, row: { id, kind: 'keybox' } });
	});

	it('is claimed at the next tick after the cutoff passes, well within 15 minutes', () => {
		const id = bookEarly();
		drainConfirmations();
		// The worker ticks about every minute.
		expect(claimKeybox('2027-01-11T17:01:00Z').id).toBe(id);
	});

	it('freezes the current notice, the trimmed code and the locale at claim', () => {
		const id = bookEarly();
		drainConfirmations();
		// A block ending at 17:25 moves the earliest arrival: the notice now differs from the one at booking.
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values ('2027-01-12T15:00:00Z', '2027-01-12T16:25:00Z', 'cleaning')")
			.run();
		setKeybox('  4711 ');
		const current = '{"heat":"cold","earliest":"2027-01-12T16:25:00Z","latest":"2027-01-12T16:30:00Z"}';
		const claimed = claimKeybox(CUTOFF);
		expect(claimed).toEqual({
			id,
			bookingId: expect.any(Number),
			kind: 'keybox',
			claimedAt: CUTOFF,
			attempts: 1,
			snapshotNotice: current,
			snapshotKeyboxCode: '4711',
			snapshotLocale: 'de',
			snapshotLastTold: null,
			snapshotUrgent: null
		});
		expect(row(id)).toMatchObject({
			state: 'in_flight',
			snapshot_notice: current,
			snapshot_keybox_code: '4711',
			snapshot_locale: 'de'
		});
		// The notice at booking is untouched; the last-told notice moves only on an accepted send.
		expect(bookingOf(id)).toMatchObject({ notice_at_booking: COLD_1800_JSON, last_told_notice: COLD_1800_JSON });
	});

	it('sends the confirmation first when booked past the cutoff', () => {
		const confirmation = book({ locale: 'de' }, '2027-01-12T14:30:00Z').id;
		const keybox = keyboxOf(confirmation);
		expect(row(keybox).due_at).toBe('2027-01-12T14:30:00Z');
		const order: string[] = [];
		for (;;) {
			const result = claimDueRow({ now: '2027-01-12T14:31:00Z', db });
			if (!result.ok) break;
			order.push(`${result.row.id}:${result.row.kind}`);
			recordSendOutcome(result.row.id, 'accepted', null, { now: '2027-01-12T14:31:00Z', db });
		}
		expect(order).toEqual([`${confirmation}:confirmation`, `${keybox}:keybox`]);
	});

	it.each(['pending', 'transient_failure', 'in_flight'] as const)(
		'waits while the confirmation is %s, even when the confirmation is due later',
		(state) => {
			const confirmation = book({ locale: 'de' }, EARLY).id;
			const keybox = keyboxOf(confirmation);
			// The confirmation failed transiently and its retry is due after the cutoff.
			setRow(confirmation, {
				state,
				due_at: '2027-01-11T17:30:00Z',
				claimed_at: state === 'in_flight' ? '2027-01-11T16:59:00Z' : null
			});
			expect(claimDueRow({ now: CUTOFF, db })).toEqual({ ok: false, code: 'none' });
			expect(row(keybox).state).toBe('pending');
			if (state === 'in_flight') return;
			// The confirmation goes first once due, then the keybox row.
			expect(claimDueRow({ now: '2027-01-11T17:30:00Z', db })).toMatchObject({ ok: true, row: { id: confirmation } });
			expect(claimDueRow({ now: '2027-01-11T17:30:00Z', db })).toEqual({ ok: false, code: 'none' });
			recordSendOutcome(confirmation, 'accepted', null, { now: '2027-01-11T17:30:05Z', db });
			expect(claimDueRow({ now: '2027-01-11T17:31:00Z', db })).toMatchObject({ ok: true, row: { id: keybox } });
		}
	);

	it('does not wait for a confirmation that was refused, expired or cancelled', () => {
		const confirmation = book({ locale: 'de' }, EARLY).id;
		const keybox = keyboxOf(confirmation);
		for (const state of ['refused', 'cancelled', 'expired']) {
			setRow(keybox, { state: 'pending', attempts: 0 });
			setRow(confirmation, { state });
			expect(claimDueRow({ now: CUTOFF, db })).toMatchObject({ ok: true, row: { id: keybox } });
		}
	});

	it('returns a claimed keybox row to pending when its setting was unset before the send', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		expect(releaseHeldKeybox(id, { db })).toEqual({ ok: true, code: 'held' });
		expect(row(id)).toMatchObject({ state: 'pending', claimed_at: null, attempts: 1 });
		expect(releaseHeldKeybox(id, { db })).toEqual({ ok: false, code: 'not_in_flight' });
		// It goes out once the setting is back.
		expect(claimKeybox('2027-01-11T17:05:00Z')).toMatchObject({ id, attempts: 2 });
		const confirmation = book({ start: at('20:00') }, EARLY).id;
		claimDueRow({ now: '2027-01-11T17:05:00Z', db });
		expect(releaseHeldKeybox(confirmation, { db })).toEqual({ ok: false, code: 'not_in_flight' });
	});

	it.each([
		['the code is unset', null, 'Box links.', 'keybox_code'],
		['the code is blank', '   ', 'Box links.', 'keybox_code'],
		['the DE instructions are blank', '4711', ' ', 'keybox_instructions_de']
	] as const)('is held while %s, and later rows are still claimed', (_, code, de, missing) => {
		setKeybox(code, de);
		const held = bookEarly();
		const later = book({ start: at('20:00'), locale: 'de' }, EARLY).id;
		drainConfirmations();
		setRow(later, { state: 'pending', due_at: '2027-01-11T17:05:00Z' });
		expect(claimDueRow({ now: '2027-01-11T17:10:00Z', db })).toMatchObject({ ok: true, row: { id: later } });
		expect(row(held)).toMatchObject({ state: 'pending', attempts: 0, snapshot_keybox_code: null });
		// Due at 17:00, the 20:00 booking's keybox row is not due yet.
		expect(getHeldKeyboxRows('2027-01-11T17:10:00Z', db)).toEqual([{ id: held, missing }]);
	});

	it('holds only the rows whose locale lacks instructions', () => {
		setKeybox('4711', 'Box links.', null);
		const en = bookEarly({ locale: 'en' });
		const de = bookEarly({ start: at('20:00'), locale: 'de' });
		drainConfirmations();
		expect(claimDueRow({ now: '2027-01-11T19:30:00Z', db })).toMatchObject({ ok: true, row: { id: de } });
		expect(row(en).state).toBe('pending');
		expect(getHeldKeyboxRows('2027-01-11T19:30:00Z', db)).toEqual([{ id: en, missing: 'keybox_instructions_en' }]);
	});

	it('expires a held row at the start, and lists it as held no more', () => {
		setKeybox(null);
		const id = bookEarly();
		drainConfirmations();
		expect(getHeldKeyboxRows('2027-01-12T16:59:59Z', db)).toEqual([{ id, missing: 'keybox_code' }]);
		expect(getHeldKeyboxRows(at('18:00'), db)).toEqual([]);
		expect(claimDueRow({ now: at('18:00'), db })).toEqual({ ok: false, code: 'none' });
		expect(row(id)).toMatchObject({ state: 'expired', outcome_at: at('18:00') });
	});

	it('lists no held row that is not due, not open or of a deleted booking', () => {
		setKeybox(null);
		const notDue = bookEarly();
		expect(getHeldKeyboxRows('2027-01-11T16:59:59Z', db)).toEqual([]);
		setRow(notDue, { state: 'transient_failure' });
		expect(getHeldKeyboxRows(CUTOFF, db)).toEqual([{ id: notDue, missing: 'keybox_code' }]);
		setRow(notDue, { state: 'refused' });
		expect(getHeldKeyboxRows(CUTOFF, db)).toEqual([]);
		setRow(notDue, { state: 'pending' });
		sqlite.prepare("update booking set deleted_at = '2027-01-08T10:00:00Z'").run();
		expect(getHeldKeyboxRows(CUTOFF, db)).toEqual([]);
	});

	it('writes the last-told notice from the snapshot when accepted', () => {
		const id = bookEarly();
		drainConfirmations();
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values ('2027-01-12T15:00:00Z', '2027-01-12T16:25:00Z', 'cleaning')")
			.run();
		const claimed = claimKeybox(CUTOFF);
		// A change after the claim is not what was sent: the snapshot is written, never a recomputed notice.
		sqlite.prepare('delete from block').run();
		expect(recordSendOutcome(id, 'accepted', null, { now: '2027-01-11T17:00:05Z', db })).toEqual({
			ok: true,
			code: 'accepted'
		});
		expect(row(id)).toMatchObject({ state: 'accepted', outcome_at: '2027-01-11T17:00:05Z' });
		expect(bookingOf(id)).toMatchObject({
			last_told_notice: claimed.snapshotNotice,
			notice_at_booking: COLD_1800_JSON
		});
		expect(claimed.snapshotNotice).not.toBe(COLD_1800_JSON);
	});

	it.each(['refused', 'transient_failure'] as const)('leaves the last-told notice unchanged when %s', (outcome) => {
		const id = bookEarly();
		drainConfirmations();
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values ('2027-01-12T15:00:00Z', '2027-01-12T16:25:00Z', 'cleaning')")
			.run();
		claimKeybox(CUTOFF);
		expect(recordSendOutcome(id, outcome, 'smtp 550', { now: CUTOFF, db }).ok).toBe(true);
		expect(row(id).state).toBe(outcome);
		expect(bookingOf(id).last_told_notice).toBe(COLD_1800_JSON);
	});

	it('retries a transient failure and expires it at the start, leaving the last-told notice unchanged', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		recordSendOutcome(id, 'transient_failure', 'smtp 421', { now: CUTOFF, db });
		expect(row(id)).toMatchObject({ state: 'transient_failure', due_at: '2027-01-11T17:01:00Z' });
		expect(claimKeybox('2027-01-11T17:01:00Z')).toMatchObject({ id, attempts: 2 });
		recordSendOutcome(id, 'transient_failure', 'smtp 421', { now: '2027-01-11T17:01:00Z', db });
		claimDueRow({ now: at('18:00'), db });
		expect(row(id)).toMatchObject({ state: 'expired', outcome_at: at('18:00') });
		expect(bookingOf(id).last_told_notice).toBe(COLD_1800_JSON);
	});

	it('writes only the row for an accepted send of a booking deleted since the claim', () => {
		const id = bookEarly();
		drainConfirmations();
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values ('2027-01-12T15:00:00Z', '2027-01-12T16:25:00Z', 'cleaning')")
			.run();
		claimKeybox(CUTOFF);
		sqlite.prepare("update booking set deleted_at = '2027-01-11T17:00:02Z'").run();
		expect(recordSendOutcome(id, 'accepted', null, { now: '2027-01-11T17:00:05Z', db }).code).toBe('accepted');
		expect(row(id).state).toBe('accepted');
		expect(bookingOf(id).last_told_notice).toBe(COLD_1800_JSON);
	});

	it('is never resent when the code changes after an accepted send; the snapshot keeps the old code', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		recordSendOutcome(id, 'accepted', null, { now: CUTOFF, db });
		setKeybox('9999');
		expect(claimDueRow({ now: '2027-01-11T18:00:00Z', db })).toEqual({ ok: false, code: 'none' });
		expect(row(id)).toMatchObject({ state: 'accepted', snapshot_keybox_code: '4711' });
	});

	it('goes out late after downtime that ends before the start, and expires after it', () => {
		const late = bookEarly();
		const missed = bookEarly({ start: at('12:00') });
		drainConfirmations();
		// Back at 13:00 on the day: the 12:00 booking has started, the 18:00 one has not.
		const now = at('13:00');
		expect(claimKeybox(now).id).toBe(late);
		expect(row(missed)).toMatchObject({ state: 'expired', outcome_at: now });
	});

	it('expires a stale in_flight row released at boot after the start', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		// The process died mid-send; it is back after the start.
		const boot = at('18:30');
		expect(releaseStaleClaims({ now: boot, db })).toMatchObject({ released: 1, superseded: 0 });
		expect(row(id)).toMatchObject({ state: 'pending', claimed_at: null });
		expect(claimDueRow({ now: boot, db })).toEqual({ ok: false, code: 'none' });
		expect(row(id)).toMatchObject({ state: 'expired', outcome_at: boot });
	});

	it('never expires an in_flight keybox row directly', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		claimDueRow({ now: at('18:30'), db });
		expect(row(id).state).toBe('in_flight');
	});

	it('is cancelled, never sent, once the booking is deleted', () => {
		const pendingRow = bookEarly();
		const failed = bookEarly({ start: at('20:00') });
		drainConfirmations();
		setRow(failed, { state: 'transient_failure', due_at: '2027-01-11T19:00:00Z' });
		sqlite.prepare("update booking set deleted_at = '2027-01-10T10:00:00Z'").run();
		expect(claimDueRow({ now: '2027-01-11T19:30:00Z', db })).toEqual({ ok: false, code: 'none' });
		expect(row(pendingRow)).toMatchObject({ state: 'cancelled', outcome_at: '2027-01-11T19:30:00Z' });
		expect(row(failed).state).toBe('cancelled');
	});

	it('cancels an in_flight keybox row of a booking deleted after the claim', () => {
		const id = bookEarly();
		drainConfirmations();
		claimKeybox(CUTOFF);
		sqlite.prepare("update booking set deleted_at = '2027-01-11T17:00:01Z'").run();
		expect(cancelInFlightOfDeleted(id, { now: '2027-01-11T17:00:02Z', db })).toEqual({ ok: true, code: 'cancelled' });
		expect(bookingOf(id).last_told_notice).toBe(COLD_1800_JSON);
	});
});

describe('the heat-change row (Story 2.3)', () => {
	/** Booked on Thu 7 Jan for Sat 16 Jan: every keybox row is due on 15 January. */
	const EARLY = '2027-01-07T10:00:00Z';
	const SAT = '2027-01-16';
	/** The settle delay after EARLY. */
	const SETTLED = '2027-01-07T10:10:00Z';
	const told1800 = JSON.stringify({ heat: 'cold', earliest: at('17:20', SAT), latest: at('17:30', SAT) });
	const collapsed1800 = JSON.stringify({ heat: 'cold', earliest: at('17:45', SAT), latest: null });
	const drainConfirmations = () => sqlite.prepare("update outbox set state = 'accepted' where kind = 'confirmation'").run();
	const heatOf = (bookingId: number) =>
		(sqlite.prepare("select id from outbox where kind = 'heat_change' and booking_id = ? order by id desc").get(bookingId) as { id: number }).id;
	const bookingIdOf = (confirmationId: number) => row(confirmationId).booking_id as number;
	const lastToldOf = (bookingId: number) =>
		(sqlite.prepare('select last_told_notice as n from booking where id = ?').get(bookingId) as { n: string }).n;

	/** 18:00 told 17:20–17:30, then 16:30–17:30 is booked: the heat-change row of 18:00 (collapsed urgent). */
	const collapsedExample = (date = SAT) => {
		const target = bookingIdOf(book({ start: at('18:00', date), locale: 'de' }, EARLY).id);
		const before = bookingIdOf(book({ start: at('16:30', date), durationMin: 60 }, EARLY).id);
		return { target, before, heat: heatOf(target) };
	};

	it('is pending, not claimed before the settle delay, and claimed at the next tick after it, well within 15 minutes', () => {
		const { heat } = collapsedExample();
		drainConfirmations();
		expect(row(heat)).toMatchObject({ state: 'pending', due_at: SETTLED });
		expect(claimDueRow({ now: '2027-01-07T10:09:59Z', db })).toEqual({ ok: false, code: 'none' });
		expect(claimDueRow({ now: '2027-01-07T10:11:00Z', db })).toMatchObject({ ok: true, row: { id: heat, kind: 'heat_change' } });
	});

	it('freezes the current notice, the last-told notice, the locale and the urgent flag at claim', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		expect(claimDueRow({ now: SETTLED, db })).toEqual({
			ok: true,
			code: 'claimed',
			row: {
				id: heat,
				bookingId: target,
				kind: 'heat_change',
				claimedAt: SETTLED,
				attempts: 1,
				snapshotNotice: collapsed1800,
				snapshotKeyboxCode: null,
				snapshotLocale: 'de',
				snapshotLastTold: told1800,
				snapshotUrgent: true
			}
		});
		expect(row(heat)).toMatchObject({
			state: 'in_flight',
			claimed_at: SETTLED,
			snapshot_notice: collapsed1800,
			snapshot_last_told: told1800,
			snapshot_locale: 'de',
			snapshot_urgent: 1
		});
	});

	it('freezes urgent false for good news', () => {
		book({ start: at('16:00', SAT), durationMin: 60 }, EARLY);
		const target = bookingIdOf(book({ start: at('18:30', SAT) }, EARLY).id);
		book({ start: at('17:15', SAT), durationMin: 60 }, EARLY);
		drainConfirmations();
		expect(claimDueRow({ now: SETTLED, db })).toMatchObject({
			ok: true,
			row: { id: heatOf(target), snapshotNotice: '{"heat":"hot","earliest":null,"latest":null}', snapshotUrgent: false }
		});
	});

	it.each(['pending', 'transient_failure', 'in_flight'] as const)('waits while the confirmation is %s', (state) => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		const confirmation = (
			sqlite.prepare("select id from outbox where kind = 'confirmation' and booking_id = ?").get(target) as { id: number }
		).id;
		setRow(confirmation, { state, due_at: '2027-01-07T10:30:00Z', claimed_at: state === 'in_flight' ? SETTLED : null });
		expect(claimDueRow({ now: SETTLED, db })).toEqual({ ok: false, code: 'none' });
		expect(row(heat).state).toBe('pending');
	});

	it('is cancelled at claim when the recheck finds nothing worth an email, and the next due row is claimed', () => {
		const { before, heat } = collapsedExample();
		// The booking before is gone again: the current notice equals the last-told one.
		sqlite.prepare("update booking set deleted_at = '2027-01-07T10:05:00Z' where id = ?").run(before);
		drainConfirmations();
		const other = book({ start: at('12:00', SAT) }, EARLY).id;
		setRow(other, { due_at: '2027-01-07T10:10:30Z' });
		const now = '2027-01-07T10:11:00Z';
		expect(claimDueRow({ now, db })).toMatchObject({ ok: true, row: { id: other, kind: 'confirmation' } });
		expect(row(heat)).toMatchObject({ state: 'cancelled', outcome_at: now });
	});

	it('is cancelled at claim for a change that only widens the range against the last-told notice', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		// Told 17:20–17:30; now 17:15–17:30.
		sqlite.prepare("update booking set deleted_at = '2027-01-07T10:05:00Z' where start_at = ?").run(at('16:30', SAT));
		sqlite.prepare('update setting set preheat_max_min = 45 where id = 1').run();
		expect(claimDueRow({ now: SETTLED, db })).toEqual({ ok: false, code: 'none' });
		expect(row(heat).state).toBe('cancelled');
		expect(lastToldOf(target)).toBe(told1800);
	});

	it('is cancelled at claim without a last-told notice', () => {
		const { heat } = collapsedExample();
		drainConfirmations();
		sqlite.prepare('update booking set last_told_notice = null').run();
		expect(claimDueRow({ now: SETTLED, db })).toEqual({ ok: false, code: 'none' });
		expect(row(heat).state).toBe('cancelled');
	});

	it('writes the last-told notice from the snapshot when accepted', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		// A change after the claim is not what was sent.
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:30', SAT), at('17:50', SAT));
		expect(recordSendOutcome(heat, 'accepted', null, { now: SETTLED, db })).toEqual({ ok: true, code: 'accepted' });
		expect(lastToldOf(target)).toBe(collapsed1800);
	});

	it.each(['refused', 'transient_failure'] as const)('leaves the last-told notice unchanged when %s', (outcome) => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		expect(recordSendOutcome(heat, outcome, 'smtp 550', { now: SETTLED, db }).ok).toBe(true);
		expect(row(heat).state).toBe(outcome);
		expect(lastToldOf(target)).toBe(told1800);
	});

	it('retries a transient failure with the backoff and expires it at the start', () => {
		const { heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		recordSendOutcome(heat, 'transient_failure', 'smtp 421', { now: SETTLED, db });
		expect(row(heat)).toMatchObject({ state: 'transient_failure', due_at: '2027-01-07T10:11:00Z' });
		expect(claimDueRow({ now: '2027-01-07T10:11:00Z', db })).toMatchObject({ ok: true, row: { id: heat, attempts: 2 } });
		recordSendOutcome(heat, 'transient_failure', 'smtp 421', { now: '2027-01-07T10:11:00Z', db });
		claimDueRow({ now: at('18:00', SAT), db });
		expect(row(heat)).toMatchObject({ state: 'expired', outcome_at: at('18:00', SAT) });
	});

	it('returns a stale in_flight row to pending, and never expires an in_flight row directly', () => {
		const { heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		claimDueRow({ now: at('18:30', SAT), db });
		expect(row(heat).state).toBe('in_flight');
		expect(releaseStaleClaims({ now: '2027-01-07T10:20:00Z', db })).toMatchObject({ released: 1, superseded: 0 });
		expect(row(heat)).toMatchObject({ state: 'pending', claimed_at: null });
	});

	it('is cancelled once the booking is deleted, and an accepted send of a deleted booking writes only the row', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		sqlite.prepare("update booking set deleted_at = '2027-01-07T10:10:01Z' where id = ?").run(target);
		expect(recordSendOutcome(heat, 'accepted', null, { now: '2027-01-07T10:10:02Z', db }).code).toBe('accepted');
		expect(lastToldOf(target)).toBe(told1800);

		const second = collapsedExample('2027-01-17');
		sqlite.prepare("update booking set deleted_at = '2027-01-07T10:05:00Z' where id = ?").run(second.target);
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		expect(row(second.heat)).toMatchObject({ state: 'cancelled', outcome_at: SETTLED });
	});

	it.each(['in_flight', 'accepted', 'refused', 'expired'] as const)('is cancelled by the sweep once the keybox row is %s', (state) => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		sqlite
			.prepare("update outbox set state = ?, claimed_at = ? where kind = 'keybox' and booking_id = ?")
			.run(state, state === 'in_flight' ? SETTLED : null, target);
		expect(claimDueRow({ now: SETTLED, db })).toEqual({ ok: false, code: 'none' });
		expect(row(heat)).toMatchObject({ state: 'cancelled', outcome_at: SETTLED });
	});

	it('gets a new open row for a change while it is in flight; a transient failure or stale claim then gives way to it', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		// A block during the send moves the earliest arrival again: the helper inserts a new open row.
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:30', SAT), at('17:50', SAT));
		db.$client.transaction(() => enqueueHeatChanges([target], { now: SETTLED, db })).immediate();
		const newer = heatOf(target);
		expect(newer).not.toBe(heat);
		expect(recordSendOutcome(heat, 'transient_failure', 'smtp 421', { now: SETTLED, db })).toEqual({ ok: true, code: 'superseded' });
		expect(row(heat)).toMatchObject({ state: 'cancelled', reason: 'smtp 421' });
		expect(row(newer).state).toBe('pending');

		// The newer row is claimed, goes stale, and a third change arrives meanwhile.
		expect(claimDueRow({ now: '2027-01-07T10:20:00Z', db })).toMatchObject({ ok: true, row: { id: newer } });
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:30', SAT), at('17:52', SAT));
		db.$client.transaction(() => enqueueHeatChanges([target], { now: '2027-01-07T10:21:00Z', db })).immediate();
		const third = heatOf(target);
		expect(releaseStaleClaims({ now: '2027-01-07T10:30:00Z', db })).toMatchObject({ released: 0, superseded: 1 });
		expect(row(newer)).toMatchObject({ state: 'cancelled', outcome_at: '2027-01-07T10:30:00Z' });
		expect(row(third).state).toBe('pending');
	});

	it('releases only the newest of two stale in-flight rows of a booking and supersedes the older one', () => {
		const { target, heat } = collapsedExample();
		drainConfirmations();
		claimDueRow({ now: SETTLED, db });
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:30', SAT), at('17:50', SAT));
		db.$client.transaction(() => enqueueHeatChanges([target], { now: SETTLED, db })).immediate();
		const newer = heatOf(target);
		expect(claimDueRow({ now: '2027-01-07T10:20:00Z', db })).toMatchObject({ ok: true, row: { id: newer } });
		// Both are in flight and both go stale.
		expect(releaseStaleClaims({ now: '2027-01-07T10:40:00Z', db })).toEqual({
			ok: true,
			code: 'released',
			released: 1,
			superseded: 1
		});
		expect(row(newer)).toMatchObject({ state: 'pending', claimed_at: null });
		expect(row(heat)).toMatchObject({ state: 'cancelled', outcome_at: '2027-01-07T10:40:00Z' });
	});

	it('cancels a row whose notice cannot be compared with reason invalid_notice, and claims the next one', () => {
		const { heat } = collapsedExample();
		const second = collapsedExample('2027-01-17');
		drainConfirmations();
		// A cold notice without an earliest arrival: not a valid notice.
		sqlite.prepare("update booking set last_told_notice = '{\"heat\":\"cold\",\"earliest\":null,\"latest\":null}' where start_at = ?").run(at('18:00', SAT));
		expect(claimDueRow({ now: SETTLED, db })).toMatchObject({ ok: true, row: { id: second.heat, kind: 'heat_change' } });
		expect(row(heat)).toMatchObject({ state: 'cancelled', reason: 'invalid_notice', outcome_at: SETTLED });
	});

	it('is cancelled in the same transaction as the keybox claim', () => {
		setKeybox('4711');
		const { target, before, heat } = collapsedExample();
		drainConfirmations();
		sqlite.prepare("update outbox set state = 'accepted' where kind = 'keybox' and booking_id = ?").run(before);
		// The keybox row falls due first, at the cutoff; the heat-change row was retried to the same time.
		const cutoff = '2027-01-15T17:00:00Z';
		setRow(heat, { due_at: cutoff });
		const result = claimDueRow({ now: cutoff, db });
		expect(result).toMatchObject({ ok: true, row: { bookingId: target, kind: 'keybox' } });
		expect(row(heat)).toMatchObject({ state: 'cancelled', outcome_at: cutoff });
		expect(claimDueRow({ now: cutoff, db })).toEqual({ ok: false, code: 'none' });
	});
});

describe('refused and stuck sends (Story 2.4)', () => {
	const rowCount = () => (sqlite.prepare('select count(*) as n from outbox').get() as { n: number }).n;
	/** Books like `book` and returns the booking id. */
	const bookingId = (over: Partial<CreateBookingInput> = {}, now = NOW) => row(book(over, now).id).booking_id as number;
	const rowOf = (id: number, kind: string) =>
		(sqlite.prepare('select id from outbox where booking_id = ? and kind = ?').get(id, kind) as { id: number }).id;
	const problemsOf = (id: number, now: string) => {
		const entry = getSendProblemRows(now, db).get(id);
		if (!entry) throw new Error(`booking ${id} not in the feed`);
		return sendProblems(entry, now);
	};

	it('stores a refused outcome for a booking deleted while in flight, without telling it or adding rows', () => {
		const { id } = book();
		claimDueRow({ now: NOW, db });
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:00:02Z'").run();
		const before = lastTold();
		const rows = rowCount();
		expect(recordSendOutcome(id, 'refused', 'smtp 550', { now: '2027-01-12T08:00:05Z', db })).toEqual({
			ok: true,
			code: 'refused'
		});
		expect(row(id)).toMatchObject({ state: 'refused', reason: 'smtp 550', outcome_at: '2027-01-12T08:00:05Z' });
		expect(lastTold()).toBe(before);
		expect(rowCount()).toBe(rows);
	});

	it('keeps resolved_at through an outcome', () => {
		const { id } = book();
		claimDueRow({ now: NOW, db });
		setRow(id, { resolved_at: '2027-01-12T08:00:01Z' });
		recordSendOutcome(id, 'refused', 'smtp 550', { now: '2027-01-12T08:00:05Z', db });
		expect(row(id)).toMatchObject({ state: 'refused', resolved_at: '2027-01-12T08:00:01Z' });
	});

	it('starts every row unresolved', () => {
		const { id } = book();
		expect(row(id).resolved_at).toBeNull();
		expect(row(keyboxOf(id)).resolved_at).toBeNull();
	});

	describe('a keybox row booked early (due at the cutoff, Mon 11 Jan 17:00Z)', () => {
		const EARLY = '2027-01-07T10:00:00Z';
		const CUTOFF = '2027-01-11T17:00:00Z';
		const plus = (minutes: number) => addMinutes(CUTOFF, minutes);

		it('is overdue 15 minutes after the cutoff although transient failures pushed its due_at past that', () => {
			setKeybox('4711');
			const id = bookingId({ locale: 'de' }, EARLY);
			const keybox = rowOf(id, 'keybox');
			sqlite.prepare("update outbox set state = 'accepted' where kind = 'confirmation'").run();
			// Backoff 1, 2, 5, 10 minutes: due 17:01, 17:03, 17:08, then 17:18.
			for (const minute of [0, 1, 3, 8]) {
				expect(claimDueRow({ now: plus(minute), db })).toMatchObject({ ok: true, row: { id: keybox } });
				recordSendOutcome(keybox, 'transient_failure', 'smtp 421', { now: plus(minute), db });
			}
			expect(row(keybox)).toMatchObject({ state: 'transient_failure', due_at: plus(18), attempts: 4 });
			expect(problemsOf(id, plus(14)).callRequired).toEqual([]);
			expect(problemsOf(id, plus(15)).callRequired).toEqual([{ rowId: keybox, reason: 'keybox_overdue' }]);
		});

		it('is overdue 15 minutes after the cutoff while held for a missing setting: the admin must call', () => {
			// The keybox settings are empty (the migrated state): the row is held, still pending.
			const id = bookingId({ locale: 'de' }, EARLY);
			const keybox = rowOf(id, 'keybox');
			expect(getHeldKeyboxRows(plus(15), db)).toEqual([{ id: keybox, missing: 'keybox_code' }]);
			expect(row(keybox).state).toBe('pending');
			expect(problemsOf(id, plus(14)).callRequired).toEqual([]);
			expect(problemsOf(id, plus(15)).callRequired).toEqual([{ rowId: keybox, reason: 'keybox_overdue' }]);
		});
	});

	it('feeds the call list only from live bookings that have not started, with no contact data or code', () => {
		setKeybox('4711', 'Box links.', 'Box on the left.');
		// The live 18:00 booking: its confirmation is refused, its keybox row is in flight with the code frozen.
		const live = bookingId({ start: at('18:00') });
		const liveConfirmation = rowOf(live, 'confirmation');
		const liveKeybox = rowOf(live, 'keybox');
		expect(claimDueRow({ now: NOW, db })).toMatchObject({ ok: true, row: { id: liveConfirmation } });
		recordSendOutcome(liveConfirmation, 'refused', 'smtp 550', { now: NOW, db });
		expect(claimDueRow({ now: NOW, db })).toMatchObject({ ok: true, row: { id: liveKeybox, snapshotKeyboxCode: '4711' } });

		const started = bookingId({ start: at('10:00') });
		setRow(rowOf(started, 'confirmation'), { state: 'refused', reason: 'smtp 550' });
		const deleted = bookingId({ start: at('20:00') });
		setRow(rowOf(deleted, 'confirmation'), { state: 'refused', reason: 'smtp 550' });
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run(NOW, deleted);
		// Starts one second after `now`: still in the feed.
		const edge = bookingId({ start: at('12:00') });
		const now = '2027-01-12T10:59:59Z';

		const feed = getSendProblemRows(now, db);
		expect([...feed.keys()].sort((a, b) => a - b)).toEqual([live, edge].sort((a, b) => a - b));
		expect(feed.get(live)).toEqual({
			start: at('18:00'),
			createdAt: NOW,
			rows: [
				{ id: liveConfirmation, kind: 'confirmation', state: 'refused', urgent: null, resolvedAt: null },
				{ id: liveKeybox, kind: 'keybox', state: 'in_flight', urgent: null, resolvedAt: null }
			]
		});
		const serialized = JSON.stringify([...feed.entries()]);
		for (const secret of ['4711', 'Lena', 'lena@example.ch', '+41791234567', 'Box']) expect(serialized).not.toContain(secret);

		// Both were booked past their cutoff at 09:00: their keybox rows are overdue since 09:15.
		expect(callList(feed, now)).toEqual([
			{
				bookingId: edge,
				start: at('12:00'),
				callRequired: [{ rowId: rowOf(edge, 'keybox'), reason: 'keybox_overdue' }],
				refusals: []
			},
			{
				bookingId: live,
				start: at('18:00'),
				callRequired: [{ rowId: liveKeybox, reason: 'keybox_overdue' }],
				refusals: [{ rowId: liveConfirmation, kind: 'confirmation' }]
			}
		]);
	});
});
