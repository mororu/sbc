// Story 2.3: the heat-change helper. Bookings are made through createBooking on a temp-file database
// (season 9 Jan – 30 Apr 2027, changeover 15, pre-heat 30–40); the Epic 3 triggers (a block, a
// deletion, a pre-heat change) are set up with plain SQL, then the helper runs in a transaction the
// test opens, as a command would. `now` is explicit everywhere.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Notice } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { randomId } from '../ids.ts';
import { createBooking, type CreateBookingInput } from './create-booking.ts';
import { enqueueHeatChanges } from './heat-change.ts';

const DAY = '2027-01-12';
/** Thu 7 Jan 11:00 in Zurich: well before every keybox cutoff on 12 January. */
const NOW = '2027-01-07T10:00:00Z';
const LATER = '2027-01-07T10:04:00Z';
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const COLD_1800: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-heat-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

/** Books and returns the booking id. */
const book = (over: Partial<CreateBookingInput> = {}, now = NOW): number => {
	const result = createBooking(
		{
			start: at('18:00'),
			durationMin: 90,
			partySize: 2,
			name: 'Lena',
			email: 'lena@example.ch',
			mobile: '+41791234567',
			locale: 'de',
			submitToken: randomId(),
			displayedNotice: COLD_1800,
			...over
		},
		{ now, db }
	);
	if (!result.ok) throw new Error(`booking failed: ${result.code}`);
	return (sqlite.prepare('select id from booking order by id desc limit 1').get() as { id: number }).id;
};

/** Runs the helper inside a BEGIN IMMEDIATE transaction, as a command does. */
const enqueue = (ids: number[], now = LATER) => db.$client.transaction(() => enqueueHeatChanges(ids, { now, db })).immediate();

const heatRows = (bookingId?: number) =>
	sqlite
		.prepare(`select * from outbox where kind = 'heat_change'${bookingId === undefined ? '' : ' and booking_id = ?'} order by id`)
		.all(...(bookingId === undefined ? [] : [bookingId])) as Record<string, unknown>[];
const setKeyboxState = (bookingId: number, state: string) =>
	sqlite
		.prepare("update outbox set state = ?, claimed_at = ? where kind = 'keybox' and booking_id = ?")
		.run(state, state === 'in_flight' ? NOW : null, bookingId);
const addBlock = (from: string, to: string) =>
	sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at(from), at(to));

describe('enqueueHeatChanges', () => {
	it('upserts one pending row, due after the settle delay, for a block that moves the earliest arrival later', () => {
		const id = book();
		addBlock('16:00', '17:25');
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'upserted' }]);
		expect(heatRows(id)).toEqual([
			expect.objectContaining({ state: 'pending', due_at: '2027-01-07T10:14:00Z', reason: null, snapshot_notice: null })
		]);
	});

	it('upserts urgent for a pre-heat change that moves the latest arrival earlier', () => {
		const id = book();
		sqlite.prepare('update setting set preheat_min_min = 40, preheat_max_min = 50 where id = 1').run();
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'upserted' }]);
		expect(heatRows(id)).toEqual([expect.objectContaining({ state: 'pending', snapshot_urgent: 1, attempts: 0 })]);
	});

	it('marks the row urgent or good news when it upserts, before any claim (Story 2.5 matrix: urgent at enqueue)', () => {
		const id = book();
		addBlock('16:00', '17:25');
		enqueue([id]);
		expect(heatRows(id)).toEqual([expect.objectContaining({ state: 'pending', snapshot_urgent: 1, claimed_at: null })]);
		// Good news on another day: cold → hot, from a booking right before.
		const day = '2027-01-13';
		book({ start: at('16:00', day), durationMin: 60 });
		const target = book({ start: at('18:30', day) });
		book({ start: at('17:15', day), durationMin: 60 });
		expect(heatRows(target)).toEqual([expect.objectContaining({ state: 'pending', snapshot_urgent: 0 })]);
	});

	it('updates the urgency when a repeat change turns an urgent change into good news', () => {
		const target = book();
		// 16:30–17:30 moves the earliest arrival of 18:00 later: urgent.
		const before = book({ start: at('16:30'), durationMin: 60 });
		const [urgent] = heatRows(target);
		expect(urgent).toMatchObject({ state: 'pending', snapshot_urgent: 1 });
		// Gone again, and 16:45–17:45 makes 18:00 hot: the same row, now good news.
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run(NOW, before);
		book({ start: at('16:45'), durationMin: 60 }, LATER);
		expect(heatRows(target)).toEqual([{ ...urgent, due_at: '2027-01-07T10:14:00Z', snapshot_urgent: 0 }]);
	});

	it('writes nothing when a booking was made and then deleted, and leaves an open row for the recheck', () => {
		const id = book();
		const before = book({ start: at('16:30'), durationMin: 60 });
		const [row] = heatRows(id);
		expect(row).toMatchObject({ state: 'pending', due_at: '2027-01-07T10:10:00Z' });
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run(NOW, before);
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'none' }]);
		// Not reset: the claim's recheck cancels it.
		expect(heatRows(id)).toEqual([row]);
	});

	it('writes nothing for a change that only widens the arrival range', () => {
		const id = book();
		sqlite.prepare('update setting set preheat_min_min = 25, preheat_max_min = 45 where id = 1').run();
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'none' }]);
		expect(heatRows()).toEqual([]);
	});

	it('writes nothing when nothing changed', () => {
		const id = book();
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'none' }]);
		expect(heatRows()).toEqual([]);
	});

	it.each(['pending', 'transient_failure'] as const)('debounces into the same %s row: pending again, due reset, reason cleared', (state) => {
		const id = book();
		addBlock('16:00', '17:25');
		enqueue([id]);
		const [first] = heatRows(id);
		sqlite.prepare("update outbox set state = ?, reason = ?, attempts = 1 where id = ?").run(state, state === 'pending' ? null : 'smtp 421', first.id);
		addBlock('16:00', '17:26');
		expect(enqueue([id], '2027-01-07T10:09:00Z')).toEqual([{ bookingId: id, action: 'upserted' }]);
		expect(heatRows(id)).toEqual([{ ...first, state: 'pending', due_at: '2027-01-07T10:19:00Z', reason: null, attempts: 1 }]);
	});

	it('inserts a new row once the earlier one has finished', () => {
		const id = book();
		addBlock('16:00', '17:25');
		enqueue([id]);
		sqlite.prepare("update outbox set state = 'accepted' where kind = 'heat_change'").run();
		enqueue([id]);
		expect(heatRows(id).map((r) => r.state)).toEqual(['accepted', 'pending']);
	});

	it.each(['in_flight', 'accepted', 'refused', 'expired'] as const)(
		'cancels the open rows and upserts none once the keybox row is %s',
		(state) => {
			const id = book();
			addBlock('16:00', '17:25');
			enqueue([id]);
			setKeyboxState(id, state);
			addBlock('16:00', '17:27');
			expect(enqueue([id], '2027-01-07T10:06:00Z')).toEqual([{ bookingId: id, action: 'cancelled' }]);
			expect(heatRows(id)).toEqual([expect.objectContaining({ state: 'cancelled', outcome_at: '2027-01-07T10:06:00Z' })]);
		}
	);

	it('skips unknown, deleted and started bookings, and handles a duplicate id once', () => {
		const id = book();
		addBlock('16:00', '17:25');
		expect(enqueue([9999])).toEqual([{ bookingId: 9999, action: 'skipped' }]);
		expect(enqueue([id, id])).toEqual([{ bookingId: id, action: 'upserted' }]);
		expect(enqueue([id], at('18:00'))).toEqual([{ bookingId: id, action: 'skipped' }]);
		sqlite.prepare('update booking set deleted_at = ?').run(NOW);
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'skipped' }]);
		expect(heatRows(id)).toHaveLength(1);
	});

	it('writes nothing for a booking without a last-told notice', () => {
		const id = book();
		addBlock('16:00', '17:25');
		sqlite.prepare('update booking set last_told_notice = null').run();
		expect(enqueue([id])).toEqual([{ bookingId: id, action: 'none' }]);
		expect(heatRows()).toEqual([]);
	});

	describe('with a heat-change row in flight', () => {
		/** Told 17:20–17:30 (latest 17:30); the in-flight email says 17:00–17:10 (pre-heat 50–60). */
		const inFlight = () => {
			const id = book();
			sqlite.prepare('update setting set preheat_min_min = 50, preheat_max_min = 60 where id = 1').run();
			enqueue([id]);
			const snapshot = JSON.stringify({ heat: 'cold', earliest: at('17:00'), latest: at('17:10') });
			sqlite
				.prepare("update outbox set state = 'in_flight', claimed_at = ?, snapshot_notice = ? where kind = 'heat_change'")
				.run(LATER, snapshot);
			return id;
		};

		it('compares against the in-flight snapshot: a change back to the last-told notice gets its own row', () => {
			const id = inFlight();
			sqlite.prepare('update setting set preheat_min_min = 30, preheat_max_min = 40 where id = 1').run();
			expect(enqueue([id], '2027-01-07T10:06:00Z')).toEqual([{ bookingId: id, action: 'upserted' }]);
			expect(heatRows(id).map((r) => [r.state, r.due_at])).toEqual([
				['in_flight', '2027-01-07T10:14:00Z'],
				['pending', '2027-01-07T10:16:00Z']
			]);
		});

		it('enqueues nothing when the current notice equals the in-flight snapshot', () => {
			const id = inFlight();
			expect(enqueue([id], '2027-01-07T10:06:00Z')).toEqual([{ bookingId: id, action: 'none' }]);
			expect(heatRows(id).map((r) => r.state)).toEqual(['in_flight']);
		});
	});

	it('enqueues nothing while the keybox row is retrying, and cancels the open row (Story 2.5 matrix: keybox retry)', () => {
		const id = book();
		addBlock('16:00', '17:25');
		enqueue([id]);
		setKeyboxState(id, 'transient_failure');
		addBlock('16:00', '17:26');
		expect(enqueue([id], '2027-01-07T10:09:00Z')).toEqual([{ bookingId: id, action: 'cancelled' }]);
		expect(heatRows(id)).toEqual([expect.objectContaining({ state: 'cancelled', outcome_at: '2027-01-07T10:09:00Z' })]);
	});

	it('never opens its own transaction', () => {
		const id = book();
		expect(() => enqueueHeatChanges([id], { now: LATER, db })).toThrow(/inside the caller/);
	});

	it('allows at most one open heat-change row per booking', () => {
		const id = book();
		const insert = (state: string) =>
			sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'heat_change', ?, ?)").run(id, state, NOW);
		insert('pending');
		expect(() => insert('pending')).toThrow(/UNIQUE/);
		expect(() => insert('transient_failure')).toThrow(/UNIQUE/);
		expect(() => insert('cancelled')).not.toThrow();
		expect(() => insert('accepted')).not.toThrow();
	});
});
