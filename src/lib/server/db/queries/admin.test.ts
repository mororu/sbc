// Admin queries (Story 3.1): the call feed for `deriveCallList`, the reply-reminder count ("Replies"
// row of the matrix) and the password hash read. Raw inserts on an in-memory database.
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveCallList } from '#lib/domain/index.ts';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { countReplyReminders, getAdminPasswordHash, getCallFeed } from './admin.ts';

/** Tue 12 Jan 2027, 10:00 Zurich. */
const NOW = '2027-01-12T09:00:00Z';
const HOT = '{"heat":"hot","earliest":null,"latest":null}';
const COLD_1800 = '{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}';

let sqlite: Database.Database;
let db: Db;
let count = 0;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
});

type Row = {
	start?: string;
	durationMin?: number;
	lastTold?: string | null;
	email?: string | null;
	deletedAt?: string | null;
	replyDoneAt?: string | null;
};

const insertBooking = (row: Row = {}): number => {
	const id = `ID${String(++count).padStart(20, '0')}`;
	const result = sqlite
		.prepare(
			'insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, email, deleted_at, reply_done_at, last_told_notice) values (?, ?, 15, ?, 1, 2, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			row.start ?? '2027-01-12T17:00:00Z',
			row.durationMin ?? 90,
			'2027-01-07T10:00:00Z',
			'de',
			id,
			id,
			row.email === undefined ? 'lena@example.ch' : row.email,
			row.deletedAt ?? null,
			row.replyDoneAt ?? null,
			row.lastTold === undefined ? COLD_1800 : row.lastTold
		);
	return Number(result.lastInsertRowid);
};

const insertRow = (bookingId: number, kind: string, state: string) =>
	sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, ?, ?, '2027-01-11T17:00:00Z')").run(bookingId, kind, state);

describe('countReplyReminders', () => {
	it('counts a deleted booking with an email and no reply done, and nothing else', () => {
		insertBooking({ deletedAt: '2027-01-10T08:00:00Z' });
		insertBooking({ deletedAt: '2027-01-10T08:00:00Z', email: null });
		insertBooking({ deletedAt: '2027-01-10T08:00:00Z', replyDoneAt: '2027-01-10T09:00:00Z' });
		insertBooking();
		expect(countReplyReminders(db)).toBe(1);
	});

	it('is 0 without reminders', () => {
		expect(countReplyReminders(db)).toBe(0);
	});
});

describe('getAdminPasswordHash', () => {
	it('reads null before the CLI ran, then the stored hash', () => {
		expect(getAdminPasswordHash(db)).toBeNull();
		sqlite.prepare("update setting set admin_password_hash = '$argon2id$x'").run();
		expect(getAdminPasswordHash(db)).toBe('$argon2id$x');
	});
});

describe('getCallFeed', () => {
	it('carries the last-told and the current notice of each live booking that has not started', () => {
		const told = insertBooking({ lastTold: HOT });
		insertRow(told, 'keybox', 'accepted');
		insertBooking({ start: '2027-01-12T08:00:00Z', lastTold: HOT });
		insertBooking({ deletedAt: '2027-01-10T08:00:00Z', lastTold: HOT });
		const feed = getCallFeed(NOW, db);
		expect([...feed.keys()]).toEqual([told]);
		expect(feed.get(told)).toEqual({
			start: '2027-01-12T17:00:00Z',
			createdAt: '2027-01-07T10:00:00Z',
			preheatMaxMin: 40,
			rows: [{ id: 1, kind: 'keybox', state: 'accepted', urgent: null, resolvedAt: null }],
			lastTold: { heat: 'hot', earliest: null, latest: null },
			current: { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' }
		});
		expect(deriveCallList(feed, NOW)).toEqual([
			{ bookingId: told, start: '2027-01-12T17:00:00Z', marker: 'call_required', reasons: [], heatChange: 'urgent' }
		]);
	});

	it('reads the current notice with the booking before it: hot after a booking ending one changeover before the start', () => {
		insertBooking({ start: '2027-01-12T15:15:00Z', lastTold: HOT });
		const after = insertBooking({ start: '2027-01-12T17:00:00Z', lastTold: COLD_1800 });
		insertRow(after, 'keybox', 'accepted');
		const entry = getCallFeed(NOW, db).get(after);
		expect(entry?.current).toEqual({ heat: 'hot', earliest: null, latest: null });
		expect(deriveCallList(getCallFeed(NOW, db), NOW)).toMatchObject([{ bookingId: after, marker: 'optional', heatChange: 'good_news' }]);
	});

	it('reads an unknown or unreadable last-told notice as null, and a booking without rows', () => {
		const none = insertBooking({ lastTold: null });
		const bad = insertBooking({ start: '2027-01-13T17:00:00Z', lastTold: '{"heat":"warm"}' });
		const feed = getCallFeed(NOW, db);
		expect(feed.get(none)).toMatchObject({ lastTold: null, rows: [] });
		expect(feed.get(bad)).toMatchObject({ lastTold: null });
		expect(deriveCallList(feed, NOW)).toEqual([]);
	});
});
