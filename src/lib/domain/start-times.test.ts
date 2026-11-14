// Story 1.3 matrix (PRD FR-2, FR-4 examples) with explicit `now`. Changeover 15, hours 10:00–22:00,
// horizon 14, season 9 January – 30 April 2027.
import { describe, expect, it } from 'vitest';
import { addMinutes, toInstant, type Instant, type LocalDate } from '#lib/time/index.ts';
import {
	bookingHeat,
	dayItemsWindow,
	freeHeat,
	isBookableDay,
	offeredStartTimes,
	type Block,
	type Booking,
	type Settings
} from './start-times.ts';

const DAY = '2027-01-12';
const NOW = '2027-01-05T08:00:00Z';
const settings: Settings = { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 };
const seasons = [{ startDate: '2027-01-09', endDate: '2027-04-30' }];

const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};
const at = (hhmm: string, date: LocalDate = DAY): Instant => toInstant(date, minutes(hhmm));

let nextId = 1;
function booking(from: string, to: string, opts: Partial<Booking> & { date?: LocalDate } = {}): Booking {
	const start = at(from, opts.date);
	return {
		id: nextId++,
		start,
		durationMin: minutes(to) - minutes(from),
		changeoverMin: 15,
		createdAt: '2027-01-01T10:00:00Z',
		...opts
	};
}
const block = (from: string, to: string, date: LocalDate = DAY): Block => ({ start: at(from, date), end: at(to, date) });

function day(
	bookings: Booking[],
	opts: { blocks?: Block[]; settings?: Partial<Settings>; now?: Instant; date?: LocalDate } = {}
) {
	const offered = offeredStartTimes({
		date: opts.date ?? DAY,
		bookings,
		blocks: opts.blocks ?? [],
		settings: { ...settings, ...opts.settings },
		seasons,
		now: opts.now ?? NOW
	});
	const byTime = new Map(offered.map((o) => [o.start, o]));
	return { offered, get: (hhmm: string) => byTime.get(at(hhmm, opts.date)) };
}

describe('one booking 17:00–18:00', () => {
	const { get } = day([booking('17:00', '18:00')]);

	it('offers 18:15 hot, 18:30 and 19:00 cold, and not 18:00', () => {
		expect(get('18:00')).toBeUndefined();
		expect(get('18:15')).toMatchObject({ heat: 'hot', kinds: [2] });
		expect(get('18:30')?.heat).toBe('cold');
		expect(get('19:00')?.heat).toBe('cold');
	});

	it('limits the times before it', () => {
		expect(get('16:00')).toBeUndefined();
		expect(get('16:30')).toBeUndefined();
		expect(get('15:30')?.durations).toEqual([60]);
		expect(get('15:45')).toMatchObject({ kinds: [3], durations: [60] });
		expect(get('15:15')).toMatchObject({ kinds: [3], durations: [90] });
	});
});

describe('only a booking at 19:00', () => {
	const later = booking('19:00', '20:00');
	const { get } = day([later]);

	it('offers kind-3 times only with the duration that ends one changeover before it', () => {
		expect(get('17:45')?.durations).toEqual([60]);
		expect(get('17:15')?.durations).toEqual([90]);
		expect(get('17:30')?.durations).toEqual([60]);
		expect(get('17:00')?.durations).toEqual([60, 90]);
	});

	it.each([
		['17:45', '18:45'],
		['17:15', '18:45']
	])('booking %s makes 19:00 hot', (from, to) => {
		const earlier = booking(from, to, { createdAt: '2027-01-02T10:00:00Z' });
		expect(bookingHeat(later, [later], [])).toBe('cold');
		expect(bookingHeat(later, [later, earlier], [])).toBe('hot');
	});
});

describe('heat state', () => {
	it('makes a booking after a one-hour gap a cold start', () => {
		const second = booking('19:00', '20:00');
		expect(bookingHeat(second, [booking('17:00', '18:00'), second], [])).toBe('cold');
	});

	// Blocks carry no reason in the core: whatever the reason, a block never heats.
	it('makes a time or booking right after a block a cold start', () => {
		const blocks = [block('15:00', '17:00')];
		const { get } = day([], { blocks });
		expect(get('17:00')?.heat).toBe('cold');
		const after = booking('17:00', '18:00');
		expect(bookingHeat(after, [after], blocks)).toBe('cold');
	});

	it('makes a booking cold when a block is still running at its start', () => {
		const before = booking('17:00', '18:00');
		const after = booking('18:15', '19:15');
		expect(bookingHeat(after, [before, after], [block('18:00', '18:30')])).toBe('cold');
	});

	it('ignores stray seconds when checking back to back', () => {
		const before = { ...booking('17:00', '18:00'), start: '2027-01-12T16:00:20Z' };
		expect(freeHeat(at('18:15'), [before], [], 15)).toBe('hot');
	});

	it('needs no changeover next to a block', () => {
		const { get } = day([], { blocks: [block('15:00', '17:00')] });
		expect(get('17:00')).toBeDefined();
		expect(get('14:00')?.durations).toEqual([60]);
	});

	it('makes a free time cold when a block ends between the booking and it', () => {
		const before = booking('17:00', '18:00');
		const blocks = [block('18:00', '18:10')];
		expect(freeHeat(at('18:15'), [before], blocks, 15)).toBe('cold');
		expect(freeHeat(at('18:15'), [before], [], 15)).toBe('hot');
	});

	it('does not depend on duration', () => {
		const { get } = day([booking('17:00', '18:00')]);
		const offered = get('18:15');
		expect(offered?.durations.length).toBeGreaterThan(1);
		expect(offered?.heat).toBe('hot');
	});

	it('ignores deleted bookings', () => {
		const deleted = booking('17:00', '18:00', { deletedAt: '2027-01-03T10:00:00Z' });
		const { get } = day([deleted]);
		expect(get('17:00')?.heat).toBe('cold');
		expect(get('18:15')).toBeUndefined();
		expect(freeHeat(at('18:15'), [deleted], [], 15)).toBe('cold');
	});
});

describe('changeover raised from 15 to 30', () => {
	const first = booking('17:00', '18:00', { createdAt: '2027-01-01T10:00:00Z' });
	const second = booking('18:15', '19:15', { createdAt: '2027-01-02T10:00:00Z' });
	const { get } = day([first, second], { settings: { changeoverMin: 30 } });

	it('keeps the 18:15 booking hot by its recorded changeover', () => {
		expect(bookingHeat(second, [first, second], [])).toBe('hot');
	});

	it('uses the current changeover for new times', () => {
		expect(get('19:30')).toBeUndefined();
		expect(get('19:45')).toMatchObject({ heat: 'hot', kinds: [2] });
	});

	it('uses the later-made booking, by created_at then id, for back to back', () => {
		const same = '2027-01-01T10:00:00Z';
		// Same created_at: the higher id decides.
		const a = booking('17:00', '18:00', { id: 101, changeoverMin: 30, createdAt: same });
		const b = booking('18:15', '19:15', { id: 102, changeoverMin: 15, createdAt: same });
		expect(bookingHeat(b, [a, b], [])).toBe('hot');
		const a2 = { ...a, id: 103 };
		expect(bookingHeat(b, [a2, b], [])).toBe('cold');
		// Different created_at: the later one decides, whatever the ids.
		const c = booking('18:15', '19:15', { id: 1, changeoverMin: 30, createdAt: '2027-01-02T10:00:00Z' });
		const d = booking('17:00', '18:00', { id: 2, changeoverMin: 15, createdAt: same });
		expect(bookingHeat(c, [d, c], [])).toBe('cold');
	});
});

describe('day bounds', () => {
	it('fits durations into operating hours', () => {
		const { get, offered } = day([]);
		expect(offered[0].start).toBe(at('10:00'));
		expect(get('21:00')?.durations).toEqual([60]);
		expect(get('21:30')).toBeUndefined();
		expect(get('20:00')?.durations).toEqual([60, 90, 120]);
	});

	it('starts the grid at the first full or half hour inside operating hours', () => {
		const { offered } = day([], { settings: { openMinute: 615 } });
		expect(offered[0].start).toBe(at('10:30'));
	});

	it('does not offer times that have begun', () => {
		const { get } = day([], { now: at('17:00') });
		expect(get('17:00')).toBeUndefined();
		expect(get('16:30')).toBeUndefined();
		expect(get('17:30')).toBeDefined();
	});

	it.each([
		['before the season', '2027-01-08', NOW],
		['after the season', '2027-05-01', '2027-04-25T08:00:00Z'],
		['beyond the horizon', '2027-01-20', NOW],
		['before today', '2027-01-10', '2027-01-11T08:00:00Z']
	])('offers nothing %s', (_label, date, now) => {
		expect(day([], { date, now }).offered).toEqual([]);
	});

	it('offers the whole wall-clock grid on the DST day (28 March 2027)', () => {
		const date = '2027-03-28';
		const { offered } = day([], { date, now: '2027-03-20T08:00:00Z' });
		expect(offered[0].start).toBe('2027-03-28T08:00:00Z');
		expect(offered).toHaveLength(23);
		expect(offered.at(-1)?.start).toBe(at('21:00', date));
	});

	it('keeps a changeover to a booking that ends at midnight the day before', () => {
		const allDay = { openMinute: 0, closeMinute: 1440 };
		const lateYesterday = booking('23:00', '24:00', { date: '2027-01-11' });
		const { get } = day([lateYesterday], { settings: allDay });
		expect(get('00:00')).toBeUndefined();
		expect(get('00:15')).toMatchObject({ heat: 'hot', kinds: [2] });
		// Without the previous day's booking, 00:00 would be offered.
		expect(day([], { settings: allDay }).get('00:00')).toBeDefined();
	});

	it('keeps a changeover to a booking early the next day', () => {
		const allDay = { openMinute: 0, closeMinute: 1440 };
		const earlyTomorrow = booking('00:10', '01:10', { date: '2027-01-13' });
		const { get } = day([earlyTomorrow], { settings: allDay });
		// 23:00 for 60 would end at midnight, only 10 minutes before the next booking.
		expect(get('23:00')).toBeUndefined();
		expect(get('22:30')?.durations).toEqual([60]);
		expect(day([], { settings: allDay }).get('23:00')?.durations).toEqual([60]);
	});

	it('offers nothing for a date that does not exist', () => {
		expect(day([], { date: '2027-02-30' }).offered).toEqual([]);
		expect(day([], { date: 'abc' }).offered).toEqual([]);
	});

	it('handles the autumn DST day (31 October 2027)', () => {
		const date = '2027-10-31';
		const autumn = [{ startDate: '2027-10-01', endDate: '2027-11-30' }];
		const offered = offeredStartTimes({
			date,
			bookings: [],
			blocks: [],
			settings,
			seasons: autumn,
			now: '2027-10-25T08:00:00Z'
		});
		expect(offered[0].start).toBe('2027-10-31T09:00:00Z');
		expect(offered).toHaveLength(23);
	});

	it('offers times next to a block that overlaps opening', () => {
		const { get, offered } = day([], { blocks: [block('09:00', '11:00')] });
		expect(offered[0].start).toBe(at('11:00'));
		expect(get('10:30')).toBeUndefined();
	});

	it('allows a changeover of 0', () => {
		const { get } = day([booking('17:00', '18:00')], { settings: { changeoverMin: 0 } });
		expect(get('18:00')).toMatchObject({ heat: 'hot' });
		expect(get('16:00')?.durations).toEqual([60]);
	});

	it('uses every season, with gaps between them', () => {
		const two = [
			{ startDate: '2027-01-09', endDate: '2027-01-12' },
			{ startDate: '2027-01-14', endDate: '2027-01-20' }
		];
		const on = (date: string) =>
			offeredStartTimes({ date, bookings: [], blocks: [], settings, seasons: two, now: NOW }).length;
		expect(on('2027-01-12')).toBeGreaterThan(0);
		expect(on('2027-01-13')).toBe(0);
		expect(on('2027-01-14')).toBeGreaterThan(0);
	});
});

describe('isBookableDay', () => {
	it.each([
		['2027-01-09', '2026-12-26T08:00:00Z', true],
		['2027-01-10', '2026-12-26T08:00:00Z', false],
		['2027-01-08', '2026-12-26T08:00:00Z', false],
		['2027-04-30', '2027-04-30T08:00:00Z', true],
		['2027-05-01', '2027-04-30T08:00:00Z', false]
	])('%s at %s is %s', (date, now, expected) => {
		expect(isBookableDay(date, seasons, settings, now)).toBe(expected);
	});
});

describe('every offered duration is a valid booking', () => {
	it('keeps one changeover to every booking and stays clear of blocks, for all kinds', () => {
		const bookings = [booking('11:00', '12:00'), booking('14:00', '15:30'), booking('19:00', '20:00')];
		const blocks = [block('16:30', '17:15')];
		const { offered } = day(bookings, { blocks });
		expect(offered.some((o) => o.kinds.includes(3))).toBe(true);
		for (const o of offered) {
			for (const d of o.durations) {
				const end = addMinutes(o.start, d);
				for (const b of bookings) {
					const bEnd = addMinutes(b.start, b.durationMin);
					const clear = addMinutes(end, 15) <= b.start || o.start >= addMinutes(bEnd, 15);
					expect(clear, `${o.start} for ${d} vs booking ${b.start}`).toBe(true);
				}
				for (const k of blocks) {
					expect(end <= k.start || o.start >= k.end, `${o.start} for ${d} vs block`).toBe(true);
				}
				expect(end <= at('22:00')).toBe(true);
			}
		}
	});
});

describe('dayItemsWindow', () => {
	it('runs from the day before 00:00 to the day after next 00:00, local time', () => {
		expect(dayItemsWindow(DAY)).toEqual({ from: '2027-01-10T23:00:00Z', to: '2027-01-13T23:00:00Z' });
	});

	it('follows the local midnights across the spring clock change', () => {
		// 27 March 00:00 is UTC+1; 30 March 00:00 is UTC+2 (summer time from 28 March).
		expect(dayItemsWindow('2027-03-28')).toEqual({ from: '2027-03-26T23:00:00Z', to: '2027-03-29T22:00:00Z' });
	});

	it('spans 73 real hours across the autumn clock change', () => {
		// 30 October 00:00 is UTC+2; 2 November 00:00 is UTC+1 (winter time from 31 October).
		const { from, to } = dayItemsWindow('2027-10-31');
		expect({ from, to }).toEqual({ from: '2027-10-29T22:00:00Z', to: '2027-11-01T23:00:00Z' });
		expect((Date.parse(to) - Date.parse(from)) / 3_600_000).toBe(73);
	});

	it('crosses a month and a year end', () => {
		expect(dayItemsWindow('2027-01-01')).toEqual({ from: '2026-12-30T23:00:00Z', to: '2027-01-02T23:00:00Z' });
	});
});
