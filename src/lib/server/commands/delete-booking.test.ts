// Story 3.3 matrix: deleteBooking on a temp-file database (season 9 Jan – 30 Apr 2027, changeover
// 15, pre-heat 30–40). Bookings are made through createBooking on Thu 7 Jan; the deletion runs on
// Tue 12 Jan 2027, 10:00 Zurich. Anna 16:00–17:00, Tom 17:15–18:15 (hot, told "Schon heiss um 17:15.").
// Blocks, pre-heat changes and outbox states are written directly, as the spec allows.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveCallList, impactToken, offeredStartTimes, type Notice } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { getAdminBookings, getCallFeed, getDayData, getDeletionImpact, getFutureFlagCandidates } from '../db/queries/index.ts';
import { randomId } from '../ids.ts';
import { createBooking, type CreateBookingInput } from './create-booking.ts';
import { deleteBooking } from './delete-booking.ts';
import { claimDueRow, recordSendOutcome } from './outbox.ts';

const DAY = '2027-01-12';
const BOOK_NOW = '2027-01-07T10:00:00Z';
/** Tue 12 Jan, 10:00 Zurich. */
const NOW = '2027-01-12T09:00:00Z';
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
const HOT_JSON = '{"heat":"hot","earliest":null,"latest":null}';

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-delete-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

/** Books and returns the booking id. */
const book = (start: string, over: Partial<CreateBookingInput> = {}, now = BOOK_NOW): number => {
	const result = createBooking(
		{
			start,
			durationMin: 60,
			partySize: 2,
			name: 'Gast Test',
			email: 'gast@example.ch',
			mobile: '+41791234567',
			locale: 'de',
			submitToken: randomId(),
			displayedNotice: HOT,
			...over
		},
		{ now, db }
	);
	if (!result.ok) throw new Error(`booking failed: ${result.code}`);
	return (sqlite.prepare('select id from booking order by id desc limit 1').get() as { id: number }).id;
};

const annaAndTom = () => {
	const anna = book(at('16:00'), { name: 'Anna Meier' });
	const tom = book(at('17:15'), { name: 'Tom Brunner' });
	return { anna, tom };
};

const tokenFor = (id: number, now = NOW) => {
	const deletion = getDeletionImpact(id, now, db);
	if (!deletion) throw new Error('no deletion impact');
	return impactToken(deletion.impact);
};
const del = (id: number, token = tokenFor(id), now = NOW) => deleteBooking({ bookingId: id, impactToken: token }, { now, db });

const outboxOf = (bookingId: number) =>
	sqlite.prepare('select * from outbox where booking_id = ? order by id').all(bookingId) as Record<string, unknown>[];
const heatRows = (bookingId: number) => outboxOf(bookingId).filter((r) => r.kind === 'heat_change');
const setKeybox = (bookingId: number, state: string) =>
	sqlite
		.prepare("update outbox set state = ?, claimed_at = ? where kind = 'keybox' and booking_id = ?")
		.run(state, state === 'in_flight' ? NOW : null, bookingId);
const bookingRow = (id: number) => sqlite.prepare('select * from booking where id = ?').get(id) as Record<string, unknown>;
let n = 0;
/** A booking written directly (no offer check), with an optional last-told notice; returns its id. */
const insertBooking = (start: string, name: string, lastTold: string | null = null) =>
	Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, 60, 15, ?, 1, 2, 'de', ?, ?, ?, ?)"
			)
			.run(start, BOOK_NOW, `PX${++n}`, `TX${n}`, name, lastTold).lastInsertRowid
	);
/** Everything the command can write, to check that a refusal writes nothing. */
const snapshot = () => JSON.stringify([sqlite.prepare('select * from booking').all(), sqlite.prepare('select * from outbox').all()]);

describe('deleteBooking: Mail', () => {
	it('soft-deletes and upserts one open urgent heat-change row for Tom, due 10:10', () => {
		const { anna, tom } = annaAndTom();
		expect(bookingRow(tom).last_told_notice).toBe(HOT_JSON);
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ class: 'urgent', consequence: 'mail' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(bookingRow(anna).deleted_at).toBe(NOW);
		expect(heatRows(tom)).toEqual([
			expect.objectContaining({ state: 'pending', due_at: '2027-01-12T09:10:00Z', snapshot_urgent: 1 })
		]);
	});

	it('resets an existing open row instead of adding one', () => {
		const { anna, tom } = annaAndTom();
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, snapshot_urgent) values (?, 'heat_change', 'transient_failure', '2027-01-12T08:30:00Z', 0)")
			.run(tom);
		del(anna);
		const rows = heatRows(tom);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ state: 'pending', due_at: '2027-01-12T09:10:00Z', snapshot_urgent: 1 });
	});
});

describe('deleteBooking: open and in-flight heat-change rows of the affected booking', () => {
	it('Mail: resets an existing pending row instead of adding one', () => {
		const { anna, tom } = annaAndTom();
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, snapshot_urgent) values (?, 'heat_change', 'pending', '2027-01-12T08:50:00Z', 0)")
			.run(tom);
		const [before] = heatRows(tom);
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([{ ...before, due_at: '2027-01-12T09:10:00Z', snapshot_urgent: 1 }]);
	});

	it('compares against the snapshot of an in-flight heat-change email, in the preview and in the command', () => {
		const { anna, tom } = annaAndTom();
		// About to be told cold 16:35–16:45: exactly what deleting Anna makes it, so no further change.
		const COLD_JSON = JSON.stringify({ heat: 'cold', earliest: at('16:35'), latest: at('16:45') });
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, claimed_at, snapshot_notice) values (?, 'heat_change', 'in_flight', ?, ?, ?)")
			.run(tom, NOW, NOW, COLD_JSON);
		const impact = getDeletionImpact(anna, NOW, db)?.impact;
		expect(impact).toMatchObject({ told: JSON.parse(COLD_JSON), class: 'none', consequence: 'none' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		// The helper saw the same told notice: nothing upserted beside the in-flight row.
		expect(heatRows(tom).map((r) => r.state)).toEqual(['in_flight']);
	});
});

describe('deleteBooking: Call', () => {
	it.each(['accepted', 'in_flight'])('enqueues nothing for Tom once his keybox row is %s', (state) => {
		const { anna, tom } = annaAndTom();
		setKeybox(tom, state);
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ class: 'urgent', consequence: 'call' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([]);
	});

	describe('Tom’s keybox email retrying (retro D4, C4)', () => {
		/** Mon 11 Jan, 17:20 Zurich: Tom's keybox row was due at 17:15 and is overdue from 17:30. */
		const RETRYING = '2027-01-11T16:20:00Z';
		const OVERDUE = '2027-01-11T16:30:00Z';
		const calls = (now: string) => deriveCallList(getCallFeed(now, db), now);
		const retrying = (dueAt: string) => {
			const { anna, tom } = annaAndTom();
			sqlite
				.prepare("update setting set keybox_code = '4711', keybox_instructions_de = 'Box links.', keybox_instructions_en = 'Box left.' where id = 1")
				.run();
			sqlite.exec("update outbox set state = 'accepted' where kind = 'confirmation'");
			sqlite.prepare("update outbox set state = 'transient_failure', due_at = ? where kind = 'keybox' and booking_id = ?").run(dueAt, tom);
			return { anna, tom };
		};

		it('is a mail before the overdue time; the accepted retry tells the new notice and nothing is left to call', () => {
			const { anna, tom } = retrying(RETRYING);
			const impact = getDeletionImpact(anna, RETRYING, db)?.impact;
			expect(impact).toMatchObject({ class: 'urgent', consequence: 'mail' });
			const TOM_COLD: Notice = { heat: 'cold', earliest: at('16:35'), latest: at('16:45') };
			expect(impact?.current).toEqual(TOM_COLD);
			expect(del(anna, tokenFor(anna, RETRYING), RETRYING)).toEqual({ ok: true, date: DAY });
			// No heat-change row: the keybox retry carries the new notice. Nothing to call meanwhile.
			expect(heatRows(tom)).toEqual([]);
			expect(calls(RETRYING).map((c) => c.bookingId)).not.toContain(tom);
			const retry = '2027-01-11T16:21:00Z';
			const claim = claimDueRow({ now: retry, db });
			expect(claim).toMatchObject({ ok: true, row: { bookingId: tom, kind: 'keybox' } });
			if (!claim.ok) throw new Error('no claim');
			expect(recordSendOutcome(claim.row.id, 'accepted', null, { now: retry, db })).toMatchObject({ ok: true, code: 'accepted' });
			expect(JSON.parse(String(bookingRow(tom).last_told_notice))).toEqual(TOM_COLD);
			expect(calls(retry).map((c) => c.bookingId)).not.toContain(tom);
		});

		it('is a call from the overdue time on, when the call list shows keybox_overdue (C4 overdue)', () => {
			const { anna, tom } = retrying(OVERDUE);
			expect(getDeletionImpact(anna, '2027-01-11T16:29:00Z', db)?.impact.consequence).toBe('mail');
			const tomEntry = (now: string) => calls(now).find((c) => c.bookingId === tom);
			expect(tomEntry(OVERDUE)).toMatchObject({ marker: 'call_required', reasons: ['keybox_overdue'] });
			expect(getDeletionImpact(anna, OVERDUE, db)?.impact).toMatchObject({ class: 'urgent', consequence: 'call' });
			expect(del(anna, tokenFor(anna, OVERDUE), OVERDUE)).toEqual({ ok: true, date: DAY });
			expect(heatRows(tom)).toEqual([]);
			expect(tomEntry(OVERDUE)).toMatchObject({ marker: 'call_required', reasons: ['keybox_overdue'] });
		});
	});

	it('is good news for a cold-told booking the deletion makes hot', () => {
		// Written directly: Tom told cold, keybox sent, and a second booking Ben 16:00–17:00 (beside
		// Anna) keeps Tom hot once Anna is gone. Clean data cannot reach this; the core must still say "optional".
		const { anna, tom } = annaAndTom();
		setKeybox(tom, 'accepted');
		sqlite
			.prepare('update booking set last_told_notice = ? where id = ?')
			.run('{"heat":"cold","earliest":"2027-01-12T15:35:00Z","latest":"2027-01-12T15:45:00Z"}', tom);
		insertBooking(at('16:00'), 'Ben');
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ current: HOT, class: 'good_news', consequence: 'call' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([]);
	});
});

describe('deleteBooking: after the changeover was lowered (retro D1)', () => {
	// Anna 16:00–17:00 and Tom 18:00 back to back, both made with changeover 60; then lowered to 15.
	// The old window (17:00 + 15 + 40 = 17:55) missed Tom.
	const setChangeover = (min: number) => sqlite.prepare('update setting set changeover_min = ? where id = 1').run(min);
	const annaAndTomAt60 = (tomStart = at('18:00')) => {
		setChangeover(60);
		const anna = book(at('16:00'), { name: 'Anna Meier' });
		const tom = book(tomStart, { name: 'Tom Brunner' });
		setChangeover(15);
		return { anna, tom };
	};

	it('finds Tom, now cold: urgent, and upserts his heat-change row', () => {
		const { anna, tom } = annaAndTomAt60();
		expect(bookingRow(tom)).toMatchObject({ changeover_min: 60, last_told_notice: HOT_JSON });
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({
			affected: { id: tom },
			class: 'urgent',
			consequence: 'mail',
			current: { heat: 'cold' }
		});
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([expect.objectContaining({ state: 'pending', due_at: '2027-01-12T09:10:00Z', snapshot_urgent: 1 })]);
	});

	it('lets a booking between Anna and Tom shield Tom', () => {
		const { anna, tom } = annaAndTomAt60();
		const ben = insertBooking(at('17:15'), 'Ben', HOT_JSON);
		expect(getDeletionImpact(anna, NOW, db)?.impact.affected?.id).toBe(ben);
		del(anna);
		expect(heatRows(tom)).toEqual([]);
	});

	it('finds nothing beyond 60 + 40 minutes after the end', () => {
		setChangeover(60);
		const anna = book(at('16:00'));
		const later = insertBooking(at('18:45'), 'Ben', HOT_JSON);
		setChangeover(15);
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ affected: null, consequence: 'none' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(later)).toEqual([]);
	});
});

describe('deleteBooking: No effect', () => {
	it('enqueues nothing when no booking is within the window', () => {
		const anna = book(at('16:00'));
		const later = book(at('19:00'));
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ affected: null, consequence: 'none' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(later)).toEqual([]);
	});

	it('enqueues nothing when a block sits between (the next booking stays as told)', () => {
		const anna = book(at('16:00'));
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:05'), at('17:35'));
		// Ben 17:50 is cold from the block's end: collapsed to 17:35, with or without Anna.
		const ben = insertBooking(at('17:50'), 'Ben', '{"heat":"cold","earliest":"2027-01-12T16:35:00Z","latest":null}');
		const deletion = getDeletionImpact(anna, NOW, db);
		expect(deletion?.impact).toMatchObject({ affected: { id: ben }, class: 'none', consequence: 'none' });
		del(anna);
		expect(heatRows(ben)).toEqual([]);
	});

	it('enqueues nothing when Tom has no told notice', () => {
		const { anna, tom } = annaAndTom();
		sqlite.prepare('update booking set last_told_notice = null where id = ?').run(tom);
		expect(getDeletionImpact(anna, NOW, db)?.impact).toMatchObject({ told: null, consequence: 'none' });
		expect(del(anna)).toEqual({ ok: true, date: DAY });
		expect(heatRows(tom)).toEqual([]);
	});
});

describe('deleteBooking: Stale', () => {
	it('refuses after a new booking changed the impact, and writes nothing', () => {
		const anna = book(at('16:00'));
		const token = tokenFor(anna);
		book(at('17:15'));
		const before = snapshot();
		expect(del(anna, token)).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses after a block changed the impact, and writes nothing', () => {
		const { anna } = annaAndTom();
		const token = tokenFor(anna);
		sqlite.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'cleaning')").run(at('17:00'), at('17:10'));
		const before = snapshot();
		expect(del(anna, token)).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses after a pre-heat change changed the impact, and writes nothing', () => {
		const { anna } = annaAndTom();
		const token = tokenFor(anna);
		sqlite.prepare('update setting set preheat_min_min = 40, preheat_max_min = 50 where id = 1').run();
		const before = snapshot();
		expect(del(anna, token)).toEqual({ ok: false, code: 'stale' });
		expect(snapshot()).toBe(before);
	});

	it('refuses a token that is not an impact token at all', () => {
		const { anna } = annaAndTom();
		expect(del(anna, 'x')).toEqual({ ok: false, code: 'stale' });
		expect(bookingRow(anna).deleted_at).toBeNull();
	});
});

describe('deleteBooking: Past and Gone', () => {
	it('refuses a booking whose start has come, before the token check, and writes nothing', () => {
		const { anna } = annaAndTom();
		const before = snapshot();
		expect(del(anna, 'x', at('16:00'))).toEqual({ ok: false, code: 'past' });
		expect(snapshot()).toBe(before);
	});

	it('refuses an already deleted booking and an unknown id with not_found', () => {
		const { anna } = annaAndTom();
		const token = tokenFor(anna);
		expect(del(anna, token)).toEqual({ ok: true, date: DAY });
		const before = snapshot();
		expect(del(anna, token)).toEqual({ ok: false, code: 'not_found' });
		expect(deleteBooking({ bookingId: 9999, impactToken: token }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(deleteBooking({ bookingId: Number.NaN, impactToken: token }, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(snapshot()).toBe(before);
	});
});

describe('deleteBooking: Cleanup', () => {
	it('cancels its pending and transient rows of every kind and leaves finished rows', () => {
		const { anna } = annaAndTom();
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, outcome_at) values (?, 'heat_change', 'accepted', '2027-01-08T10:00:00Z', '2027-01-08T10:00:05Z')")
			.run(anna);
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'heat_change', 'transient_failure', '2027-01-12T08:00:00Z')").run(anna);
		del(anna);
		expect(outboxOf(anna).map((r) => [r.kind, r.state, r.outcome_at])).toEqual([
			['confirmation', 'cancelled', NOW],
			['keybox', 'cancelled', NOW],
			['heat_change', 'accepted', '2027-01-08T10:00:05Z'],
			['heat_change', 'cancelled', NOW]
		]);
	});

	it('leaves an accepted confirmation untouched', () => {
		const { anna } = annaAndTom();
		sqlite.prepare("update outbox set state = 'accepted', outcome_at = ? where kind = 'confirmation' and booking_id = ?").run(BOOK_NOW, anna);
		del(anna);
		expect(outboxOf(anna).map((r) => [r.kind, r.state])).toEqual([
			['confirmation', 'accepted'],
			['keybox', 'cancelled']
		]);
	});

	it('takes Anna off the guest day (16:00 offered again), the admin day, the next bookings and the call list', () => {
		const { anna } = annaAndTom();
		// Anna on the call list: told hot, now cold, keybox email sent.
		setKeybox(anna, 'accepted');
		sqlite.prepare('update booking set last_told_notice = ? where id = ?').run(HOT_JSON, anna);
		const offered = () => {
			const { settings, seasons, bookings, blocks } = getDayData(DAY, db);
			return offeredStartTimes({ date: DAY, bookings, blocks, settings, seasons, now: NOW }).map((o) => o.start);
		};
		const calls = () => deriveCallList(getCallFeed(NOW, db), NOW).map((c) => c.bookingId);
		expect(offered()).not.toContain(at('16:00'));
		expect(calls()).toContain(anna);
		del(anna);
		expect(offered()).toContain(at('16:00'));
		expect(getAdminBookings(at('00:00'), at('23:59'), db).map((b) => b.id)).not.toContain(anna);
		expect(getFutureFlagCandidates(NOW, db).map((b) => b.id)).not.toContain(anna);
		expect(calls()).not.toContain(anna);
	});
});

describe('deleteBooking: FR-12', () => {
	it('upserts nothing when the deletion undoes a change; the claim cancels the open row and sends nothing', () => {
		const SAT = '2027-01-16';
		const COLD = { heat: 'cold' as const, earliest: at('17:50', SAT), latest: at('18:00', SAT) };
		const jonas = book(at('18:30', SAT), { name: 'Jonas', displayedNotice: COLD });
		const told = bookingRow(jonas).last_told_notice;
		expect(told).toBe(JSON.stringify(COLD));
		// 17:15–18:15 makes Jonas hot: one open (good-news) row.
		const other = book(at('17:15', SAT), {}, BOOK_NOW);
		expect(heatRows(jonas)).toEqual([expect.objectContaining({ state: 'pending', due_at: '2027-01-07T10:10:00Z' })]);
		// Deleted 5 min later: Jonas is back to what he was told.
		sqlite.exec("update outbox set state = 'accepted' where kind = 'confirmation'");
		const later = '2027-01-07T10:05:00Z';
		expect(getDeletionImpact(other, later, db)?.impact.consequence).toBe('none');
		const [open] = heatRows(jonas);
		expect(del(other, tokenFor(other, later), later)).toEqual({ ok: true, date: SAT });
		expect(heatRows(jonas)).toEqual([open]);
		// At its due time the claim's recheck finds nothing to tell.
		expect(claimDueRow({ now: '2027-01-07T10:10:00Z', db })).toEqual({ ok: false, code: 'none' });
		expect(heatRows(jonas)).toEqual([expect.objectContaining({ state: 'cancelled', outcome_at: '2027-01-07T10:10:00Z', snapshot_notice: null })]);
		expect(bookingRow(jonas).last_told_notice).toBe(told);
	});
});
