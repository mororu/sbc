// Story 4.1: the start kind of a booking and the start times that passed unbooked.
import { describe, expect, it } from 'vitest';
import { addMinutes, toInstant } from '#lib/time/index.ts';
import { bookingStartKind, unbookedStartTimes } from './analytics.ts';
import type { Block, Booking, Settings } from './heat.ts';
import { offeredStartTimes } from './start-times.ts';

const DAY = '2027-01-12';
const SEASONS = [{ startDate: '2027-01-09', endDate: '2027-03-31' }];
const SETTINGS: Settings = { changeoverMin: 15, openMinute: 960, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 };
const at = (hhmm: string, date = DAY) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
let nextId = 1;
const booking = (start: string, over: Partial<Booking> = {}): Booking => ({
	id: nextId++,
	start: at(start),
	durationMin: 60,
	changeoverMin: 15,
	createdAt: '2027-01-05T08:00:00Z',
	...over
});
const unbooked = (bookings: Booking[], blocks: Block[] = [], over: Partial<Settings> = {}, date = DAY) =>
	unbookedStartTimes({ date, bookings, blocks, settings: { ...SETTINGS, ...over }, seasons: SEASONS });
const starts = (...args: Parameters<typeof unbooked>) => unbooked(...args).map((u) => u.start);

describe('bookingStartKind', () => {
	it('is 1 on the full or half hour, even right after another booking', () => {
		const first = booking('16:00', { durationMin: 60 });
		expect(bookingStartKind(first, [first])).toBe(1);
		const half = booking('17:30', { changeoverMin: 30 });
		expect(bookingStartKind(half, [first, half])).toBe(1);
	});

	it('is 2 exactly its recorded changeover after another booking ends', () => {
		const first = booking('16:00', { changeoverMin: 30 });
		const second = booking('17:15');
		expect(bookingStartKind(second, [first, second])).toBe(2);
	});

	it('is 3 otherwise: another gap, a deleted neighbour, or none', () => {
		const first = booking('16:00');
		const later = booking('17:20');
		expect(bookingStartKind(later, [first, later])).toBe(3);
		const second = booking('17:15');
		expect(bookingStartKind(second, [second])).toBe(3);
		expect(bookingStartKind(second, [{ ...first, deletedAt: '2027-01-06T08:00:00Z' }, second])).toBe(3);
	});

	it('uses the Zurich clock on both sides of the summer-time switch', () => {
		for (const date of ['2027-03-27', '2027-03-28']) {
			const b = booking('18:00', { start: at('18:00', date) });
			expect(bookingStartKind(b, [b])).toBe(1);
		}
	});
});

describe('unbookedStartTimes', () => {
	it('counts no booked time, no blocked time and no time without a fitting duration', () => {
		// 17:00–18:00 booked, 20:00–21:00 blocked.
		const b = booking('17:00');
		const found = starts([b], [{ start: at('20:00'), end: at('21:00') }]);
		// 16:00 does not fit before 17:00 (60 + 15 min); 19:30 does not fit before the block.
		for (const time of ['16:00', '16:30', '17:00', '17:30', '18:00', '19:30', '20:00', '20:30', '21:30']) {
			expect(found).not.toContain(at(time));
		}
		expect(found).toEqual([at('18:15'), at('18:30'), at('19:00'), at('21:00')]);
	});

	it('carries the heat state: hot right after a booking, cold elsewhere', () => {
		const heat = new Map(unbooked([booking('17:00')]).map((u) => [u.start, u.heat]));
		expect(heat.get(at('18:15'))).toBe('hot');
		expect(heat.get(at('18:30'))).toBe('cold');
	});

	it('leaves out times that are only of kind 3', () => {
		// 17:50 − 15 − 60 = 16:35, offered only so that it meets the 17:50 booking.
		const b = booking('17:50');
		const input = { date: DAY, bookings: [b], blocks: [], settings: SETTINGS, seasons: SEASONS };
		expect(offeredStartTimes({ ...input, now: at('00:00') }).map((o) => o.start)).toContain(at('16:35'));
		expect(starts([b])).not.toContain(at('16:35'));
	});

	it('ignores deleted bookings and finds nothing outside every season', () => {
		expect(starts([booking('17:00', { deletedAt: '2027-01-06T08:00:00Z' })])).toContain(at('17:00'));
		expect(unbooked([], [], {}, '2027-04-01')).toEqual([]);
	});

	it('includes a start at midnight, and works with a one-day horizon', () => {
		expect(starts([], [], { openMinute: 0, horizonDays: 1 })).toContain(at('00:00'));
	});

	it('equals the definition: each time offered with `now` just before it', () => {
		const bookings = [booking('16:00'), booking('18:05', { changeoverMin: 30 })];
		const input = { date: DAY, bookings, blocks: [{ start: at('20:10'), end: at('20:40') }], settings: SETTINGS, seasons: SEASONS };
		for (const found of unbookedStartTimes(input)) {
			const offer = offeredStartTimes({ ...input, now: addMinutes(found.start, -1) }).find((o) => o.start === found.start);
			expect(offer?.durations.length).toBeGreaterThan(0);
			expect(offer?.heat).toBe(found.heat);
		}
		const byMinute: string[] = [];
		for (let m = SETTINGS.openMinute; m < SETTINGS.closeMinute; m++) {
			const start = toInstant(DAY, m);
			const offer = offeredStartTimes({ ...input, now: addMinutes(start, -1) }).find((o) => o.start === start);
			if (offer && offer.kinds.some((k) => k !== 3)) byMinute.push(start);
		}
		expect(unbookedStartTimes(input).map((u) => u.start)).toEqual(byMinute);
	});
});
