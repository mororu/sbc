// Admin queries (Story 3.1): the call feed for `deriveCallList`, the reply-reminder count ("Replies"
// row of the matrix) and the password hash read; (Story 3.2) the bookings by day and the detail, the
// accepted admin days, the strip's extra dates and the flag candidates. Raw inserts on an in-memory database.
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveCallList } from '#lib/domain/index.ts';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import {
	adminDayAccepted,
	countReplyReminders,
	getAdminBooking,
	getAdminBookings,
	getAdminPasswordHash,
	getAdminStripExtraDates,
	getCallFeed,
	getFutureFlagCandidates
} from './admin.ts';

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

type OutboxFields = {
	urgent?: boolean | null;
	reason?: string | null;
	code?: string | null;
	outcomeAt?: string | null;
	resolvedAt?: string | null;
	dueAt?: string;
};

const insertOutbox = (bookingId: number, kind: string, state: string, f: OutboxFields = {}) =>
	sqlite
		.prepare(
			'insert into outbox (booking_id, kind, state, due_at, snapshot_urgent, reason, snapshot_keybox_code, outcome_at, resolved_at, claimed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			bookingId,
			kind,
			state,
			f.dueAt ?? '2027-01-11T17:00:00Z',
			f.urgent === undefined || f.urgent === null ? null : f.urgent ? 1 : 0,
			f.reason ?? null,
			f.code ?? null,
			f.outcomeAt ?? null,
			f.resolvedAt ?? null,
			state === 'in_flight' ? '2027-01-12T08:59:00Z' : null
		);

const insertBlock = (start: string, end: string) =>
	sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(start, end);

const DAY_FROM = '2027-01-11T23:00:00Z';
const DAY_TO = '2027-01-12T23:00:00Z';

describe('getAdminBookings', () => {
	it('lists the live bookings of the day in start order, with contact data and both notices', () => {
		const late = insertBooking({ start: '2027-01-12T19:00:00Z', lastTold: HOT });
		const early = insertBooking({ start: '2027-01-12T17:00:00Z' });
		insertBooking({ start: '2027-01-12T18:00:00Z', deletedAt: '2027-01-10T08:00:00Z' });
		insertBooking({ start: '2027-01-13T17:00:00Z' });
		sqlite.prepare("update booking set name = 'Tom Brunner', mobile = '+41791234567' where id = ?").run(early);
		const list = getAdminBookings(DAY_FROM, DAY_TO, db);
		expect(list.map((b) => b.id)).toEqual([early, late]);
		expect(list[0]).toEqual({
			id: early,
			start: '2027-01-12T17:00:00Z',
			durationMin: 90,
			partySize: 2,
			locale: 'de',
			name: 'Tom Brunner',
			email: 'lena@example.ch',
			mobile: '+41791234567',
			current: { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' },
			lastTold: { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' },
			keybox: null,
			refusals: []
		});
		expect(list[1].lastTold).toEqual({ heat: 'hot', earliest: null, latest: null });
	});

	it('carries the keybox row and only the refused non-urgent emails, unresolved', () => {
		const id = insertBooking();
		insertOutbox(id, 'confirmation', 'refused', { reason: 'smtp 550', outcomeAt: '2027-01-07T10:01:00Z' });
		insertOutbox(id, 'keybox', 'accepted', { code: '4711', outcomeAt: '2027-01-11T15:00:00Z' });
		insertOutbox(id, 'heat_change', 'refused', { urgent: false, reason: 'smtp 552' });
		insertOutbox(id, 'heat_change', 'refused', { urgent: true, reason: 'smtp 553' });
		insertOutbox(id, 'heat_change', 'refused', { urgent: false, reason: 'smtp 554', resolvedAt: '2027-01-12T08:00:00Z' });
		const [b] = getAdminBookings(DAY_FROM, DAY_TO, db);
		expect(b.keybox).toEqual({
			state: 'accepted',
			dueAt: '2027-01-11T17:00:00Z',
			outcomeAt: '2027-01-11T15:00:00Z',
			reason: null,
			snapshotKeyboxCode: '4711'
		});
		expect(b.refusals).toEqual([
			{ kind: 'confirmation', reason: 'smtp 550', outcomeAt: '2027-01-07T10:01:00Z' },
			{ kind: 'heat_change', reason: 'smtp 552', outcomeAt: null }
		]);
	});

	it('does not list a refused keybox email (the call list owns it)', () => {
		const id = insertBooking();
		insertOutbox(id, 'keybox', 'refused', { reason: 'smtp 550' });
		expect(getAdminBookings(DAY_FROM, DAY_TO, db)[0].refusals).toEqual([]);
	});

	it('is empty for a day without live bookings', () => {
		insertBooking({ deletedAt: '2027-01-10T08:00:00Z' });
		expect(getAdminBookings(DAY_FROM, DAY_TO, db)).toEqual([]);
	});
});

describe('getAdminBooking', () => {
	it('reads a live booking, and null for a deleted or unknown one', () => {
		const live = insertBooking();
		const gone = insertBooking({ deletedAt: '2027-01-10T08:00:00Z' });
		expect(getAdminBooking(live, db)?.id).toBe(live);
		expect(getAdminBooking(gone, db)).toBeNull();
		expect(getAdminBooking(9999, db)).toBeNull();
	});
});

describe('adminDayAccepted', () => {
	beforeEach(() => {
		sqlite.prepare("update season set end_date = '2027-03-31' where id = 1").run();
		sqlite.prepare("insert into season (id, start_date, end_date) values (2, '2026-11-20', '2026-12-20')").run();
	});

	it('accepts a day of any season row, past ones too', () => {
		expect(adminDayAccepted('2026-12-01', db)).toBe(true);
		expect(adminDayAccepted('2027-01-09', db)).toBe(true);
		expect(adminDayAccepted('2027-03-31', db)).toBe(true);
	});

	it('accepts a day outside the seasons with a live booking or a block, not one with only a deleted booking', () => {
		insertBlock('2027-04-05T07:00:00Z', '2027-04-05T09:00:00Z');
		insertBooking({ start: '2027-04-07T16:00:00Z' });
		insertBooking({ start: '2027-04-06T16:00:00Z', deletedAt: '2027-01-10T08:00:00Z' });
		expect(adminDayAccepted('2027-04-05', db)).toBe(true);
		expect(adminDayAccepted('2027-04-07', db)).toBe(true);
		expect(adminDayAccepted('2027-04-06', db)).toBe(false);
		expect(adminDayAccepted('2027-05-01', db)).toBe(false);
	});
});

describe('getAdminStripExtraDates', () => {
	it('lists the dates of future live bookings and of blocks not over yet, sorted, once each', () => {
		insertBooking({ start: '2027-04-05T16:00:00Z' });
		insertBooking({ start: '2027-04-05T18:00:00Z' });
		insertBooking({ start: '2027-04-06T16:00:00Z', deletedAt: '2027-01-10T08:00:00Z' });
		insertBooking({ start: '2027-01-12T08:00:00Z' });
		insertBlock('2027-01-10T07:00:00Z', '2027-01-10T09:00:00Z');
		insertBlock('2027-01-11T23:30:00Z', '2027-01-12T10:00:00Z');
		insertBlock('2027-02-01T07:00:00Z', '2027-02-01T09:00:00Z');
		expect(getAdminStripExtraDates(NOW, db)).toEqual(['2027-01-12', '2027-02-01', '2027-04-05']);
	});

	it('adds every future day a block or booking overlaps, up to the day of its end − 1 s', () => {
		// 3 Feb 22:00 – 5 Feb 08:00 local: three days.
		insertBlock('2027-02-03T21:00:00Z', '2027-02-05T07:00:00Z');
		// Ends exactly at local midnight: one day only.
		insertBlock('2027-02-10T20:00:00Z', '2027-02-10T23:00:00Z');
		// 23:00–00:30 local: two days.
		insertBooking({ start: '2027-02-20T22:00:00Z', durationMin: 90 });
		// Running since yesterday: from today on.
		insertBlock('2027-01-10T08:00:00Z', '2027-01-13T08:00:00Z');
		expect(getAdminStripExtraDates(NOW, db)).toEqual([
			'2027-01-12',
			'2027-01-13',
			'2027-02-03',
			'2027-02-04',
			'2027-02-05',
			'2027-02-10',
			'2027-02-20',
			'2027-02-21'
		]);
	});
});

describe('getFutureFlagCandidates', () => {
	it('lists the live bookings not started, with whether a non-urgent email was refused', () => {
		const refused = insertBooking({ start: '2027-01-13T17:00:00Z' });
		insertOutbox(refused, 'confirmation', 'refused', { reason: 'smtp 550' });
		const urgent = insertBooking({ start: '2027-01-14T17:00:00Z' });
		insertOutbox(urgent, 'heat_change', 'refused', { urgent: true });
		const goodNews = insertBooking({ start: '2027-01-15T17:00:00Z' });
		insertOutbox(goodNews, 'heat_change', 'refused', { urgent: false });
		const past = insertBooking({ start: '2027-01-12T08:00:00Z' });
		insertOutbox(past, 'confirmation', 'refused');
		insertBooking({ start: '2027-01-16T17:00:00Z', deletedAt: '2027-01-10T08:00:00Z' });
		const resolved = insertBooking({ start: '2027-01-17T17:00:00Z' });
		insertOutbox(resolved, 'confirmation', 'refused', { resolvedAt: '2027-01-12T08:00:00Z' });
		const keyboxRefused = insertBooking({ start: '2027-01-18T17:00:00Z' });
		insertOutbox(keyboxRefused, 'keybox', 'refused', { reason: 'smtp 550' });
		expect(getFutureFlagCandidates(NOW, db)).toEqual([
			{ id: refused, start: '2027-01-13T17:00:00Z', durationMin: 90, name: null, refused: true },
			{ id: urgent, start: '2027-01-14T17:00:00Z', durationMin: 90, name: null, refused: false },
			{ id: goodNews, start: '2027-01-15T17:00:00Z', durationMin: 90, name: null, refused: true },
			{ id: resolved, start: '2027-01-17T17:00:00Z', durationMin: 90, name: null, refused: false },
			{ id: keyboxRefused, start: '2027-01-18T17:00:00Z', durationMin: 90, name: null, refused: false }
		]);
	});
});
