// Story 3.4 matrix (Done, Already done, Failure): markReplyDone on a temp-file database. Bookings are
// inserted directly; `now` is Tue 12 Jan 2027, 10:00 Zurich.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { countReplyReminders, getReplyReminders } from '../db/queries/index.ts';
import { isLockTimeout } from './create-booking.ts';
import { markReplyDone } from './mark-reply-done.ts';

const NOW = '2027-01-12T09:00:00Z';

let dir: string;
let sqlite: Database.Database;
let db: Db;
let count = 0;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-reply-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const insert = (row: { email?: string | null; deletedAt?: string | null; replyDoneAt?: string | null } = {}): number => {
	const id = `ID${String(++count).padStart(20, '0')}`;
	const result = sqlite
		.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, email, deleted_at, reply_done_at) values ('2027-01-12T17:00:00Z', 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'Anna Meier', ?, ?, ?)"
		)
		.run(
			id,
			id,
			row.email === undefined ? 'anna@example.ch' : row.email,
			row.deletedAt === undefined ? '2027-01-12T08:00:00Z' : row.deletedAt,
			row.replyDoneAt ?? null
		);
	return Number(result.lastInsertRowid);
};

const replyDoneAt = (id: number) =>
	(sqlite.prepare('select reply_done_at as r from booking where id = ?').get(id) as { r: string | null }).r;

describe('markReplyDone', () => {
	it('sets reply_done_at = now; the reminder leaves the list, the day and the count', () => {
		const id = insert();
		expect(countReplyReminders(db)).toBe(1);
		expect(markReplyDone({ bookingId: id }, { now: NOW, db })).toEqual({ ok: true });
		expect(replyDoneAt(id)).toBe(NOW);
		expect(getReplyReminders({}, db)).toEqual([]);
		expect(getReplyReminders({ date: '2027-01-12' }, db)).toEqual([]);
		expect(countReplyReminders(db)).toBe(0);
	});

	it('refuses a reply already done (another admin) with conflict and writes nothing', () => {
		const id = insert({ replyDoneAt: '2027-01-12T08:30:00Z' });
		expect(markReplyDone({ bookingId: id }, { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(replyDoneAt(id)).toBe('2027-01-12T08:30:00Z');
	});

	it('refuses a reminder whose email was purged with conflict and writes nothing', () => {
		const id = insert({ email: null });
		expect(markReplyDone({ bookingId: id }, { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(replyDoneAt(id)).toBeNull();
	});

	it('refuses a blank email with conflict and writes nothing; the list and count skip it', () => {
		const blank = insert({ email: '' });
		const spaces = insert({ email: '   ' });
		expect(countReplyReminders(db)).toBe(0);
		expect(getReplyReminders({}, db)).toEqual([]);
		for (const id of [blank, spaces]) {
			expect(markReplyDone({ bookingId: id }, { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
			expect(replyDoneAt(id)).toBeNull();
		}
	});

	it('refuses a live booking and an unknown or malformed id with not_found and writes nothing', () => {
		const live = insert({ deletedAt: null });
		expect(markReplyDone({ bookingId: live }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(replyDoneAt(live)).toBeNull();
		expect(markReplyDone({ bookingId: 999 }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(markReplyDone({ bookingId: 0 }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(markReplyDone({ bookingId: Number.NaN }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
	});

	it('throws a lock timeout (nothing written) while another writer holds the lock', () => {
		const id = insert();
		const other = openDatabase(join(dir, 'app.sqlite'));
		try {
			other.pragma('busy_timeout = 0');
			sqlite.pragma('busy_timeout = 0');
			other.exec('BEGIN IMMEDIATE');
			let thrown: unknown;
			try {
				markReplyDone({ bookingId: id }, { now: NOW, db });
			} catch (e) {
				thrown = e;
			}
			expect(isLockTimeout(thrown)).toBe(true);
			other.exec('ROLLBACK');
			expect(replyDoneAt(id)).toBeNull();
		} finally {
			other.close();
		}
	});
});
