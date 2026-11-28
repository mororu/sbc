// Story 3.7 matrix: changeSettings and getPreheatImpact on a temp-file database. `now` is Tue 12 Jan
// 2027, 11:06 Zurich; the seed: 10:00–22:00, changeover 15, pre-heat 30–40, horizon 14, season
// 9 Jan – 30 Apr 2027. Bookings, told notices and keybox rows are written directly; the pre-heat
// tokens come from `getPreheatImpact`, the query the dialog uses.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calendarState, deriveCallList, impactToken, offeredStartTimes, selectableDays } from '#lib/domain/index.ts';
import { addDays, addMinutes, toInstant } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import {
	getCallFeed,
	getDayData,
	getDeletionImpact,
	getOldCodeBookings,
	getPreheatImpact,
	getSeasons,
	getSettings
} from '../db/queries/index.ts';
import { changeSettings, type ChangeSettingsInput } from './change-settings.ts';
import { deleteBooking } from './delete-booking.ts';
import { claimDueRow } from './outbox.ts';

const DAY = '2027-01-12';
/** Tue 12 Jan 2027, 11:06 Zurich. */
const NOW = '2027-01-12T10:06:00Z';
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const cold = (earliest: string, latest: string, date = DAY) =>
	JSON.stringify({ heat: 'cold', earliest: at(earliest, date), latest: at(latest, date) });
const HOT = JSON.stringify({ heat: 'hot', earliest: null, latest: null });

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-settings-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

let n = 0;
const insertBooking = (start: string, over: { durationMin?: number; lastTold?: string | null; keybox?: string } = {}) => {
	const id = Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, ?, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'Lena Graf', ?)"
			)
			.run(start, over.durationMin ?? 60, `PS${++n}`, `TS${n}`, over.lastTold ?? null).lastInsertRowid
	);
	if (over.keybox) {
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'keybox', ?, '2027-01-11T17:00:00Z')").run(id, over.keybox);
	}
	return id;
};
const bookings = () => JSON.stringify(sqlite.prepare('select * from booking order by id').all());
const outbox = () => sqlite.prepare('select * from outbox order by id').all() as Record<string, unknown>[];
const heatRows = () => outbox().filter((r) => r.kind === 'heat_change');
const settingRow = () => sqlite.prepare('select * from setting').get() as Record<string, unknown>;
const seasonRows = () => sqlite.prepare('select * from season order by id').all() as Record<string, unknown>[];
const change = (input: ChangeSettingsInput, now = NOW) => changeSettings(input, { now, db });
const preheatToken = (minMin: number, maxMin: number) => getPreheatImpact({ minMin, maxMin }, NOW, db).token;
const savePreheat = (minMin: number, maxMin: number, token = preheatToken(minMin, maxMin)) =>
	change({ card: 'preheat', minMin, maxMin, impactToken: token });
const offered = (date = DAY) => {
	const { settings, seasons, bookings, blocks } = getDayData(date, db);
	return offeredStartTimes({ date, bookings, blocks, settings, seasons, now: NOW });
};

describe('Changeover', () => {
	it('15 → 30: the booking keeps its changeover, nothing is enqueued, the next kind-2 start is 18:30', () => {
		insertBooking(at('17:00'));
		const kind2 = () => offered().filter((o) => o.kinds.includes(2)).map((o) => o.start);
		expect(kind2()).toEqual([at('18:15')]);
		const before = bookings();
		expect(change({ card: 'changeover', changeoverMin: 30 })).toEqual({ ok: true });
		expect(settingRow().changeover_min).toBe(30);
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
		expect(kind2()).toEqual([at('18:30')]);
		expect(offered().map((o) => o.start)).not.toContain(at('18:15'));
	});
});

describe('Hours', () => {
	it('12:00–21:00: saved, the 20:30–21:30 booking stays, nothing enqueued; no start before 12:00 or ending after 21:00', () => {
		insertBooking(at('20:30'), { lastTold: HOT });
		const before = bookings();
		expect(change({ card: 'hours', openMinute: 720, closeMinute: 1260 })).toEqual({ ok: true });
		expect(settingRow()).toMatchObject({ open_minute: 720, close_minute: 1260 });
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
		const day = '2027-01-13';
		const starts = offered(day);
		expect(starts.length).toBeGreaterThan(0);
		for (const o of starts) {
			expect(o.start >= at('12:00', day)).toBe(true);
			for (const d of o.durations) expect(addMinutes(o.start, d) <= at('21:00', day)).toBe(true);
		}
	});
});

describe('Horizon', () => {
	it('14 → 21: selectable to today + 21, bookings unchanged', () => {
		insertBooking(at('18:00'));
		const last = () => selectableDays({ seasons: getSeasons(db), settings: getSettings(db), now: NOW }).at(-1);
		expect(last()).toBe(addDays(DAY, 14));
		const before = bookings();
		expect(change({ card: 'horizon', horizonDays: 21 })).toEqual({ ok: true });
		expect(last()).toBe(addDays(DAY, 21));
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
	});
});

describe('getPreheatImpact', () => {
	it('30–40 → 40–50: the cold 18:00 booking told 17:20–17:30 changes; a hot one and one without a told notice do not', () => {
		const lena = insertBooking(at('18:00'), { lastTold: cold('17:20', '17:30') });
		// 19:15 after Lena's end + changeover: hot either way.
		insertBooking(at('19:15'), { lastTold: HOT });
		// Nothing told yet: no change worth telling.
		insertBooking(at('18:00', '2027-01-14'));
		// Started already: not a future booking.
		insertBooking(at('11:00'), { lastTold: cold('10:20', '10:30') });
		const impact = getPreheatImpact({ minMin: 40, maxMin: 50 }, NOW, db);
		expect(impact.from).toEqual({ minMin: 30, maxMin: 40 });
		expect(impact.to).toEqual({ minMin: 40, maxMin: 50 });
		expect(impact.changed).toHaveLength(1);
		expect(impact.changed[0]).toMatchObject({
			affected: expect.objectContaining({ id: lena }),
			current: { heat: 'cold', earliest: at('17:10'), latest: at('17:20') },
			consequence: 'mail'
		});
		expect(impact.token).toBe(JSON.stringify([impact.from, impact.to, impact.changed.map(impactToken)]));
	});
});

describe('Preheat save', () => {
	it('saves the window and enqueues one urgent heat change due now + 10; a keybox-phase booking gets no row and is on the call list', () => {
		const lena = insertBooking(at('18:00'), { lastTold: cold('17:20', '17:30') });
		const tom = insertBooking(at('18:00', '2027-01-13'), { lastTold: cold('17:20', '17:30', '2027-01-13'), keybox: 'accepted' });
		const before = bookings();
		expect(savePreheat(40, 50)).toEqual({ ok: true });
		expect(settingRow()).toMatchObject({ preheat_min_min: 40, preheat_max_min: 50 });
		expect(bookings()).toBe(before);
		expect(heatRows()).toEqual([
			expect.objectContaining({ booking_id: lena, state: 'pending', snapshot_urgent: 1, due_at: addMinutes(NOW, 10) })
		]);
		expect(heatRows().some((r) => r.booking_id === tom)).toBe(false);
		expect(deriveCallList(getCallFeed(NOW, db), NOW)).toEqual([
			expect.objectContaining({ bookingId: tom, marker: 'call_required', heatChange: 'urgent' })
		]);
		// The notice Lena gets is 17:10–17:20.
		expect(getPreheatImpact({ minMin: 40, maxMin: 50 }, NOW, db).changed[0].current).toEqual({
			heat: 'cold',
			earliest: at('17:10'),
			latest: at('17:20')
		});
	});
});

describe('Preheat stale', () => {
	it('refuses when another booking changed since the check; nothing saved', () => {
		insertBooking(at('18:00'), { lastTold: cold('17:20', '17:30') });
		const token = preheatToken(40, 50);
		insertBooking(at('18:00', '2027-01-14'), { lastTold: cold('17:20', '17:30', '2027-01-14') });
		const before = JSON.stringify([bookings(), outbox(), settingRow()]);
		expect(savePreheat(40, 50, token)).toEqual({ ok: false, code: 'stale' });
		expect(JSON.stringify([bookings(), outbox(), settingRow()])).toBe(before);
		// The new impact counts both.
		expect(getPreheatImpact({ minMin: 40, maxMin: 50 }, NOW, db).changed).toHaveLength(2);
	});

	it('is not refused for a change to a booking the window does not move', () => {
		insertBooking(at('18:00'), { lastTold: cold('17:20', '17:30') });
		const token = preheatToken(40, 50);
		insertBooking(at('19:15'), { lastTold: HOT });
		expect(savePreheat(40, 50, token)).toEqual({ ok: true });
	});
});

describe('Delete stale', () => {
	it('a delete dialog opened before a pre-heat save is stale', () => {
		const anna = insertBooking(at('16:00'), { lastTold: HOT });
		insertBooking(at('17:15'), { lastTold: HOT });
		const deletion = getDeletionImpact(anna, NOW, db);
		if (!deletion) throw new Error('no deletion impact');
		const token = impactToken(deletion.impact);
		expect(savePreheat(40, 50)).toEqual({ ok: true });
		expect(deleteBooking({ bookingId: anna, impactToken: token }, { now: NOW, db })).toEqual({ ok: false, code: 'stale' });
	});
});

describe('Unchanged preheat', () => {
	it('30–40 → 30–40 saves nothing and writes no rows, whatever the token', () => {
		insertBooking(at('18:00'), { lastTold: cold('17:10', '17:20') });
		const before = JSON.stringify([bookings(), settingRow()]);
		expect(change({ card: 'preheat', minMin: 30, maxMin: 40, impactToken: 'anything' })).toEqual({ ok: true });
		expect(JSON.stringify([bookings(), settingRow()])).toBe(before);
		expect(outbox()).toEqual([]);
	});
});

describe('Invalid', () => {
	it.each<[string, ChangeSettingsInput]>([
		['changeover 7', { card: 'changeover', changeoverMin: 7 }],
		['changeover 65', { card: 'changeover', changeoverMin: 65 }],
		['preheat 50–40', { card: 'preheat', minMin: 50, maxMin: 40, impactToken: '' }],
		['preheat 10–40', { card: 'preheat', minMin: 10, maxMin: 40, impactToken: '' }],
		['horizon 0', { card: 'horizon', horizonDays: 0 }],
		['horizon 1.5', { card: 'horizon', horizonDays: 1.5 }],
		['close = open', { card: 'hours', openMinute: 720, closeMinute: 720 }],
		['close before open', { card: 'hours', openMinute: 720, closeMinute: 600 }],
		['hours off step', { card: 'hours', openMinute: 721, closeMinute: 1260 }],
		['empty instructions', { card: 'instructions', de: ' ', en: 'Box left.' }],
		['bad email', { card: 'contact', contact: 'sauna@' }],
		['unknown card', { card: 'nope' } as unknown as ChangeSettingsInput],
		['season without dates', { card: 'season' } as unknown as ChangeSettingsInput],
		['season end before start', { card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-08' }],
		['season end = start', { card: 'season', id: null, startDate: '2027-12-20', endDate: '2027-12-20' }],
		['season bad date', { card: 'season', id: null, startDate: '2027-02-30', endDate: '2027-04-30' }],
		['season id 0', { card: 'season', id: 0, startDate: '2027-01-09', endDate: '2027-04-30' }],
		['blank code', { card: 'keybox', code: '  ' }]
	])('refuses %s and saves nothing', (_, input) => {
		const before = JSON.stringify([settingRow(), seasonRows()]);
		expect(change(input)).toEqual({ ok: false, code: 'invalid' });
		expect(JSON.stringify([settingRow(), seasonRows()])).toBe(before);
		expect(outbox()).toEqual([]);
	});
});

describe('Midnight close and CRLF', () => {
	it('saves a close at midnight (1440) and stores instructions with LF', () => {
		expect(change({ card: 'hours', openMinute: 600, closeMinute: 1440 })).toEqual({ ok: true });
		expect(change({ card: 'instructions', de: 'Box links.\r\nSchlüssel zurück.', en: 'Box left.' })).toEqual({ ok: true });
		expect(settingRow()).toMatchObject({ close_minute: 1440, keybox_instructions_de: 'Box links.\nSchlüssel zurück.' });
	});
});

describe('Instructions and contact', () => {
	it('stores the trimmed texts and the address, touching nothing else', () => {
		insertBooking(at('18:00'), { lastTold: cold('17:20', '17:30') });
		const before = bookings();
		expect(change({ card: 'instructions', de: ' Box links. ', en: 'Box left.' })).toEqual({ ok: true });
		expect(change({ card: 'contact', contact: 'sauna@example.ch' })).toEqual({ ok: true });
		expect(settingRow()).toMatchObject({
			keybox_instructions_de: 'Box links.',
			keybox_instructions_en: 'Box left.',
			admin_contact: 'sauna@example.ch',
			changeover_min: 15,
			preheat_min_min: 30
		});
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
	});
});

// Story 3.8 matrix: seasons and the keybox code. Neither card writes an outbox row or changes a booking.
describe('Season: edit current', () => {
	it('id 1, 2027-01-09 – 2027-04-15: row 1 updated in place, bookings unchanged (season_id too), 0 outbox rows', () => {
		insertBooking(at('18:00'), { lastTold: HOT });
		const before = bookings();
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-04-15' })).toEqual({ ok: true });
		expect(seasonRows()).toEqual([{ id: 1, start_date: '2027-01-09', end_date: '2027-04-15' }]);
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
	});
});

describe('Season: shorten', () => {
	it('end 2027-01-20 keeps the bookings on 21 and 22 January; guests can pick days up to 2027-01-20 only', () => {
		insertBooking(at('18:00', '2027-01-21'));
		insertBooking(at('18:00', '2027-01-22'));
		const before = bookings();
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-20' })).toEqual({ ok: true });
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
		expect(selectableDays({ seasons: getSeasons(db), settings: getSettings(db), now: NOW }).at(-1)).toBe('2027-01-20');
	});
});

describe('Season: overlap', () => {
	it('creating 2027-04-01 – 2027-05-31 while row 1 exists is a conflict; nothing written', () => {
		const before = JSON.stringify([seasonRows(), bookings()]);
		expect(change({ card: 'season', id: null, startDate: '2027-04-01', endDate: '2027-05-31' })).toEqual({ ok: false, code: 'conflict' });
		// Inclusive: a season starting on the last day of another overlaps.
		expect(change({ card: 'season', id: null, startDate: '2027-04-30', endDate: '2027-05-31' })).toEqual({ ok: false, code: 'conflict' });
		expect(JSON.stringify([seasonRows(), bookings()])).toBe(before);
		expect(outbox()).toEqual([]);
	});

	it('editing a row into another row is a conflict; the day after another ends is fine', () => {
		expect(change({ card: 'season', id: null, startDate: '2027-05-01', endDate: '2027-05-31' })).toEqual({ ok: true });
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-05-10' })).toEqual({ ok: false, code: 'conflict' });
		expect(seasonRows().map((r) => r.end_date)).toEqual(['2027-04-30', '2027-05-31']);
	});
});

describe('Season: ended, create next', () => {
	const LATER = '2027-05-10T08:00:00Z';
	it('now 2027-05-10: creates 2027-12-20 – 2028-04-30, row 1 unchanged; the guest calendar is `before` the new dates', () => {
		insertBooking(at('18:00'), { lastTold: HOT });
		const before = bookings();
		expect(change({ card: 'season', id: null, startDate: '2027-12-20', endDate: '2028-04-30' }, LATER)).toEqual({ ok: true });
		expect(seasonRows()).toEqual([
			{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' },
			{ id: 2, start_date: '2027-12-20', end_date: '2028-04-30' }
		]);
		expect(bookings()).toBe(before);
		expect(outbox()).toEqual([]);
		expect(calendarState({ seasons: getSeasons(db), settings: getSettings(db), now: LATER })).toEqual({
			kind: 'before',
			seasonStart: '2027-12-20',
			bookingOpens: '2027-12-06'
		});
	});

	it('Past row: id 1 posted at 2027-05-10 is `past`, row unchanged', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-05-31' }, LATER)).toEqual({ ok: false, code: 'past' });
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('an unknown id is `not_found`, nothing written', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: 9, startDate: '2027-12-20', endDate: '2028-04-30' })).toEqual({ ok: false, code: 'not_found' });
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('a row ending today is still editable', () => {
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-04-30' }, '2027-04-30T20:00:00Z')).toEqual({ ok: true });
	});
});

describe('Keybox code change', () => {
	it('4711 → 5822: replaced, 0 outbox rows, no resend; the next keybox claim snapshots 5822', () => {
		sqlite
			.prepare("update setting set keybox_code = '4711', keybox_instructions_de = 'Box links.', keybox_instructions_en = 'Box left.' where id = 1")
			.run();
		const sentId = insertBooking(at('18:00', '2027-01-13'), { keybox: 'accepted' });
		sqlite.prepare("update outbox set snapshot_keybox_code = '4711' where booking_id = ?").run(sentId);
		const pendingId = insertBooking(at('18:00'));
		const beforeBookings = bookings();
		const beforeOutbox = JSON.stringify(outbox());
		expect(change({ card: 'keybox', code: ' 5822 ' })).toEqual({ ok: true });
		expect(settingRow().keybox_code).toBe('5822');
		expect(bookings()).toBe(beforeBookings);
		expect(JSON.stringify(outbox())).toBe(beforeOutbox);
		// The booking sent with 4711 is listed; nothing was resent.
		expect(getOldCodeBookings(NOW, db).map((b) => [b.id, b.code])).toEqual([[sentId, '4711']]);
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'keybox', 'pending', '2027-01-11T17:00:00Z')").run(pendingId);
		const claim = claimDueRow({ now: NOW, db });
		expect(claim).toMatchObject({ ok: true, code: 'claimed', row: { bookingId: pendingId, kind: 'keybox', snapshotKeyboxCode: '5822' } });
	});
});

describe('Season: past dates and edges (Story 3.8 review)', () => {
	it('refuses a new season that already ended (`past`, field end); nothing written', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: null, startDate: '2026-11-01', endDate: '2026-12-31' })).toEqual({ ok: false, code: 'past', field: 'end' });
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('refuses shortening the running season to end yesterday (`past`, field end); today is fine', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-11' })).toEqual({ ok: false, code: 'past', field: 'end' });
		expect(JSON.stringify(seasonRows())).toBe(before);
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-12' })).toEqual({ ok: true });
	});

	it('refuses a changed start on the running season (`past`, no field); nothing written', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: 1, startDate: '2027-01-10', endDate: '2027-04-30' })).toEqual({ ok: false, code: 'past' });
		expect(change({ card: 'season', id: 1, startDate: '2027-01-05', endDate: '2027-04-30' })).toEqual({ ok: false, code: 'past' });
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('uses the Zurich date: at 2027-04-30T22:30Z (1 May in Zurich) row 1 has ended (`past`)', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-05-31' }, '2027-04-30T22:30:00Z')).toEqual({ ok: false, code: 'past' });
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('Overlap at the start edge: 2026-12-01 – 2027-01-09 against row 1 starting 2027-01-09 is a conflict', () => {
		const before = JSON.stringify(seasonRows());
		expect(change({ card: 'season', id: null, startDate: '2026-12-01', endDate: '2027-01-09' }, '2026-11-20T10:00:00Z')).toEqual({
			ok: false,
			code: 'conflict'
		});
		expect(JSON.stringify(seasonRows())).toBe(before);
	});

	it('edits the next row (target case 2: starting after today), start included', () => {
		expect(change({ card: 'season', id: null, startDate: '2027-12-20', endDate: '2028-04-30' })).toEqual({ ok: true });
		expect(change({ card: 'season', id: 2, startDate: '2027-12-27', endDate: '2028-04-15' })).toEqual({ ok: true });
		expect(seasonRows()).toEqual([
			{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' },
			{ id: 2, start_date: '2027-12-27', end_date: '2028-04-15' }
		]);
	});
});
