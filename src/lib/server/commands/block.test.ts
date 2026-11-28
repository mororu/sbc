// Story 3.5 matrix: createBlock and deleteBlock on a temp-file database (season 9 Jan – 30 Apr 2027,
// changeover 15, pre-heat 30–40). `now` is Mon 11 Jan 2027, 08:00 Zurich. Bookings, blocks, told
// notices and keybox rows are written directly, as the spec allows; the tokens come from the same
// queries the dialogs use (`getBlockCheck`, `getBlockDeletion`).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { impactToken, offeredStartTimes } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { getBlockCheck, getBlockDeletion, getDayData, getDeletionImpact } from '../db/queries/index.ts';
import { loadDayView } from '../day-view.ts';
import { createBlock } from './create-block.ts';
import { deleteBlock } from './delete-block.ts';
import { deleteBooking } from './delete-booking.ts';

const DAY = '2027-01-11';
/** Mon 11 Jan, 08:00 Zurich. */
const NOW = '2027-01-11T07:00:00Z';
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const cold = (earliest: string, latest: string | null) =>
	JSON.stringify({ heat: 'cold', earliest: at(earliest), latest: latest === null ? null : at(latest) });

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-block-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

let n = 0;
/** A booking written directly, with an optional last-told notice and keybox row; returns its id. */
const insertBooking = (
	start: string,
	name: string,
	over: { lastTold?: string | null; keybox?: string | null; createdAt?: string } = {}
) => {
	const id = Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, 60, 15, ?, 1, 2, 'de', ?, ?, ?, ?)"
			)
			.run(start, over.createdAt ?? '2027-01-07T10:00:00Z', `PB${++n}`, `TB${n}`, name, over.lastTold ?? null).lastInsertRowid
	);
	if (over.keybox) {
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, claimed_at) values (?, 'keybox', ?, '2027-01-10T18:00:00Z', ?)")
			.run(id, over.keybox, over.keybox === 'in_flight' ? NOW : null);
	}
	return id;
};
const insertBlock = (start: string, end: string, reason = 'cleaning') =>
	Number(sqlite.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)').run(start, end, reason).lastInsertRowid);
const blocks = () => sqlite.prepare('select start_at, end_at, reason from block order by id').all();
const heatRows = (bookingId: number) =>
	sqlite.prepare("select * from outbox where booking_id = ? and kind = 'heat_change' order by id").all(bookingId) as Record<string, unknown>[];
/** Everything the commands can write, to check that a refusal writes nothing. */
const snapshot = () =>
	JSON.stringify([sqlite.prepare('select * from booking').all(), sqlite.prepare('select * from block').all(), sqlite.prepare('select * from outbox').all()]);

const checkToken = (start: string, end: string, now = NOW) => impactToken(getBlockCheck({ start, end }, now, db).impact);
const save = (start: string, end: string, over: { reason?: string; token?: string; now?: string } = {}) =>
	createBlock(
		{ start, end, reason: over.reason ?? 'cleaning', impactToken: over.token ?? checkToken(start, end, over.now) },
		{ now: over.now ?? NOW, db }
	);
const deletionToken = (id: number) => {
	const deletion = getBlockDeletion(id, NOW, db);
	if (!deletion) throw new Error('no block deletion');
	return impactToken(deletion.impact);
};
const remove = (id: number, token = deletionToken(id), now = NOW) => deleteBlock({ blockId: id, impactToken: token }, { now, db });

/** The Mail row: cold 18:00, told 17:20–17:30. */
const mailBooking = (keybox: string | null = 'pending') => insertBooking(at('18:00'), 'Lena Graf', { lastTold: cold('17:20', '17:30'), keybox });

describe('createBlock: Overlap', () => {
	it('is refused with conflict, naming the bookings with first names; nothing written', () => {
		insertBooking(at('18:00'), 'Anna Meier');
		insertBooking(at('19:30'), 'Ben Huber');
		const check = getBlockCheck({ start: at('18:30'), end: at('20:00') }, NOW, db);
		expect(check.conflict).toEqual({
			kind: 'overlap',
			bookings: [
				{ start: at('18:00'), firstName: 'Anna' },
				{ start: at('19:30'), firstName: 'Ben' }
			]
		});
		const before = snapshot();
		expect(save(at('18:30'), at('20:00'))).toEqual({ ok: false, code: 'conflict' });
		expect(snapshot()).toBe(before);
	});
});

describe('createBlock: Gap', () => {
	it.each([
		['18:00', '18:15'],
		['18:05', '18:10']
	])('refuses %s–%s inside a back-to-back changeover', (start, end) => {
		insertBooking(at('17:00'), 'Anna');
		insertBooking(at('18:15'), 'Ben', { createdAt: '2027-01-08T10:00:00Z' });
		expect(getBlockCheck({ start: at(start), end: at(end) }, NOW, db).conflict).toEqual({ kind: 'gap' });
		const before = snapshot();
		expect(save(at(start), at(end))).toEqual({ ok: false, code: 'conflict' });
		expect(snapshot()).toBe(before);
	});
});

describe('createBlock: Adjacent', () => {
	it('saves a block right after a booking with no gap pair', () => {
		insertBooking(at('18:00'), 'Anna');
		expect(save(at('19:00'), at('19:30'))).toEqual({ ok: true, id: 1, date: DAY });
		expect(blocks()).toEqual([{ start_at: at('19:00'), end_at: at('19:30'), reason: 'cleaning' }]);
	});

	it('saves a block overlapping another block', () => {
		insertBlock(at('09:00'), at('11:00'));
		expect(save(at('10:00'), at('12:00'), { reason: 'maintenance' })).toMatchObject({ ok: true });
		expect(blocks()).toHaveLength(2);
	});
});

describe('createBlock: Mail', () => {
	it('shows the later earliest arrival and upserts one open urgent heat-change row due 08:10', () => {
		const lena = mailBooking();
		const check = getBlockCheck({ start: at('16:00'), end: at('17:25') }, NOW, db);
		expect(check).toMatchObject({
			date: DAY,
			past: false,
			conflict: null,
			affectedFirstName: 'Lena',
			impact: {
				affected: { id: lena },
				current: { heat: 'cold', earliest: at('17:25'), latest: at('17:30') },
				class: 'urgent',
				consequence: 'mail'
			}
		});
		expect(save(at('16:00'), at('17:25'))).toMatchObject({ ok: true, date: DAY });
		expect(heatRows(lena)).toEqual([expect.objectContaining({ state: 'pending', due_at: '2027-01-11T07:10:00Z', snapshot_urgent: 1 })]);
	});
});

describe('createBlock: Call', () => {
	it.each(['accepted', 'in_flight'])('enqueues nothing once the keybox row is %s', (state) => {
		const lena = mailBooking(state);
		expect(getBlockCheck({ start: at('16:00'), end: at('17:25') }, NOW, db).impact).toMatchObject({ class: 'urgent', consequence: 'call' });
		expect(save(at('16:00'), at('17:25'))).toMatchObject({ ok: true });
		expect(heatRows(lena)).toEqual([]);
	});

	it('is a mail while the keybox email is retrying, and enqueues nothing: the retry carries the notice (retro D4)', () => {
		// Lena's keybox row is due Sun 10 Jan 18:00 Zurich and overdue from 18:15.
		const retrying = '2027-01-10T17:10:00Z';
		const lena = mailBooking('transient_failure');
		expect(getBlockCheck({ start: at('16:00'), end: at('17:25') }, retrying, db).impact).toMatchObject({ class: 'urgent', consequence: 'mail' });
		expect(save(at('16:00'), at('17:25'), { now: retrying })).toMatchObject({ ok: true });
		expect(heatRows(lena)).toEqual([]);
	});

	it('is a call once the retrying keybox email is overdue (C4 overdue)', () => {
		mailBooking('transient_failure');
		expect(getBlockCheck({ start: at('16:00'), end: at('17:25') }, NOW, db).impact).toMatchObject({ class: 'urgent', consequence: 'call' });
	});
});

describe('createBlock: No effect', () => {
	it('enqueues nothing without a booking in the window', () => {
		const later = insertBooking(at('20:00'), 'Tom', { lastTold: cold('19:20', '19:30'), keybox: 'pending' });
		expect(getBlockCheck({ start: at('09:00'), end: at('11:00') }, NOW, db).impact).toMatchObject({ affected: null, consequence: 'none' });
		expect(save(at('09:00'), at('11:00'))).toMatchObject({ ok: true });
		expect(heatRows(later)).toEqual([]);
	});
});

describe('createBlock: Past and Invalid', () => {
	it('refuses a start at or before now with past, before the conflict and token checks; nothing written', () => {
		insertBooking(at('07:30'), 'Anna');
		const before = snapshot();
		expect(save(at('08:00'), at('09:00'), { token: 'x' })).toEqual({ ok: false, code: 'past' });
		expect(save(at('07:00'), at('09:00'), { token: 'x' })).toEqual({ ok: false, code: 'past' });
		expect(snapshot()).toBe(before);
	});

	it.each([
		['an end not after the start', at('10:00'), at('10:00'), 'cleaning'],
		['a block across midnight', at('23:00'), at('00:30', '2027-01-12'), 'cleaning'],
		['a malformed instant', '2027-01-11T10:00Z', at('11:00'), 'cleaning'],
		['an unknown reason', at('10:00'), at('11:00'), 'party'],
		['a start off the 5-minute step (09:03)', at('09:03'), at('11:00'), 'cleaning'],
		['an end off the 5-minute step', at('09:00'), at('10:58'), 'cleaning'],
		['an instant with seconds', '2027-01-11T08:00:30Z', at('11:00'), 'cleaning']
	])('refuses %s with invalid', (_, start, end, reason) => {
		expect(createBlock({ start, end, reason, impactToken: 'x' }, { now: NOW, db })).toEqual({ ok: false, code: 'invalid' });
		expect(blocks()).toEqual([]);
	});
});

describe('createBlock: Stale', () => {
	it('refuses after a booking changed the impact; nothing written', () => {
		const token = checkToken(at('16:00'), at('17:25'));
		mailBooking();
		const before = snapshot();
		expect(save(at('16:00'), at('17:25'), { token })).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses after another block changed the impact; nothing written', () => {
		mailBooking();
		const token = checkToken(at('16:00'), at('17:25'));
		insertBlock(at('17:20'), at('17:28'));
		const before = snapshot();
		expect(save(at('16:00'), at('17:25'), { token })).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses after a pre-heat change changed the impact; nothing written', () => {
		mailBooking();
		const token = checkToken(at('16:00'), at('17:25'));
		sqlite.prepare('update setting set preheat_min_min = 40, preheat_max_min = 50 where id = 1').run();
		const before = snapshot();
		expect(save(at('16:00'), at('17:25'), { token })).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});
});

describe('Stale chain', () => {
	it('a block saved while a delete-booking dialog is open makes deleteBooking stale', () => {
		// Anna 16:00–17:00, Tom 17:40 told 17:00–17:10: exactly what deleting Anna gives him.
		const anna = insertBooking(at('16:00'), 'Anna');
		insertBooking(at('17:40'), 'Tom', { lastTold: cold('17:00', '17:10'), keybox: 'pending' });
		const deletion = getDeletionImpact(anna, NOW, db);
		expect(deletion?.impact.consequence).toBe('none');
		const token = impactToken(deletion!.impact);
		// A block 17:05–17:20 (no back-to-back pair): with Anna gone, Tom now arrives at 17:20.
		expect(save(at('17:05'), at('17:20'))).toMatchObject({ ok: true });
		expect(getDeletionImpact(anna, NOW, db)?.impact.class).toBe('urgent');
		expect(deleteBooking({ bookingId: anna, impactToken: token }, { now: NOW, db })).toEqual({ ok: false, code: 'stale' });
	});
});

describe('deleteBlock: No effect', () => {
	it('removes the row and enqueues nothing when the arrival range only widens', () => {
		const id = insertBlock(at('09:00'), at('11:00'));
		// Cold 11:30, told the clamped "11:00": without the block 10:50–11:00 (only widened).
		const ben = insertBooking(at('11:30'), 'Ben', { lastTold: cold('11:00', null), keybox: 'pending' });
		expect(getBlockDeletion(id, NOW, db)?.impact).toMatchObject({ affected: { id: ben }, class: 'none', consequence: 'none' });
		expect(remove(id)).toEqual({ ok: true, date: DAY });
		expect(blocks()).toEqual([]);
		expect(heatRows(ben)).toEqual([]);
	});
});

describe('deleteBlock: good news', () => {
	it('upserts one open good-news row for the booking that becomes hot', () => {
		insertBooking(at('16:00'), 'Anna');
		const id = insertBlock(at('17:00'), at('17:15'));
		const ben = insertBooking(at('17:15'), 'Ben', { lastTold: cold('17:15', null), keybox: 'pending' });
		expect(getBlockDeletion(id, NOW, db)).toMatchObject({
			affectedFirstName: 'Ben',
			impact: { current: { heat: 'hot' }, class: 'good_news', consequence: 'mail' }
		});
		expect(remove(id)).toEqual({ ok: true, date: DAY });
		expect(heatRows(ben)).toEqual([expect.objectContaining({ state: 'pending', due_at: '2027-01-11T07:10:00Z', snapshot_urgent: 0 })]);
	});

	it('removes only one of two blocks with the same start and end from the impact', () => {
		insertBooking(at('16:00'), 'Anna');
		const first = insertBlock(at('17:00'), at('17:15'));
		insertBlock(at('17:00'), at('17:15'), 'maintenance');
		insertBooking(at('17:15'), 'Ben', { lastTold: cold('17:15', null), keybox: 'pending' });
		expect(getBlockDeletion(first, NOW, db)?.impact.consequence).toBe('none');
	});
});

describe('deleteBlock: after the changeover was lowered (retro D1)', () => {
	it('finds the booking behind a block that is hot without it, against the stored changeover 60', () => {
		// Anna 16:00–17:00 and Tom 18:00, both made with changeover 60 (now 15); block 17:00–17:04.
		// The old window (17:04 + 15 + 40 = 17:59) missed Tom.
		const anna = insertBooking(at('16:00'), 'Anna');
		const tom = insertBooking(at('18:00'), 'Tom', { lastTold: cold('17:20', '17:30'), keybox: 'pending', createdAt: '2027-01-08T10:00:00Z' });
		sqlite.prepare('update booking set changeover_min = 60 where id in (?, ?)').run(anna, tom);
		const id = insertBlock(at('17:00'), at('17:04'));
		expect(getBlockDeletion(id, NOW, db)?.impact).toMatchObject({
			affected: { id: tom },
			current: { heat: 'hot' },
			class: 'good_news',
			consequence: 'mail'
		});
		expect(remove(id)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([expect.objectContaining({ state: 'pending', due_at: '2027-01-11T07:10:00Z', snapshot_urgent: 0 })]);
	});
});

describe('deleteBlock: Past, Stale and Gone', () => {
	it('refuses a started block with past, before the token check; nothing written', () => {
		const id = insertBlock(at('07:30'), at('09:00'));
		const before = snapshot();
		expect(remove(id, 'x')).toEqual({ ok: false, code: 'past' });
		expect(snapshot()).toBe(before);
	});

	it.each([
		['a booking', false, () => insertBooking(at('11:15'), 'Ben', { lastTold: cold('11:00', null) })],
		['a block', true, () => insertBlock(at('11:00'), at('11:10'))],
		['a pre-heat change', true, () => sqlite.prepare('update setting set preheat_min_min = 40, preheat_max_min = 50 where id = 1').run()]
	])('refuses with stale after %s changed the impact; nothing written', (_, withBen, change) => {
		const id = insertBlock(at('09:00'), at('11:00'));
		if (withBen) insertBooking(at('11:15'), 'Ben', { lastTold: cold('11:00', null) });
		const token = deletionToken(id);
		change();
		const before = snapshot();
		expect(remove(id, token)).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses a block another admin deleted, and an unknown id, with not_found', () => {
		const id = insertBlock(at('09:00'), at('11:00'));
		const token = deletionToken(id);
		expect(remove(id, token)).toEqual({ ok: true, date: DAY });
		expect(remove(id, token)).toEqual({ ok: false, code: 'not_found' });
		expect(deleteBlock({ blockId: Number.NaN, impactToken: token }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
	});
});

describe('Guest', () => {
	it('shows a saved block as a taken row without its reason, refuses an overlapping booking, and offers 11:30 cold after 11:10', async () => {
		expect(save(at('09:00'), at('11:00'))).toMatchObject({ ok: true });
		const view = loadDayView(DAY, 'de', { now: NOW, db });
		const text = JSON.stringify(view);
		expect(text).not.toMatch(/cleaning|Reinigung/);
		expect(text).toContain('bis 11:00');
		const offered = () => {
			const { settings, seasons, bookings, blocks } = getDayData(DAY, db);
			return offeredStartTimes({ date: DAY, bookings, blocks, settings, seasons, now: NOW });
		};
		expect(offered().map((o) => o.start)).not.toContain(at('10:30'));
		sqlite.exec('delete from block');
		expect(save(at('09:00'), at('11:10'))).toMatchObject({ ok: true });
		const first = offered()[0];
		expect(first.start).toBe(at('11:30'));
		expect(first.notice.heat).toBe('cold');
	});
});
