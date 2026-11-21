// Story 3.3: `toldNotice`, `keyboxStateOf`, `getDeletionImpact` and `deletedBookingDate` on an
// in-memory database. Tue 12 Jan 2027 (UTC+1), changeover 15, pre-heat 30–40: Anna 16:00–17:00,
// Tom Brunner 17:15–18:15, told hot.
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { keyboxStateOf, toldNotice } from './booking.ts';
import { deletedBookingDate, firstName, getDeletionImpact } from './impact.ts';

const HOT = '{"heat":"hot","earliest":null,"latest":null}';
const COLD = '{"heat":"cold","earliest":"2027-01-12T15:35:00Z","latest":"2027-01-12T15:45:00Z"}';
const NOW = '2027-01-12T09:00:00Z';

let sqlite: Database.Database;
let db: Db;
let n = 0;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => sqlite.close());

const insertBooking = (start: string, name: string | null, lastTold: string | null = null) =>
	Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, ?, ?)"
			)
			.run(start, `P${++n}`, `T${n}`, name, lastTold).lastInsertRowid
	);
const insertRow = (bookingId: number, kind: string, state: string, notice: string | null = null) =>
	sqlite
		.prepare('insert into outbox (booking_id, kind, state, due_at, claimed_at, snapshot_notice) values (?, ?, ?, ?, ?, ?)')
		.run(bookingId, kind, state, NOW, state === 'in_flight' ? NOW : null, notice);

describe('toldNotice', () => {
	it('is the last-told notice, or the snapshot of an in-flight heat-change email', () => {
		const tom = insertBooking('2027-01-12T16:15:00Z', 'Tom', HOT);
		expect(toldNotice(tom, db)).toEqual({ heat: 'hot', earliest: null, latest: null });
		insertRow(tom, 'heat_change', 'pending', COLD);
		expect(toldNotice(tom, db)?.heat).toBe('hot');
		insertRow(tom, 'heat_change', 'in_flight', COLD);
		expect(toldNotice(tom, db)?.heat).toBe('cold');
	});

	it('is null without a stored notice, with a broken one, or for an unknown booking', () => {
		expect(toldNotice(insertBooking('2027-01-12T16:15:00Z', 'Tom'), db)).toBeNull();
		expect(toldNotice(insertBooking('2027-01-13T16:15:00Z', 'Tom', '{"heat":"warm"}'), db)).toBeNull();
		expect(toldNotice(9999, db)).toBeNull();
	});
});

describe('keyboxStateOf', () => {
	it('is the keybox row state, or null without one', () => {
		const tom = insertBooking('2027-01-12T16:15:00Z', 'Tom');
		expect(keyboxStateOf(tom, db)).toBeNull();
		insertRow(tom, 'confirmation', 'accepted');
		insertRow(tom, 'keybox', 'transient_failure');
		expect(keyboxStateOf(tom, db)).toBe('transient_failure');
	});
});

describe('getDeletionImpact', () => {
	it('computes the impact on the booking behind, with its first name, through impactOn', () => {
		const anna = insertBooking('2027-01-12T15:00:00Z', 'Anna Meier');
		const tom = insertBooking('2027-01-12T16:15:00Z', '  Tom Brunner ', HOT);
		insertRow(tom, 'keybox', 'accepted');
		expect(getDeletionImpact(anna, NOW, db)).toEqual({
			bookingId: anna,
			start: '2027-01-12T15:00:00Z',
			durationMin: 60,
			date: '2027-01-12',
			started: false,
			impact: {
				affected: expect.objectContaining({ id: tom, start: '2027-01-12T16:15:00Z' }),
				told: { heat: 'hot', earliest: null, latest: null },
				current: { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' },
				class: 'urgent',
				consequence: 'call'
			},
			affectedFirstName: 'Tom'
		});
	});

	it('says started at the start, and is null for an unknown or deleted booking', () => {
		const anna = insertBooking('2027-01-12T15:00:00Z', 'Anna Meier');
		expect(getDeletionImpact(anna, '2027-01-12T15:00:00Z', db)?.started).toBe(true);
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ affected: null, consequence: 'none' });
		expect(getDeletionImpact(9999, NOW, db)).toBeNull();
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run(NOW, anna);
		expect(getDeletionImpact(anna, NOW, db)).toBeNull();
	});

	it('finds the affected booking early the next morning across midnight', () => {
		const late = insertBooking('2027-01-12T22:00:00Z', 'Late');
		const early = insertBooking('2027-01-12T23:15:00Z', 'Early', HOT);
		expect(getDeletionImpact(late, NOW, db)?.impact).toMatchObject({ affected: { id: early }, class: 'urgent', consequence: 'mail' });
	});
});

describe('deletedBookingDate and firstName', () => {
	it('gives the local date of a deleted booking only', () => {
		const anna = insertBooking('2027-01-12T23:30:00Z', 'Anna');
		expect(deletedBookingDate(anna, db)).toBeNull();
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run(NOW, anna);
		expect(deletedBookingDate(anna, db)).toBe('2027-01-13');
		expect(deletedBookingDate(9999, db)).toBeNull();
	});

	it('takes the first word, null when blank or erased', () => {
		expect(firstName('Anna Meier')).toBe('Anna');
		expect(firstName('   ')).toBeNull();
		expect(firstName(null)).toBeNull();
	});
});
