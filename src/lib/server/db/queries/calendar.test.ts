import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { getDayItems, getSeasons, getSettings } from './calendar.ts';

let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
});

const insertBooking = (start: string, duration: number, deletedAt: string | null = null) =>
	sqlite
		.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, deleted_at, party_size, locale, public_id, submit_token) values (?, ?, 15, '2027-01-05T08:00:00Z', 1, ?, 2, 'de', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"
		)
		.run(start, duration, deletedAt);
const insertBlock = (start: string, end: string) =>
	sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'private_use')").run(start, end);

describe('getSettings and getSeasons', () => {
	it('read the seeded setting and season', () => {
		expect(getSettings(db)).toEqual({ changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 });
		expect(getSeasons(db)).toEqual([{ startDate: '2027-01-09', endDate: '2027-04-30' }]);
	});

	it('order seasons by start', () => {
		sqlite.prepare("insert into season (start_date, end_date) values ('2026-01-10', '2026-04-30')").run();
		expect(getSeasons(db).map((s) => s.startDate)).toEqual(['2026-01-10', '2027-01-09']);
	});

	it('throws without a setting row', () => {
		sqlite.prepare('delete from setting').run();
		expect(() => getSettings(db)).toThrow(/setting/);
	});
});

describe('getDayItems', () => {
	const from = '2027-01-11T23:00:00Z';
	const to = '2027-01-12T23:00:00Z';

	it('returns live bookings starting in [from, to) with only the core columns', () => {
		insertBooking('2027-01-11T22:00:00Z', 60); // starts before `from`
		insertBooking('2027-01-11T23:00:00Z', 60); // starts at `from`
		insertBooking('2027-01-12T16:00:00Z', 60);
		insertBooking('2027-01-12T18:00:00Z', 60, '2027-01-10T08:00:00Z'); // deleted
		insertBooking('2027-01-12T23:00:00Z', 60); // starts at `to`
		const { bookings } = getDayItems(from, to, db);
		expect(bookings.map((b) => b.start)).toEqual(['2027-01-11T23:00:00Z', '2027-01-12T16:00:00Z']);
		expect(Object.keys(bookings[0]).sort()).toEqual(['changeoverMin', 'createdAt', 'durationMin', 'id', 'start']);
	});

	it('returns blocks overlapping [from, to) without their reason', () => {
		insertBlock('2027-01-11T20:00:00Z', '2027-01-11T23:00:00Z'); // ends at `from`
		insertBlock('2027-01-11T22:00:00Z', '2027-01-12T01:00:00Z'); // runs into the range
		insertBlock('2027-01-12T11:00:00Z', '2027-01-12T12:00:00Z');
		insertBlock('2027-01-12T23:00:00Z', '2027-01-13T01:00:00Z'); // starts at `to`
		const { blocks } = getDayItems(from, to, db);
		expect(blocks).toEqual([
			{ start: '2027-01-11T22:00:00Z', end: '2027-01-12T01:00:00Z' },
			{ start: '2027-01-12T11:00:00Z', end: '2027-01-12T12:00:00Z' }
		]);
	});
});
