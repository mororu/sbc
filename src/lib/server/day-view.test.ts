// Story 1.4 matrix: seed settings (changeover 15, 10:00–22:00, horizon 14), season 9 Jan – 30 Apr 2027.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Block, Booking, Settings } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
// The test sets up its own in-memory database; app code reaches the db only through queries.
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from './db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from './db/migrate.ts';
import { buildDayView, buildSeasonView, loadDayView, type DayView, type FreeRow } from './day-view.ts';

const settings: Settings = { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14 };
const seasons = [{ startDate: '2027-01-09', endDate: '2027-04-30' }];
const DAY = '2027-01-12';
/** 10:00 in Zurich on 12 January. */
const NOW = '2027-01-12T09:00:00Z';

const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
let nextId = 1;
const booking = (from: string, duration: number): Booking => ({
	id: nextId++,
	start: at(from),
	durationMin: duration,
	changeoverMin: 15,
	createdAt: '2027-01-05T08:00:00Z'
});
const block = (from: string, to: string): Block => ({ start: at(from), end: at(to) });

function view(opts: Partial<Parameters<typeof buildDayView>[0]> = {}): DayView {
	return buildDayView({ date: DAY, now: NOW, locale: 'de', settings, seasons, bookings: [], blocks: [], ...opts });
}
const free = (v: DayView, time: string) =>
	v.rows.find((r): r is FreeRow => r.kind === 'free' && r.time === time);

describe('buildDayView', () => {
	it('builds heading, title, a taken row, a hot row and a limited cold start (DE)', () => {
		const v = view({ bookings: [booking('17:00', 60)] });
		expect(v.heading).toEqual({ eyebrow: 'Heute', date: '12. Januar' });
		expect(v.title).toBe('Di, 12. Januar');
		expect(v.note).toBeNull();

		const taken = v.rows.filter((r) => r.kind === 'taken');
		expect(taken).toEqual([
			{
				kind: 'taken',
				time: '17:00',
				datetime: '2027-01-12T16:00:00Z',
				until: 'bis 18:00',
				untilDatetime: '2027-01-12T17:00:00Z',
				label: 'Belegt',
				srText: '17:00 bis 18:00, belegt'
			}
		]);

		expect(free(v, '18:15')).toMatchObject({
			heat: 'hot',
			label: 'Schon heiss',
			notice: 'Ofen läuft. Komm um 18:15.',
			srText: '18:15, schon heiss. Ofen läuft. Komm um 18:15.',
			durations: [60, 90, 120, 150, 180]
		});
		expect(free(v, '15:45')).toMatchObject({
			heat: 'cold',
			label: 'Kaltstart',
			notice: 'Nur 60 Min.',
			srText: '15:45, Kaltstart. Nur 60 Min.',
			durations: [60]
		});
	});

	it('lists rows in time order, taken rows among them', () => {
		const v = view({ bookings: [booking('17:00', 60)] });
		const datetimes = v.rows.map((r) => r.datetime);
		expect(datetimes).toEqual([...datetimes].sort());
		expect(v.rows.map((r) => r.time)).toContain('17:00');
		expect(free(v, '17:00')).toBeUndefined();
	});

	it('builds the English strings', () => {
		const v = view({ locale: 'en', bookings: [booking('17:00', 60)] });
		expect(v.heading).toEqual({ eyebrow: 'Today', date: '12 January' });
		expect(v.title).toBe('Tue, 12 January');
		expect(free(v, '18:15')).toMatchObject({
			label: 'Already hot',
			notice: "The stove's going. Come at 18:15.",
			srText: "18:15, already hot. The stove's going. Come at 18:15."
		});
		expect(free(v, '15:45')).toMatchObject({
			label: 'Cold start',
			notice: '60 min only',
			srText: '15:45, cold start. 60 min only.'
		});
		const limitedHot = view({ locale: 'en', bookings: [booking('17:00', 60), booking('20:00', 60)] });
		expect(free(limitedHot, '18:15')).toMatchObject({
			notice: "Up to 90 min · The stove's going. Come at 18:15.",
			srText: "18:15, already hot. Up to 90 min. The stove's going. Come at 18:15."
		});
		expect(v.rows.find((r) => r.kind === 'taken')).toMatchObject({
			label: 'Taken',
			until: 'until 18:00',
			srText: '17:00 to 18:00, taken'
		});
	});

	it('uses the weekday as eyebrow on any other day', () => {
		const v = view({ date: '2027-01-13' });
		expect(v.heading).toEqual({ eyebrow: 'Mittwoch', date: '13. Januar' });
		expect(v.title).toBe('Mi, 13. Januar');
	});

	it('prefixes limited durations with "Bis" or "Nur" and leaves all five alone', () => {
		// A booking at 20:00: 18:00 still fits 60 and 90 (ends 19:30, + 15 = 19:45).
		const v = view({ bookings: [booking('20:00', 60)] });
		expect(free(v, '18:00')).toMatchObject({ durations: [60, 90], notice: 'Bis 90 Min.' });
		expect(free(v, '18:30')).toMatchObject({ durations: [60], notice: 'Nur 60 Min.' });
		expect(free(v, '11:00')).toMatchObject({ durations: [60, 90, 120, 150, 180], notice: null });
		expect(free(v, '11:00')?.srText).toBe('11:00, Kaltstart.');
	});

	it('joins the limit and the hot notice', () => {
		// 17:00–18:00, then 20:00: 18:15 is hot and fits 60 and 90 (ends 19:45 = 20:00 − 15).
		const v = view({ bookings: [booking('17:00', 60), booking('20:00', 60)] });
		expect(free(v, '18:15')).toMatchObject({
			durations: [60, 90],
			notice: 'Bis 90 Min. · Ofen läuft. Komm um 18:15.',
			srText: '18:15, schon heiss. Bis 90 Min. Ofen läuft. Komm um 18:15.'
		});
	});

	it('shows a block exactly like a booking, without its reason', () => {
		const withBlock = view({ blocks: [block('12:00', '13:00')] });
		const withBooking = view({ bookings: [booking('12:00', 60)] });
		const takenOf = (v: DayView) => v.rows.filter((r) => r.kind === 'taken');
		expect(takenOf(withBlock)).toEqual(takenOf(withBooking));
		expect(takenOf(withBlock)[0].srText).toBe('12:00 bis 13:00, belegt');
	});

	it('clips taken rows to operating hours and drops those outside', () => {
		const v = view({
			blocks: [block('08:00', '11:00'), block('21:30', '23:00'), block('06:00', '07:00')],
			bookings: [booking('17:00', 60)]
		});
		const taken = v.rows.filter((r) => r.kind === 'taken');
		expect(taken.map((r) => r.srText)).toEqual([
			'10:00 bis 11:00, belegt',
			'17:00 bis 18:00, belegt',
			'21:30 bis 22:00, belegt'
		]);
	});

	it('merges a block that overlaps a booking into one taken row', () => {
		const v = view({ bookings: [booking('17:00', 60)], blocks: [block('17:30', '19:00')] });
		expect(v.rows.filter((r) => r.kind === 'taken')).toEqual([
			expect.objectContaining({
				time: '17:00',
				until: 'bis 19:00',
				untilDatetime: at('19:00'),
				srText: '17:00 bis 19:00, belegt'
			})
		]);
	});

	it('merges two blocks that both clip to opening time into one row', () => {
		const v = view({ blocks: [block('08:00', '10:30'), block('09:00', '11:00')] });
		expect(v.rows.filter((r) => r.kind === 'taken').map((r) => r.srText)).toEqual([
			'10:00 bis 11:00, belegt'
		]);
	});

	it('keeps touching intervals and back-to-back bookings as separate rows', () => {
		const v = view({
			bookings: [booking('17:00', 60), booking('18:15', 60)],
			blocks: [block('12:00', '13:00'), block('13:00', '14:00')]
		});
		expect(v.rows.filter((r) => r.kind === 'taken').map((r) => r.srText)).toEqual([
			'12:00 bis 13:00, belegt',
			'13:00 bis 14:00, belegt',
			'17:00 bis 18:00, belegt',
			'18:15 bis 19:15, belegt'
		]);
	});

	it('uses wall-clock times on the spring DST day (Sunday 28 March)', () => {
		const dst = '2027-03-28';
		const v = view({
			date: dst,
			now: '2027-03-20T09:00:00Z',
			blocks: [{ start: '2027-03-28T05:00:00Z', end: at('11:00', dst) }] // 07:00–11:00 local
		});
		expect(v.title).toBe('So, 28. März');
		const taken = v.rows.filter((r) => r.kind === 'taken');
		expect(taken).toEqual([
			expect.objectContaining({
				time: '10:00',
				datetime: '2027-03-28T08:00:00Z',
				until: 'bis 11:00',
				untilDatetime: '2027-03-28T09:00:00Z'
			})
		]);
		expect(v.rows[1]).toMatchObject({ kind: 'free', time: '11:00', datetime: '2027-03-28T09:00:00Z' });
		expect(free(v, '21:00')?.datetime).toBe('2027-03-28T19:00:00Z');
	});

	it('ignores deleted bookings', () => {
		const v = view({ bookings: [{ ...booking('17:00', 60), deletedAt: '2027-01-10T08:00:00Z' }] });
		expect(v.rows.every((r) => r.kind === 'free')).toBe(true);
	});

	it('does not offer past start times today', () => {
		const v = view({ now: '2027-01-12T15:10:00Z' }); // 16:10 in Zurich
		expect(v.rows[0]).toMatchObject({ kind: 'free', time: '16:30' });
	});

	it('adds the season note when today is in no season', () => {
		const v = view({ date: '2027-01-09', now: '2026-12-28T09:00:00Z', seasonStartsOn: '2027-01-09' });
		expect(v.note).toBe('Die Saison beginnt am 9. Januar. Hier sind die ersten Tage.');
		expect(v.heading.eyebrow).toBe('Samstag');
		const en = view({ date: '2027-01-09', now: '2026-12-28T09:00:00Z', seasonStartsOn: '2027-01-09', locale: 'en' });
		expect(en.note).toBe('Season opens 9 January. Here are the first days.');
	});

	it('serialises to the view model only', () => {
		const v = view({ bookings: [booking('17:00', 60)], blocks: [block('12:00', '13:00')] });
		const json = JSON.stringify(v);
		expect(json).not.toMatch(/"id"|createdAt|created_at|reason|changeover|name|email|phone/i);
	});
});

describe('buildSeasonView', () => {
	it('builds the before-season notice', () => {
		expect(buildSeasonView({ kind: 'before', seasonStart: '2027-01-09', bookingOpens: '2026-12-26' }, 'de')).toEqual({
			kind: 'season',
			title: 'Kalender',
			heading: 'Die Saison beginnt am 9. Januar.',
			body: 'Buchen kannst du ab dem 26. Dezember.'
		});
		expect(buildSeasonView({ kind: 'before', seasonStart: '2027-01-09', bookingOpens: '2026-12-26' }, 'en')).toMatchObject({
			heading: 'Season opens 9 January.',
			body: 'Booking opens 26 December.'
		});
	});

	it('builds the after-season notice', () => {
		expect(buildSeasonView({ kind: 'after' }, 'de')).toMatchObject({
			heading: 'Die Saison ist vorbei.',
			body: 'Danke fürs Kommen, bis nächsten Winter.'
		});
		expect(buildSeasonView({ kind: 'after' }, 'en')).toMatchObject({
			heading: 'The season is over.',
			body: 'Thanks for coming, see you next winter.'
		});
	});
});

describe('loadDayView', () => {
	let sqlite: ReturnType<typeof openDatabase>;
	let db: Db;

	beforeEach(() => {
		sqlite = openDatabase(':memory:');
		db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		const insertBooking = sqlite.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values (?, 60, 15, '2027-01-05T08:00:00Z', 1)"
		);
		insertBooking.run(at('17:00'));
		insertBooking.run(at('21:30', '2027-01-11')); // the day before: needs no row today
		sqlite
			.prepare("insert into block (start_at, end_at, reason) values (?, ?, 'private_use')")
			.run(at('12:00'), at('13:00'));
	});

	afterEach(() => {
		sqlite.close();
	});

	const load = (date: string | null, now = NOW) => loadDayView(date, 'de', { db, now });

	it('renders today on / from the database', () => {
		const page = load(null);
		expect(page).toMatchObject({ kind: 'day', date: DAY, heading: { eyebrow: 'Heute' } });
		const v = page as DayView;
		expect(v.rows.filter((r) => r.kind === 'taken').map((r) => r.srText)).toEqual([
			'12:00 bis 13:00, belegt',
			'17:00 bis 18:00, belegt'
		]);
		expect(free(v, '18:15')?.heat).toBe('hot');
		expect(JSON.stringify(v)).not.toMatch(/private_use|"id"|createdAt/);
	});

	it('renders another selectable day', () => {
		expect(load('2027-01-13')).toMatchObject({ kind: 'day', heading: { eyebrow: 'Mittwoch', date: '13. Januar' } });
	});

	it.each([
		['a past day', '2026-01-01', '/day/2027-01-12'],
		['a day beyond the horizon', '2027-03-01', '/day/2027-01-26'],
		['a day after the season', '2027-05-02', '/day/2027-01-26'],
		['an impossible date', '2027-02-30', '/day/2027-01-12'],
		['garbage', 'abc', '/day/2027-01-12']
	])('redirects %s', (_label, date, to) => {
		expect(load(date)).toEqual({ kind: 'redirect', to });
	});

	it('shows the before-season notice on / and redirects days to /', () => {
		expect(load(null, '2026-12-20T09:00:00Z')).toMatchObject({
			kind: 'season',
			heading: 'Die Saison beginnt am 9. Januar.',
			body: 'Buchen kannst du ab dem 26. Dezember.'
		});
		expect(load('2027-01-09', '2026-12-20T09:00:00Z')).toEqual({ kind: 'redirect', to: '/' });
	});

	it('lands on the first season day with a note when booking is open but the season has not begun', () => {
		const page = load(null, '2026-12-28T09:00:00Z');
		expect(page).toMatchObject({
			kind: 'day',
			date: '2027-01-09',
			note: 'Die Saison beginnt am 9. Januar. Hier sind die ersten Tage.'
		});
		expect(load('2026-12-29', '2026-12-28T09:00:00Z')).toEqual({ kind: 'redirect', to: '/day/2027-01-09' });
	});

	it('shows the after-season notice after the season and with no season', () => {
		expect(load(null, '2027-05-01T09:00:00Z')).toMatchObject({ kind: 'season', heading: 'Die Saison ist vorbei.' });
		sqlite.prepare('delete from booking').run();
		sqlite.prepare('delete from season').run();
		expect(load(null)).toMatchObject({ kind: 'season', heading: 'Die Saison ist vorbei.' });
	});

	it('switches to the before state when a later season exists', () => {
		sqlite.prepare("insert into season (start_date, end_date) values ('2028-01-08', '2028-04-29')").run();
		expect(load(null, '2027-05-01T09:00:00Z')).toMatchObject({
			kind: 'season',
			heading: 'Die Saison beginnt am 8. Januar.',
			body: 'Buchen kannst du ab dem 25. Dezember.'
		});
	});
});
