// Story 3.6 matrix (Called, Overdue, Warning overdue and the worker's claim after it, Stale, Gone,
// Failure), plus an empty and a garbage token and the empty-token success while the current notice
// is unknown (the feed query is wrapped to null it): markCalled on a temp-file database. Bookings and outbox rows are inserted directly;
// `now` is Tue 12 Jan 2027, 11:06 Zurich; pre-heat 30–40 (the seeded defaults).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyHeatChange, deriveCallList, serializeNotice, type Notice } from '#lib/domain/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { getCallFeed } from '../db/queries/index.ts';
import { isLockTimeout } from './create-booking.ts';
import { enqueueHeatChanges } from './heat-change.ts';
import { markCalled } from './mark-called.ts';
import { claimDueRow } from './outbox.ts';

/** When set, the feed reports every current notice as unknown (e.g. a booking missing from its day data). */
const feedSwitch = vi.hoisted(() => ({ unknownCurrent: false }));

vi.mock('../db/queries/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../db/queries/index.ts')>();
	return {
		...actual,
		getCallFeed: (...args: Parameters<typeof actual.getCallFeed>) => {
			const feed = actual.getCallFeed(...args);
			if (feedSwitch.unknownCurrent) for (const entry of feed.values()) entry.current = null;
			return feed;
		}
	};
});

const NOW = '2027-01-12T10:06:00Z';
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
/** Tom's notice at 17:15 Zurich with nobody before him. */
const TOM_COLD: Notice = { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' };

let dir: string;
let sqlite: Database.Database;
let db: Db;
let count = 0;

beforeEach(() => {
	feedSwitch.unknownCurrent = false;
	dir = mkdtempSync(join(tmpdir(), 'sauna-called-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

type BookingRow = { start?: string; durationMin?: number; createdAt?: string; lastTold?: Notice | null; deletedAt?: string | null };

const insertBooking = (row: BookingRow = {}): number => {
	const id = `ID${String(++count).padStart(20, '0')}`;
	const result = sqlite
		.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, email, mobile, deleted_at, last_told_notice) values (?, ?, 15, ?, 1, 2, 'de', ?, ?, 'Tom Brunner', 'tom@example.ch', '+41794123581', ?, ?)"
		)
		.run(
			row.start ?? '2027-01-12T16:15:00Z',
			row.durationMin ?? 60,
			row.createdAt ?? '2027-01-07T10:00:00Z',
			id,
			id,
			row.deletedAt ?? null,
			row.lastTold === undefined ? serializeNotice(HOT) : row.lastTold === null ? null : serializeNotice(row.lastTold)
		);
	return Number(result.lastInsertRowid);
};

const insertOutbox = (bookingId: number, kind: string, state: string, f: { urgent?: boolean; dueAt?: string; resolvedAt?: string } = {}) =>
	Number(
		sqlite
			.prepare('insert into outbox (booking_id, kind, state, due_at, snapshot_urgent, resolved_at, claimed_at) values (?, ?, ?, ?, ?, ?, ?)')
			.run(
				bookingId,
				kind,
				state,
				f.dueAt ?? '2027-01-11T16:15:00Z',
				f.urgent === undefined ? null : f.urgent ? 1 : 0,
				f.resolvedAt ?? null,
				state === 'in_flight' ? '2027-01-12T10:00:00Z' : null
			).lastInsertRowid
	);

const lastTold = (id: number) =>
	(sqlite.prepare('select last_told_notice as n from booking where id = ?').get(id) as { n: string | null }).n;
const resolvedAt = (rowId: number) =>
	(sqlite.prepare('select resolved_at as r from outbox where id = ?').get(rowId) as { r: string | null }).r;
const calls = (at = NOW) => deriveCallList(getCallFeed(at, db), at);

/** Tom (Tom row of the matrix): keybox email accepted, told hot; Ben before him is deleted → cold. */
const tom = () => {
	const ben = insertBooking({ start: '2027-01-12T15:00:00Z' });
	const id = insertBooking();
	const keybox = insertOutbox(id, 'keybox', 'accepted');
	expect(calls()).toEqual([]); // hot behind Ben: nothing to call about
	sqlite.prepare('update booking set deleted_at = ? where id = ?').run('2027-01-12T10:00:00Z', ben);
	expect(calls()).toMatchObject([{ bookingId: id, marker: 'call_required', heatChange: 'urgent' }]);
	return { id, keybox };
};

describe('markCalled', () => {
	it('writes the posted notice as last told and resolves the refused and expired rows (Called)', () => {
		const { id, keybox } = tom();
		const refused = insertOutbox(id, 'confirmation', 'refused', { dueAt: '2027-01-07T10:00:00Z' });
		const expired = insertOutbox(id, 'heat_change', 'expired', { urgent: false, dueAt: '2027-01-11T10:00:00Z' });
		expect(markCalled({ bookingId: id, notice: serializeNotice(TOM_COLD) }, { now: NOW, db })).toEqual({ ok: true });
		expect(lastTold(id)).toBe(serializeNotice(TOM_COLD));
		expect(resolvedAt(refused)).toBe(NOW);
		expect(resolvedAt(expired)).toBe(NOW);
		expect(resolvedAt(keybox)).toBeNull();
		expect(calls()).toEqual([]);
	});

	it('resolves the overdue keybox row; the entry stays gone when the row is later refused (Overdue)', () => {
		const id = insertBooking({ lastTold: TOM_COLD });
		// Due at the 24-hour cutoff, Mon 17:15; overdue from 17:30. Still pending (held or retrying).
		const keybox = insertOutbox(id, 'keybox', 'pending');
		expect(calls()).toMatchObject([{ bookingId: id, marker: 'call_required', reasons: ['keybox_overdue'] }]);
		expect(markCalled({ bookingId: id, notice: serializeNotice(TOM_COLD) }, { now: NOW, db })).toEqual({ ok: true });
		expect(resolvedAt(keybox)).toBe(NOW);
		expect(calls()).toEqual([]);
		sqlite.prepare("update outbox set state = 'refused', outcome_at = ? where id = ?").run('2027-01-12T10:10:00Z', keybox);
		expect(calls('2027-01-12T10:11:00Z')).toEqual([]);
	});

	it('resolves an urgent heat-change row still pending inside the window (Warning overdue)', () => {
		// 12:00 Zurich, booked at 11:00: the keybox row is due now and not yet overdue. Told hot, now cold.
		const id = insertBooking({ start: '2027-01-12T11:00:00Z', createdAt: '2027-01-12T10:00:00Z' });
		const keybox = insertOutbox(id, 'keybox', 'pending', { dueAt: '2027-01-12T10:00:00Z' });
		const warning = insertOutbox(id, 'heat_change', 'pending', { urgent: true, dueAt: '2027-01-12T10:10:00Z' });
		expect(calls()).toMatchObject([{ bookingId: id, marker: 'call_required', reasons: ['warning_overdue'], heatChange: 'none' }]);
		const current: Notice = { heat: 'cold', earliest: '2027-01-12T10:20:00Z', latest: '2027-01-12T10:30:00Z' };
		expect(markCalled({ bookingId: id, notice: serializeNotice(current) }, { now: NOW, db })).toEqual({ ok: true });
		expect(resolvedAt(warning)).toBe(NOW);
		expect(resolvedAt(keybox)).toBeNull();
		expect(lastTold(id)).toBe(serializeNotice(current));
		expect(calls()).toEqual([]);
	});

	it('lists a second urgent change before the claim again: the re-upsert clears resolved_at (retro D2)', () => {
		const id = insertBooking({ start: '2027-01-12T11:00:00Z', createdAt: '2027-01-12T10:00:00Z' });
		insertOutbox(id, 'keybox', 'pending', { dueAt: '2027-01-12T10:00:00Z' });
		const warning = insertOutbox(id, 'heat_change', 'pending', { urgent: true, dueAt: '2027-01-12T10:10:00Z' });
		const current: Notice = { heat: 'cold', earliest: '2027-01-12T10:20:00Z', latest: '2027-01-12T10:30:00Z' };
		expect(getCallFeed(NOW, db).get(id)?.current).toEqual(current);
		expect(markCalled({ bookingId: id, notice: serializeNotice(current) }, { now: NOW, db })).toEqual({ ok: true });
		expect(resolvedAt(warning)).toBe(NOW);
		// The notice shown on the call list is now the last told one.
		expect(lastTold(id)).toBe(serializeNotice(current));
		expect(calls()).toEqual([]);
		// A block until 10:25 moves the earliest arrival later: urgent against the notice just called.
		const later = '2027-01-12T10:07:00Z';
		sqlite.prepare("insert into block (start_at, end_at, reason) values ('2027-01-12T09:30:00Z', '2027-01-12T10:25:00Z', 'cleaning')").run();
		const second = getCallFeed(later, db).get(id)?.current;
		expect(second).toEqual({ heat: 'cold', earliest: '2027-01-12T10:25:00Z', latest: '2027-01-12T10:30:00Z' });
		expect(classifyHeatChange(current, second as Notice)).toBe('urgent');
		expect(sqlite.transaction(() => enqueueHeatChanges([id], { now: later, db }))()).toEqual([{ bookingId: id, action: 'upserted' }]);
		expect(sqlite.prepare('select id, state, resolved_at, snapshot_urgent from outbox where id = ?').get(warning)).toEqual({
			id: warning,
			state: 'pending',
			resolved_at: null,
			snapshot_urgent: 1
		});
		expect(calls(later)).toMatchObject([{ bookingId: id, marker: 'call_required', reasons: ['warning_overdue'] }]);
	});

	it('lets the worker drop the resolved urgent heat-change row at claim, never sending it (Warning overdue, worker)', () => {
		const setup = () => {
			const id = insertBooking({ start: '2027-01-12T11:00:00Z', createdAt: '2027-01-12T10:00:00Z' });
			insertOutbox(id, 'keybox', 'pending', { dueAt: '2027-01-12T10:00:00Z' });
			const warning = insertOutbox(id, 'heat_change', 'pending', { urgent: true, dueAt: '2027-01-12T10:10:00Z' });
			return { id, warning };
		};
		const state = (rowId: number) => (sqlite.prepare('select state from outbox where id = ?').get(rowId) as { state: string }).state;
		// The keybox row is held (no code set), so the heat-change row is the one due at 10:11.
		const control = setup();
		const claimed = claimDueRow({ now: '2027-01-12T10:11:00Z', db });
		expect(claimed).toMatchObject({ ok: true, row: { id: control.warning } });
		sqlite.exec('delete from outbox; delete from booking');

		const { id, warning } = setup();
		const current: Notice = { heat: 'cold', earliest: '2027-01-12T10:20:00Z', latest: '2027-01-12T10:30:00Z' };
		expect(markCalled({ bookingId: id, notice: serializeNotice(current) }, { now: NOW, db })).toEqual({ ok: true });
		expect(claimDueRow({ now: '2027-01-12T10:11:00Z', db })).toEqual({ ok: false, code: 'none' });
		expect(state(warning)).toBe('cancelled');
		expect(calls('2027-01-12T10:12:00Z')).toEqual([]);
	});

	it('accepts an empty token while the current notice is unknown: rows resolved, last told unchanged', () => {
		const id = insertBooking({ lastTold: HOT });
		const keybox = insertOutbox(id, 'keybox', 'pending'); // overdue since Mon 17:30
		feedSwitch.unknownCurrent = true;
		expect(calls()).toMatchObject([{ bookingId: id, reasons: ['keybox_overdue'] }]);
		expect(markCalled({ bookingId: id, notice: serializeNotice(TOM_COLD) }, { now: NOW, db })).toEqual({ ok: false, code: 'stale' });
		expect(markCalled({ bookingId: id, notice: '' }, { now: NOW, db })).toEqual({ ok: true });
		expect(resolvedAt(keybox)).toBe(NOW);
		expect(lastTold(id)).toBe(serializeNotice(HOT));
		expect(calls()).toEqual([]);
	});

	it('refuses a token that no longer equals the current notice with stale and writes nothing (Stale)', () => {
		const { id } = tom();
		const refused = insertOutbox(id, 'confirmation', 'refused', { dueAt: '2027-01-07T10:00:00Z' });
		// Displayed while a booking before Tom ended at 15:30Z (cold 15:45–15:50); that changed since.
		const displayed: Notice = { heat: 'cold', earliest: '2027-01-12T15:45:00Z', latest: '2027-01-12T15:50:00Z' };
		expect(markCalled({ bookingId: id, notice: serializeNotice(displayed) }, { now: NOW, db })).toEqual({ ok: false, code: 'stale' });
		expect(lastTold(id)).toBe(serializeNotice(HOT));
		expect(resolvedAt(refused)).toBeNull();
		expect(calls()).toHaveLength(1);
	});

	it.each([
		['an empty token while the notice is known', ''],
		['a garbage token', 'x'],
		['a non-canonical token that is not a notice', '{"heat":"warm","earliest":null,"latest":null}']
	])('refuses %s with stale and writes nothing', (_, notice) => {
		const { id } = tom();
		expect(markCalled({ bookingId: id, notice }, { now: NOW, db })).toEqual({ ok: false, code: 'stale' });
		expect(lastTold(id)).toBe(serializeNotice(HOT));
	});

	it('accepts the same notice in another key order (compared by noticeEquals) and stores the canonical form', () => {
		const { id } = tom();
		const reordered = JSON.stringify({ latest: TOM_COLD.latest, earliest: TOM_COLD.earliest, heat: 'cold' });
		expect(markCalled({ bookingId: id, notice: reordered }, { now: NOW, db })).toEqual({ ok: true });
		expect(lastTold(id)).toBe(serializeNotice(TOM_COLD));
	});

	it('refuses with conflict once another admin called, or once the notice went back to the last told one (Gone)', () => {
		const { id } = tom();
		const token = serializeNotice(TOM_COLD);
		expect(markCalled({ bookingId: id, notice: token }, { now: NOW, db })).toEqual({ ok: true });
		expect(markCalled({ bookingId: id, notice: token }, { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });

		const back = insertBooking({ start: '2027-01-13T16:15:00Z', lastTold: { heat: 'cold', earliest: '2027-01-13T15:35:00Z', latest: '2027-01-13T15:45:00Z' } });
		insertOutbox(back, 'keybox', 'accepted', { dueAt: '2027-01-12T16:15:00Z' });
		expect(markCalled({ bookingId: back, notice: serializeNotice(HOT) }, { now: NOW, db })).toEqual({ ok: false, code: 'conflict' });
		expect(lastTold(back)).toBe('{"heat":"cold","earliest":"2027-01-13T15:35:00Z","latest":"2027-01-13T15:45:00Z"}');
	});

	it('refuses a deleted, unknown or malformed booking with not_found, and a started one with past (Gone)', () => {
		const { id } = tom();
		const token = serializeNotice(TOM_COLD);
		expect(markCalled({ bookingId: id, notice: token }, { now: '2027-01-12T16:15:00Z', db })).toEqual({ ok: false, code: 'past' });
		sqlite.prepare('update booking set deleted_at = ? where id = ?').run('2027-01-12T10:05:00Z', id);
		expect(markCalled({ bookingId: id, notice: token }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		for (const bookingId of [999, 0, Number.NaN]) {
			expect(markCalled({ bookingId, notice: token }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		}
		expect(lastTold(id)).toBe(serializeNotice(HOT));
	});

	it('throws a lock timeout (nothing written) while another writer holds the lock (Failure)', () => {
		const { id } = tom();
		const other = openDatabase(join(dir, 'app.sqlite'));
		try {
			other.pragma('busy_timeout = 0');
			sqlite.pragma('busy_timeout = 0');
			other.exec('BEGIN IMMEDIATE');
			let thrown: unknown;
			try {
				markCalled({ bookingId: id, notice: serializeNotice(TOM_COLD) }, { now: NOW, db });
			} catch (e) {
				thrown = e;
			}
			expect(isLockTimeout(thrown)).toBe(true);
			other.exec('ROLLBACK');
			expect(lastTold(id)).toBe(serializeNotice(HOT));
		} finally {
			other.close();
		}
	});
});
