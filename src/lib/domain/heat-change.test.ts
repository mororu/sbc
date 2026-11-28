// Story 2.3: which way a notice moved, whether it is worth an email, and the affected booking.
// Changeover 15, pre-heat 30–40 unless stated; Sat 16 Jan 2027 (UTC+1).
import { describe, expect, it } from 'vitest';
import { toInstant, type Instant } from '#lib/time/index.ts';
import { affectedBooking, classifyHeatChange, heatChangeDirection } from './heat-change.ts';
import { bookingNotice, type Notice } from './notice.ts';
import type { Booking } from './heat.ts';

const DAY = '2027-01-16';
const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};
const at = (hhmm: string): Instant => toInstant(DAY, minutes(hhmm));
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
const cold = (earliest: string, latest: string | null): Notice => ({
	heat: 'cold',
	earliest: at(earliest),
	latest: latest === null ? null : at(latest)
});

let nextId = 1;
const booking = (from: string, to: string, opts: Partial<Booking> = {}): Booking => ({
	id: nextId++,
	start: at(from),
	durationMin: minutes(to) - minutes(from),
	changeoverMin: 15,
	createdAt: '2027-01-01T10:00:00Z',
	...opts
});
const preheat = { minMin: 30, maxMin: 40 };
const settings = { changeoverMin: 15, preheatMaxMin: 40 };

describe('heatChangeDirection and classifyHeatChange', () => {
	it.each([
		['equal hot', HOT, HOT, 'none', 'none'],
		['equal cold', cold('17:50', '18:00'), cold('17:50', '18:00'), 'none', 'none'],
		['equal collapsed', cold('17:45', null), cold('17:45', null), 'none', 'none'],
		['cold → hot', cold('17:50', '18:00'), HOT, 'now_hot', 'good_news'],
		['collapsed → hot', cold('17:45', null), HOT, 'now_hot', 'good_news'],
		['hot → cold', HOT, cold('17:50', '18:00'), 'now_cold', 'urgent'],
		['hot → collapsed', HOT, cold('17:45', null), 'now_cold', 'urgent'],
		['later earliest', cold('17:20', '17:30'), cold('17:25', '17:30'), 'later_earliest', 'urgent'],
		['range → collapsed (later earliest)', cold('17:20', '17:30'), cold('17:45', null), 'later_earliest', 'urgent'],
		['earlier latest', cold('17:20', '17:30'), cold('17:10', '17:20'), 'earlier_latest', 'urgent'],
		['collapsed → range with an earlier latest', cold('17:45', null), cold('17:20', '17:30'), 'earlier_latest', 'urgent'],
		['later earliest and earlier latest: later earliest wins', cold('17:20', '17:40'), cold('17:25', '17:30'), 'later_earliest', 'urgent'],
		['widen: earlier earliest', cold('17:20', '17:30'), cold('17:15', '17:30'), 'none', 'none'],
		['widen: later latest', cold('17:20', '17:30'), cold('17:20', '17:35'), 'none', 'none'],
		['widen both ways', cold('17:20', '17:30'), cold('17:10', '17:40'), 'none', 'none'],
		['collapsed → range that only widens', cold('17:45', null), cold('17:40', '17:50'), 'none', 'none'],
		['collapsed → range with the same latest', cold('17:45', null), cold('17:35', '17:45'), 'none', 'none']
	] as const)('%s', (_name, lastTold, current, direction, classification) => {
		expect(heatChangeDirection(lastTold, current)).toBe(direction);
		expect(classifyHeatChange(lastTold, current)).toBe(classification);
	});

	it('compares instants, not their text', () => {
		const told: Notice = { heat: 'cold', earliest: '2027-01-16T16:20:00Z', latest: '2027-01-16T16:30:00Z' };
		const same: Notice = { heat: 'cold', earliest: '2027-01-16T16:20:00.000Z', latest: '2027-01-16T16:30:00Z' };
		expect(heatChangeDirection(told, same)).toBe('none');
	});

	it('classifies the good-news story example: 18:30 becomes hot after a booking 17:15–18:15', () => {
		const before = booking('16:00', '17:00');
		const self = booking('18:30', '20:00');
		const told = bookingNotice(self, [before, self], [], preheat);
		expect(told).toEqual(cold('17:50', '18:00'));
		const current = bookingNotice(self, [before, booking('17:15', '18:15'), self], [], preheat);
		expect(classifyHeatChange(told, current)).toBe('good_news');
	});

	it('classifies the collapsed story example: 18:00 told 17:20–17:30, then a booking 16:30–17:30', () => {
		const self = booking('18:00', '19:30');
		const told = bookingNotice(self, [self], [], preheat);
		expect(told).toEqual(cold('17:20', '17:30'));
		const current = bookingNotice(self, [booking('16:30', '17:30'), self], [], preheat);
		expect(current).toEqual(cold('17:45', null));
		expect(heatChangeDirection(told, current)).toBe('later_earliest');
		expect(classifyHeatChange(told, current)).toBe('urgent');
	});
});

describe('affectedBooking', () => {
	it('finds the first live booking from the end up to end + changeover + pre-heat max', () => {
		const end = at('17:00');
		const inWindow = booking('17:40', '18:40');
		const later = booking('19:00', '20:00');
		expect(affectedBooking({ end }, [later, inWindow], settings)).toBe(inWindow);
	});

	it('includes both window boundaries', () => {
		const end = at('17:00');
		const atEnd = booking('17:00', '18:00');
		const atWindowEnd = booking('17:55', '18:55');
		expect(affectedBooking({ end }, [atEnd], settings)).toBe(atEnd);
		expect(affectedBooking({ end }, [atWindowEnd], settings)).toBe(atWindowEnd);
	});

	it('ignores bookings outside the window', () => {
		const end = at('17:00');
		expect(affectedBooking({ end }, [booking('15:30', '16:30'), booking('17:56', '18:56')], settings)).toBeNull();
		expect(affectedBooking({ end }, [booking('16:59', '17:59')], settings)).toBeNull();
	});

	it('never returns the item itself or a deleted booking', () => {
		const self = booking('16:00', '17:00');
		const deleted = booking('17:15', '18:15', { deletedAt: '2027-01-10T10:00:00Z' });
		expect(affectedBooking({ end: at('17:00'), bookingId: self.id }, [self, deleted], settings)).toBeNull();
		const zero = booking('17:00', '18:00');
		expect(affectedBooking({ end: at('17:00'), bookingId: zero.id }, [zero], settings)).toBeNull();
	});

	it('uses the current changeover and the longer pre-heat end', () => {
		const end = at('17:00');
		const b = booking('18:10', '19:10');
		expect(affectedBooking({ end }, [b], { changeoverMin: 30, preheatMaxMin: 40 })).toBe(b);
		expect(affectedBooking({ end }, [b], { changeoverMin: 15, preheatMaxMin: 40 })).toBeNull();
	});

	describe('after the changeover was lowered (retro D1)', () => {
		// A 10:00–12:00 made with changeover 60; the current changeover is 15 (old window ends 12:55).
		const lowered = { changeoverMin: 15, preheatMaxMin: 40 };
		const madeWith60 = (from: string, to: string) => booking(from, to, { changeoverMin: 60 });

		it('widens the window with the largest stored changeover', () => {
			const a = madeWith60('10:00', '12:00');
			const b = madeWith60('13:00', '14:00');
			expect(affectedBooking({ end: at('12:00'), bookingId: a.id }, [a, b], lowered)).toBe(b);
		});

		it('takes a stored changeover from a booking other than the item or the candidate', () => {
			const a = booking('10:00', '12:00');
			const b = booking('13:00', '14:00');
			const other = madeWith60('16:00', '17:00');
			expect(affectedBooking({ end: at('12:00'), bookingId: a.id }, [a, b, other], lowered)).toBe(b);
		});

		it('ignores the stored changeover of a deleted booking', () => {
			const a = booking('10:00', '12:00');
			const b = booking('13:00', '14:00');
			const deleted = { ...madeWith60('16:00', '17:00'), deletedAt: '2027-01-10T10:00:00Z' };
			expect(affectedBooking({ end: at('12:00'), bookingId: a.id }, [a, b, deleted], lowered)).toBeNull();
		});

		it('still lets the first booking after the end shield the rest', () => {
			const a = madeWith60('10:00', '12:00');
			const between = booking('12:15', '12:45');
			const b = madeWith60('13:00', '14:00');
			expect(affectedBooking({ end: at('12:00'), bookingId: a.id }, [a, b, between], lowered)).toBe(between);
		});

		it('finds nothing beyond the largest changeover plus the pre-heat max', () => {
			const a = madeWith60('10:00', '12:00');
			const b = madeWith60('13:45', '14:45');
			expect(affectedBooking({ end: at('12:00'), bookingId: a.id }, [a, b], lowered)).toBeNull();
		});

		it('keeps the current changeover when it is the larger one', () => {
			const b = booking('18:10', '19:10');
			expect(affectedBooking({ end: at('17:00') }, [b], { changeoverMin: 30, preheatMaxMin: 40 })).toBe(b);
		});
	});
});
