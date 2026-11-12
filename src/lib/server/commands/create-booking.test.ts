// Story 1.7 matrix, command rows: changeover 15, hours 10:00–22:00, season 9 Jan – 30 Apr 2027,
// `now` 12 Jan 09:00. Runs on a temp-file database, so a second connection can race the first.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DURATIONS } from '#lib/domain/index.ts';
import { BOOKING_DURATIONS, PARTY_SIZES } from '#lib/schemas/index.ts';
import { locales } from '#lib/paraglide/runtime.js';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { LOCALES } from '../db/schema.ts';
import { randomId } from '../ids.ts';
import { createBooking, isLockTimeout, type CreateBookingInput } from './create-booking.ts';

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
	dir = mkdtempSync(join(tmpdir(), 'sauna-cmd-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const lena = (over: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
	start: at('18:00'),
	durationMin: 90,
	partySize: 3,
	name: 'Lena',
	email: 'lena@example.ch',
	mobile: '+41791234567',
	locale: 'de',
	submitToken: randomId(),
	...over
});

const rows = (conn = sqlite) =>
	conn.prepare('select * from booking where deleted_at is null order by start_at').all() as Record<string, unknown>[];

describe('isLockTimeout', () => {
	it('recognises only SQLITE_BUSY codes', () => {
		expect(isLockTimeout(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }))).toBe(true);
		expect(isLockTimeout(Object.assign(new Error('x'), { code: 'SQLITE_BUSY_SNAPSHOT' }))).toBe(true);
		expect(isLockTimeout(Object.assign(new Error('x'), { code: 'SQLITE_CONSTRAINT' }))).toBe(false);
		expect(isLockTimeout(new Error('database is locked'))).toBe(false);
		expect(isLockTimeout(null)).toBe(false);
	});
});

describe('shared constants', () => {
	it('keeps the schema, the domain, the database and Paraglide in step', () => {
		expect([...BOOKING_DURATIONS]).toEqual([...DURATIONS]);
		expect([...PARTY_SIZES]).toEqual([1, 2, 3, 4, 5, 6]);
		expect([...LOCALES].sort()).toEqual([...locales].sort());
	});
});

describe('createBooking', () => {
	it('inserts a valid booking with everything it must record', () => {
		const token = randomId();
		const result = createBooking(lena({ submitToken: token }), { now: NOW, db });
		expect(result).toEqual({ ok: true, publicId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) });
		if (!result.ok) return;
		expect(rows()).toEqual([
			{
				id: expect.any(Number),
				start_at: '2027-01-12T17:00:00Z',
				duration_min: 90,
				changeover_min: 15,
				created_at: NOW,
				season_id: 1,
				deleted_at: null,
				party_size: 3,
				locale: 'de',
				name: 'Lena',
				email: 'lena@example.ch',
				mobile: '+41791234567',
				public_id: result.publicId,
				submit_token: token
			}
		]);
	});

	it('records the current changeover and the locale at submit', () => {
		sqlite.prepare('update setting set changeover_min = 30 where id = 1').run();
		expect(createBooking(lena({ locale: 'en' }), { now: NOW, db }).ok).toBe(true);
		expect(rows()[0]).toMatchObject({ changeover_min: 30, locale: 'en' });
	});

	it('returns the same public id for the same submit token, without a second row', () => {
		const token = randomId();
		const first = createBooking(lena({ submitToken: token }), { now: NOW, db });
		const again = createBooking(lena({ submitToken: token }), { now: NOW, db });
		expect(again).toEqual(first);
		expect(rows()).toHaveLength(1);
	});

	it('refuses a resubmit with conflict once its booking was deleted, and books nothing', () => {
		const token = randomId();
		const first = createBooking(lena({ submitToken: token }), { now: NOW, db });
		expect(first.ok).toBe(true);
		sqlite.prepare("update booking set deleted_at = '2027-01-12T08:30:00Z'").run();
		expect(createBooking(lena({ submitToken: token }), { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(rows()).toHaveLength(0);
	});

	it('returns the booking for a resubmit even after its start has begun', () => {
		const token = randomId();
		const first = createBooking(lena({ submitToken: token }), { now: NOW, db });
		expect(createBooking(lena({ submitToken: token }), { now: at('18:30'), db })).toEqual(first);
	});

	it('refuses 18:00 with conflict once 17:00–18:00 is booked', () => {
		expect(createBooking(lena({ start: at('17:00'), durationMin: 60 }), { now: NOW, db }).ok).toBe(true);
		expect(createBooking(lena(), { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(rows()).toHaveLength(1);
	});

	it('refuses with past when the start time has begun', () => {
		expect(createBooking(lena(), { now: at('18:00'), db })).toEqual({ ok: false, code: 'past' });
		expect(createBooking(lena(), { now: at('18:05'), db })).toEqual({ ok: false, code: 'past' });
		expect(rows()).toHaveLength(0);
	});

	it.each([
		['180 min running past 22:00', { start: at('20:00'), durationMin: 180 }],
		['a start off the offered times', { start: at('18:07') }],
		['a start at closing time', { start: at('22:00'), durationMin: 60 }],
		['a day outside the season', { start: at('18:00', '2027-05-03') }],
		['a day beyond the horizon', { start: at('18:00', '2027-01-30') }]
	])('refuses %s with conflict', (_name, over) => {
		expect(createBooking(lena(over), { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(rows()).toHaveLength(0);
	});

	it('refuses a duration that would overlap a block', () => {
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')")
			.run(at('19:00'), at('20:00'));
		expect(createBooking(lena({ durationMin: 90 }), { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(createBooking(lena({ durationMin: 60 }), { now: NOW, db }).ok).toBe(true);
		expect(rows()).toHaveLength(1);
	});

	it('refuses a duration that leaves too little changeover before the next booking', () => {
		expect(createBooking(lena({ start: at('20:00'), durationMin: 60 }), { now: NOW, db }).ok).toBe(true);
		// 18:00 + 120 = 20:00: no changeover left. 18:00 + 90 = 19:30 leaves 30 min.
		expect(createBooking(lena({ durationMin: 120 }), { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(createBooking(lena({ durationMin: 90 }), { now: NOW, db }).ok).toBe(true);
		expect(rows()).toHaveLength(2);
	});

	it('offers a kind-3-only time only with the durations that end there', () => {
		expect(createBooking(lena({ start: at('20:00'), durationMin: 60 }), { now: NOW, db }).ok).toBe(true);
		// 18:15 + 90 + 15 = 20:00: kind 3 only; 60 min would leave a gap, so only 90 is offered.
		expect(createBooking(lena({ start: at('18:15'), durationMin: 60 }), { now: NOW, db })).toEqual({
			ok: false,
			code: 'conflict'
		});
		expect(createBooking(lena({ start: at('18:15'), durationMin: 90 }), { now: NOW, db }).ok).toBe(true);
	});

	it.each([
		['an unknown duration', { durationMin: 75 }],
		['party size 7', { partySize: 7 }],
		['party size 0', { partySize: 0 }],
		['an unknown locale', { locale: 'fr' as 'de' }],
		['a malformed start', { start: '2027-01-12 18:00' }],
		['a short submit token', { submitToken: 'abc' }],
		['an empty name', { name: '' }],
		['an untrimmed email', { email: ' lena@example.ch' }],
		['an unnormalised mobile', { mobile: '079 123 45 67' }]
	])('refuses %s with invalid', (_name, over) => {
		expect(createBooking(lena(over), { now: NOW, db })).toEqual({ ok: false, code: 'invalid' });
		expect(rows()).toHaveLength(0);
	});

	it('lets exactly one of two connections book conflicting times', () => {
		const other = openDatabase(join(dir, 'app.sqlite'));
		const otherDb = createDb(other);
		try {
			const a = createBooking(lena({ start: at('17:00'), durationMin: 60 }), { now: NOW, db });
			const b = createBooking(lena({ start: at('18:00'), durationMin: 60 }), { now: NOW, db: otherDb });
			expect(a.ok).toBe(true);
			expect(b).toEqual({ ok: false, code: 'conflict' });
			expect(rows()).toHaveLength(1);
			expect(rows(other)).toHaveLength(1);
		} finally {
			other.close();
		}
	});

	it('fails loudly (never a wrong answer) while another writer holds the lock, then books once', () => {
		const other = openDatabase(join(dir, 'app.sqlite'));
		const otherDb = createDb(other);
		try {
			// The other connection holds the write lock: createBooking cannot even start reading.
			other.pragma('busy_timeout = 0');
			sqlite.pragma('busy_timeout = 0');
			other.exec('BEGIN IMMEDIATE');
			let thrown: unknown;
			try {
				createBooking(lena(), { now: NOW, db });
			} catch (e) {
				thrown = e;
			}
			expect(isLockTimeout(thrown)).toBe(true);
			other.exec('ROLLBACK');
			// The same token goes through afterwards, once.
			const token = randomId();
			expect(createBooking(lena({ submitToken: token }), { now: NOW, db: otherDb }).ok).toBe(true);
			expect(createBooking(lena({ submitToken: token }), { now: NOW, db }).ok).toBe(true);
			expect(rows()).toHaveLength(1);
		} finally {
			other.close();
		}
	});
});
