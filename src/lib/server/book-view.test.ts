// Story 1.7 matrix, form rows: changeover 15, hours 10:00–22:00, season 9 Jan – 30 Apr 2027,
// `now` 12 Jan 09:00.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { offeredStartTimes, type Block, type Booking, type Settings } from '#lib/domain/index.ts';
import { toInstant } from '#lib/time/index.ts';
// The test sets up its own in-memory database; app code reaches the db only through queries.
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from './db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from './db/migrate.ts';
import { buildBookView, invalidUrlTarget, loadBookView, parseStart, unavailableNote, type BookView } from './book-view.ts';

const settings: Settings = { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 };
const seasons = [{ startDate: '2027-01-09', endDate: '2027-04-30' }];
const DAY = '2027-01-12';
/** 09:00 in Zurich. */
const NOW = '2027-01-12T08:00:00Z';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';

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

function form(
	time: string,
	opts: { bookings?: Booking[]; blocks?: Block[]; locale?: 'de' | 'en'; d?: string; p?: string } = {}
): BookView {
	const bookings = opts.bookings ?? [];
	const blocks = opts.blocks ?? [];
	const offer = offeredStartTimes({ date: DAY, bookings, blocks, settings, seasons, now: NOW }).find(
		(o) => o.start === at(time)
	);
	if (!offer) throw new Error(`${time} is not offered`);
	return buildBookView({
		date: DAY,
		offer,
		now: NOW,
		locale: opts.locale ?? 'de',
		settings,
		bookings,
		blocks,
		submitToken: TOKEN,
		d: opts.d,
		p: opts.p
	});
}

const enabled = (v: BookView) => v.durations.filter((d) => d.enabled).map((d) => d.value);

describe('buildBookView', () => {
	it('builds the form for 18:00 with a booking at 20:00', () => {
		const v = form('18:00', { bookings: [booking('20:00', 60)] });
		expect(v).toMatchObject({
			kind: 'form',
			title: '18:00 buchen',
			time: '18:00',
			datetime: '2027-01-12T17:00:00Z',
			back: { href: '/day/2027-01-12', text: 'Di, 12. Januar', name: 'Zurück zu Dienstag, 12. Januar' },
			heat: 'cold',
			label: 'Kaltstart',
			notice: 'Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein.',
			unavailable: '120–180 Min. nicht möglich: nächste Buchung um 20:00.',
			duration: 60,
			partySize: 2,
			partySizes: [1, 2, 3, 4, 5, 6],
			submitToken: TOKEN
		});
		expect(enabled(v)).toEqual([60, 90]);
		expect(v.durations[1]).toEqual({ value: 90, name: '90 Minuten, bis 19:30', note: 'Minuten · bis 19:30', enabled: true });
		expect(v.durations[2]).toMatchObject({ value: 120, name: '120 Minuten, bis 20:00', enabled: false });
	});

	it('preselects the only duration of a kind-3-only start time', () => {
		const v = form('18:15', { bookings: [booking('20:00', 60)] });
		expect(enabled(v)).toEqual([90]);
		expect(v.duration).toBe(90);
		expect(v.unavailable).toBe('Nur 90 Min. möglich: nächste Buchung um 20:00.');
	});

	it('names a block only as "belegt"', () => {
		const v = form('18:00', { blocks: [block('20:00', '21:00')] });
		expect(enabled(v)).toEqual([60, 90, 120]);
		expect(v.unavailable).toBe('150–180 Min. nicht möglich: ab 20:00 belegt.');
	});

	it('names the end of operating hours', () => {
		const v = form('20:00');
		expect(enabled(v)).toEqual([60, 90, 120]);
		expect(v.unavailable).toBe('150–180 Min. nicht möglich: Betrieb bis 22:00.');
		expect(form('19:30').unavailable).toBe('180 Min. nicht möglich: Betrieb bis 22:00.');
	});

	it('falls back to a plain note when no reason is found', () => {
		const offer = {
			start: at('12:00'),
			kinds: [1 as const],
			durations: [60 as const, 90 as const],
			heat: 'cold' as const,
			notice: { heat: 'cold' as const, earliest: at('11:20'), latest: at('11:30') }
		};
		expect(unavailableNote(offer, [], [], settings, 'de')).toBe('120–180 Min. nicht möglich.');
		expect(unavailableNote(offer, [], [], settings, 'en')).toBe('120–180 min not possible.');
	});

	it('takes whichever limit comes first', () => {
		const v = form('18:00', { bookings: [booking('21:00', 60)], blocks: [block('19:45', '20:00')] });
		expect(v.unavailable).toBe('120–180 Min. nicht möglich: ab 19:45 belegt.');
	});

	it('has no note when every duration fits, and hot rows keep their notice', () => {
		const v = form('12:15', { bookings: [booking('11:00', 60)] });
		expect(v).toMatchObject({ heat: 'hot', label: 'Schon heiss', notice: 'Ofen läuft. Komm um 12:15.', unavailable: null });
		expect(enabled(v)).toEqual([60, 90, 120, 150, 180]);
	});

	it('keeps ?d= and ?p= when they are possible, and ignores them otherwise', () => {
		expect(form('18:00', { bookings: [booking('20:00', 60)], d: '90', p: '5' })).toMatchObject({ duration: 90, partySize: 5 });
		expect(form('18:00', { bookings: [booking('20:00', 60)], d: '120', p: '7' })).toMatchObject({ duration: 60, partySize: 2 });
		expect(form('18:00', { d: 'x', p: '' })).toMatchObject({ duration: 60, partySize: 2 });
	});

	it('builds the English strings', () => {
		const v = form('18:00', { bookings: [booking('20:00', 60)], locale: 'en' });
		expect(v).toMatchObject({
			title: 'Book 18:00',
			back: { text: 'Tue, 12 January', name: 'Back to Tuesday, 12 January' },
			label: 'Cold start',
			unavailable: '120–180 min not possible: next booking at 20:00.'
		});
		expect(v.durations[1]).toMatchObject({ name: '90 minutes, until 19:30', note: 'minutes · until 19:30' });
	});
});

describe('parseStart', () => {
	it('reads a Zurich wall-clock start', () => {
		expect(parseStart('2027-01-12', '1800')).toBe('2027-01-12T17:00:00Z');
		expect(parseStart('2027-03-28', '1800')).toBe('2027-03-28T16:00:00Z');
	});
	it.each([
		['2027-01-12', '18:00'],
		['2027-01-12', '2400'],
		['2027-01-12', '1860'],
		['2027-01-12', '180'],
		['2027-02-30', '1800'],
		['2027-03-28', '0230']
	])('refuses %s %s', (date, time) => {
		expect(parseStart(date, time)).toBeNull();
	});
});

describe('invalidUrlTarget', () => {
	it('sends a real date to its day, anything else home', () => {
		expect(invalidUrlTarget('2027-01-12')).toBe('/day/2027-01-12');
		expect(invalidUrlTarget('2027-02-30')).toBe('/');
		expect(invalidUrlTarget('x')).toBe('/');
	});
});

describe('loadBookView', () => {
	let sqlite: ReturnType<typeof openDatabase>;
	let db: Db;

	beforeEach(() => {
		sqlite = openDatabase(':memory:');
		db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, name, email, mobile, public_id, submit_token) values (?, 60, 15, '2027-01-05T08:00:00Z', 1, 2, 'de', 'Anna', 'anna@example.ch', '+41791111111', 'pub', 'tok')"
			)
			.run(at('17:00'));
	});

	afterEach(() => {
		sqlite.close();
	});

	it('returns the form with a fresh 128-bit token each time, and no guest data', () => {
		const a = loadBookView(DAY, '1815', 'de', { now: NOW, db });
		const b = loadBookView(DAY, '1815', 'de', { now: NOW, db });
		expect(a).toMatchObject({ kind: 'form', time: '18:15', heat: 'hot' });
		if (a.kind !== 'form' || b.kind !== 'form') return;
		expect(a.submitToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(a.submitToken).not.toBe(b.submitToken);
		expect(JSON.stringify(a)).not.toMatch(/Anna|anna@|\+4179|"pub"|"tok"/);
	});

	it('sends a stale form for a taken time to the day with the conflict message', () => {
		expect(loadBookView(DAY, '1800', 'de', { now: NOW, db })).toEqual({
			kind: 'redirect',
			to: '/day/2027-01-12?error=conflict&time=1800'
		});
	});

	it('sends a stale form for a time that has begun to the day with the past message', () => {
		expect(loadBookView(DAY, '1830', 'de', { now: at('18:30'), db })).toEqual({
			kind: 'redirect',
			to: '/day/2027-01-12?error=past&time=1830'
		});
	});

	it('sends a URL that names no real time to the day, or home', () => {
		expect(loadBookView(DAY, '18:00', 'de', { now: NOW, db })).toEqual({ kind: 'redirect', to: '/day/2027-01-12' });
		expect(loadBookView('2027-13-01', '1800', 'de', { now: NOW, db })).toEqual({ kind: 'redirect', to: '/' });
		expect(loadBookView('2027-06-01', '1800', 'de', { now: NOW, db })).toEqual({ kind: 'redirect', to: '/day/2027-06-01' });
	});

	it('keeps ?d= and ?p=', () => {
		expect(loadBookView(DAY, '1815', 'de', { now: NOW, db, d: '120', p: '4' })).toMatchObject({ duration: 120, partySize: 4 });
	});
});
