// Story 4.1: snapshotAnalytics on a temp-file database (seeded season 9 Jan – 30 Apr 2027, hours
// 16:00–22:00, changeover 15). Rows are inserted directly, so every instant is explicit.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { guestKey } from '../guest-key.ts';
import { randomId } from '../ids.ts';
import { snapshotAnalytics } from './snapshot-analytics.ts';

const SECRET = 'test-secret';
const at = (date: string, hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-analytics-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	sqlite.exec('update setting set open_minute = 960');
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const insert = (start: string, over: { email?: string | null; deletedAt?: string; durationMin?: number; changeoverMin?: number } = {}) =>
	Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, deleted_at, party_size, locale, name, email, mobile, public_id, submit_token) values (?, ?, ?, '2027-01-05T08:00:00Z', 1, ?, 3, 'de', 'Lena Muster', ?, '+41791234567', ?, ?)"
			)
			.run(
				start,
				over.durationMin ?? 60,
				over.changeoverMin ?? 15,
				over.deletedAt ?? null,
				over.email === undefined ? 'lena@example.ch' : over.email,
				randomId(),
				randomId()
			).lastInsertRowid
	);
const block = (start: string, end: string, reason = 'cleaning') =>
	sqlite.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)').run(start, end, reason);
const run = (now: string) => snapshotAnalytics({ now, db, guestKeySecret: SECRET });
const bookingRows = () => sqlite.prepare('select * from analytics_booking order by booking_id').all() as Record<string, unknown>[];
const dayRows = () => sqlite.prepare('select * from analytics_day order by date').all() as Record<string, unknown>[];
const day = (date: string) => {
	const row = dayRows().find((r) => r.date === date)!;
	return { ...row, blocks: JSON.parse(row.blocks as string), unbooked: JSON.parse(row.unbooked as string) };
};

describe('booking records', () => {
	it('writes one row per started booking, with the local columns and the guest key', () => {
		const first = insert(at('2027-01-12', '17:00'), { durationMin: 90 });
		const second = insert(at('2027-01-12', '18:45'));
		expect(run(at('2027-01-12', '18:45')).bookings).toBe(2);
		const key = guestKey('lena@example.ch', SECRET);
		expect(bookingRows()).toEqual([
			{ id: 1, booking_id: first, season_id: 1, date: '2027-01-12', hhmm: '17:00', weekday: 2, iso_week: 2, duration_min: 90, party_size: 3, heat: 'cold', changeover_min: 15, start_kind: 1, guest_key: key },
			{ id: 2, booking_id: second, season_id: 1, date: '2027-01-12', hhmm: '18:45', weekday: 2, iso_week: 2, duration_min: 60, party_size: 3, heat: 'hot', changeover_min: 15, start_kind: 2, guest_key: key }
		]);
	});

	it('waits for the start, and records a booking at the very start', () => {
		insert(at('2027-01-12', '17:00'));
		expect(run('2027-01-12T15:59:59Z').bookings).toBe(0);
		expect(run('2027-01-12T16:00:00Z').bookings).toBe(1);
	});

	it('keeps the Zurich wall clock on both sides of the summer-time switch', () => {
		insert(at('2027-03-27', '18:00'));
		insert(at('2027-03-28', '18:00'));
		run(at('2027-03-28', '20:00'));
		expect(bookingRows()).toMatchObject([
			{ date: '2027-03-27', hhmm: '18:00', weekday: 6, iso_week: 12, start_kind: 1 },
			{ date: '2027-03-28', hhmm: '18:00', weekday: 7, iso_week: 12, start_kind: 1 }
		]);
		expect(at('2027-03-27', '18:00')).toBe('2027-03-27T17:00:00Z');
		expect(at('2027-03-28', '18:00')).toBe('2027-03-28T16:00:00Z');
	});

	it('never records a booking deleted before its start, and lets it heat nothing', () => {
		insert(at('2027-01-12', '17:00'), { deletedAt: '2027-01-11T08:00:00Z' });
		insert(at('2027-01-12', '18:15'));
		expect(run(at('2027-01-13', '10:00')).bookings).toBe(1);
		expect(bookingRows()).toMatchObject([{ hhmm: '18:15', heat: 'cold', start_kind: 3 }]);
	});

	it('gives the same guest the same key in another case or with spaces', () => {
		insert(at('2027-01-12', '17:00'), { email: 'lena@example.ch' });
		insert(at('2027-01-12', '19:00'), { email: ' Lena@Example.CH ' });
		insert(at('2027-01-12', '21:00'), { email: 'tom@example.ch' });
		run(at('2027-01-13', '10:00'));
		const keys = bookingRows().map((r) => r.guest_key);
		expect(keys[0]).toBe(keys[1]);
		expect(keys[2]).not.toBe(keys[0]);
	});

	it('leaves the key null when the email was erased before the snapshot', () => {
		insert(at('2027-01-12', '17:00'), { email: null });
		run(at('2027-01-13', '10:00'));
		expect(bookingRows()).toMatchObject([{ guest_key: null }]);
	});

	it('uses the season of the booking row', () => {
		sqlite.exec("update season set end_date = '2027-01-10'");
		insert(at('2027-01-12', '17:00'));
		run(at('2027-01-13', '10:00'));
		expect(bookingRows()).toMatchObject([{ season_id: 1, date: '2027-01-12' }]);
		// 11 and 12 January are in no season: no day record.
		expect(dayRows().map((r) => r.date)).toEqual(['2027-01-09', '2027-01-10']);
	});
});

describe('day records', () => {
	it('writes each passed season day once it is over, never today', () => {
		run(at('2027-01-10', '23:59'));
		expect(dayRows().map((r) => r.date)).toEqual(['2027-01-09']);
		run(at('2027-01-11', '00:00'));
		expect(dayRows().map((r) => r.date)).toEqual(['2027-01-09', '2027-01-10']);
	});

	it('stores the hours, the blocks with reason and the unbooked times with heat', () => {
		insert(at('2027-01-12', '17:00'));
		block(at('2027-01-12', '20:00'), at('2027-01-12', '21:00'), 'maintenance');
		run(at('2027-01-13', '10:00'));
		expect(day('2027-01-12')).toMatchObject({
			season_id: 1,
			open_minute: 960,
			close_minute: 1320,
			blocks: [{ start: '20:00', end: '21:00', reason: 'maintenance' }],
			unbooked: [
				{ start: '18:15', heat: 'hot' },
				{ start: '18:30', heat: 'cold' },
				{ start: '19:00', heat: 'cold' },
				{ start: '21:00', heat: 'cold' }
			]
		});
	});

	it('clips a block over midnight to each day', () => {
		block(at('2027-01-11', '20:00'), at('2027-01-13', '00:00'), 'private_use');
		run(at('2027-01-14', '10:00'));
		expect(day('2027-01-11').blocks).toEqual([{ start: '20:00', end: '24:00', reason: 'private_use' }]);
		expect(day('2027-01-12').blocks).toEqual([{ start: '00:00', end: '24:00', reason: 'private_use' }]);
		expect(day('2027-01-12').unbooked).toEqual([]);
		expect(day('2027-01-13').blocks).toEqual([]);
	});

	it('stops at the season end', () => {
		run('2027-06-01T10:00:00Z');
		expect(dayRows()).toHaveLength(112);
		expect(dayRows().at(-1)).toMatchObject({ date: '2027-04-30' });
	});
});

describe('catch-up and permanence', () => {
	it('writes everything missing once after downtime, and nothing on a second run', () => {
		run(at('2027-01-10', '10:00'));
		insert(at('2027-01-10', '17:00'));
		insert(at('2027-01-11', '17:00'));
		expect(run(at('2027-01-12', '10:00'))).toEqual({ ok: true, bookings: 2, days: 2 });
		const before = [bookingRows(), dayRows()];
		expect(run(at('2027-01-12', '10:00'))).toEqual({ ok: true, bookings: 0, days: 0 });
		expect([bookingRows(), dayRows()]).toEqual(before);
	});

	it('catches up with the settings current at snapshot time, and never rewrites a record', () => {
		insert(at('2027-01-10', '17:00'));
		run(at('2027-01-11', '10:00'));
		const before = [bookingRows(), day('2027-01-10')];
		sqlite.exec('update setting set open_minute = 1080, changeover_min = 30');
		sqlite.exec('update booking set name = null, email = null, mobile = null');
		run(at('2027-01-12', '10:00'));
		expect([bookingRows(), day('2027-01-10')]).toEqual(before);
		expect(day('2027-01-11')).toMatchObject({ open_minute: 1080 });
	});

	it('writes nothing at all when one record fails', () => {
		insert(at('2027-01-10', '17:00'));
		sqlite.exec("create trigger no_day before insert on analytics_day begin select raise(abort, 'nope'); end");
		expect(() => run(at('2027-01-12', '10:00'))).toThrow();
		expect(bookingRows()).toEqual([]);
	});

	it('has no contact columns, and holds no plain email', () => {
		insert(at('2027-01-10', '17:00'));
		run(at('2027-01-12', '10:00'));
		for (const table of ['analytics_booking', 'analytics_day']) {
			const columns = (sqlite.prepare(`select name from pragma_table_info('${table}')`).all() as { name: string }[]).map((c) => c.name);
			for (const column of ['name', 'email', 'mobile']) expect(columns).not.toContain(column);
		}
		expect(JSON.stringify([bookingRows(), dayRows()])).not.toMatch(/lena|example|4179/i);
	});

	it('keeps one record per booking and per date by unique keys', () => {
		insert(at('2027-01-10', '17:00'));
		run(at('2027-01-12', '10:00'));
		for (const table of ['analytics_booking', 'analytics_day']) {
			const columns = (sqlite.prepare(`select name from pragma_table_info('${table}') where name <> 'id'`).all() as { name: string }[]).map((c) => c.name).join(', ');
			expect(() => sqlite.exec(`insert into ${table} (${columns}) select ${columns} from ${table} limit 1`)).toThrow(/UNIQUE/);
		}
	});
});
