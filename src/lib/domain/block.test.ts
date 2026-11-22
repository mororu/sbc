// Story 3.5: block conflicts (Overlap, Gap, Adjacent) and the FR-19 regression (a block never
// heats and needs no changeover after it). Mon 11 Jan 2027 (UTC+1), changeover 15, pre-heat 30–40.
import { describe, expect, it } from 'vitest';
import { formatTime, toInstant, type Instant } from '#lib/time/index.ts';
import { blockConflict } from './block.ts';
import type { Booking, Settings } from './heat.ts';
import { offeredStartTimes } from './start-times.ts';

const DAY = '2027-01-11';
const at = (hhmm: string): Instant => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(DAY, h * 60 + m);
};
let n = 0;
const booking = (start: string, over: Partial<Booking> = {}): Booking => ({
	id: ++n,
	start: at(start),
	durationMin: 60,
	changeoverMin: 15,
	createdAt: '2027-01-07T10:00:00Z',
	...over
});
const block = (start: string, end: string) => ({ start: at(start), end: at(end) });

describe('blockConflict: Overlap', () => {
	it('lists every live booking the block intersects, in start order', () => {
		const ben = booking('19:30');
		const anna = booking('18:00');
		expect(blockConflict(block('18:30', '20:00'), [ben, anna])).toEqual({ kind: 'overlap', bookings: [anna, ben] });
	});

	it('ignores deleted bookings', () => {
		expect(blockConflict(block('18:30', '20:00'), [booking('18:00', { deletedAt: '2027-01-10T08:00:00Z' })])).toBeNull();
	});

	it('wins over a gap', () => {
		const a = booking('17:00');
		const b = booking('18:15');
		expect(blockConflict(block('17:30', '18:10'), [a, b])).toEqual({ kind: 'overlap', bookings: [a] });
	});
});

describe('blockConflict: Gap', () => {
	const pair = () => [booking('17:00'), booking('18:15')];

	it.each([
		['the whole gap', '18:00', '18:15'],
		['a part of it', '18:05', '18:10'],
		['its start', '17:55', '18:05']
	])('refuses %s of a back-to-back pair', (_, start, end) => {
		const [a, b] = pair();
		// 17:55 overlaps a (17:00–18:00): overlap wins.
		const expected = start === '17:55' ? { kind: 'overlap', bookings: [a] } : { kind: 'gap' };
		expect(blockConflict(block(start, end), [a, b])).toEqual(expected);
	});

	it('uses the changeover recorded on the later-made booking (AD-8)', () => {
		// The later-made one recorded 20: a 15-minute gap is not back to back, so the block fits.
		const a = booking('17:00', { createdAt: '2027-01-07T10:00:00Z' });
		const b = booking('18:15', { changeoverMin: 20, createdAt: '2027-01-08T10:00:00Z' });
		expect(blockConflict(block('18:00', '18:15'), [a, b])).toBeNull();
		const c = booking('18:20', { changeoverMin: 20, createdAt: '2027-01-08T10:00:00Z' });
		expect(blockConflict(block('18:00', '18:20'), [a, c])).toEqual({ kind: 'gap' });
	});
});

describe('blockConflict: recorded changeover and exact cover', () => {
	it('refuses the gap of a pair recorded with 20 minutes, whatever the current setting', () => {
		// The current changeover may be 15 now; the pair was made with 20 and is back to back.
		const a = booking('17:00', { changeoverMin: 20 });
		const b = booking('18:20', { changeoverMin: 20, createdAt: '2027-01-08T10:00:00Z' });
		expect(blockConflict(block('18:00', '18:20'), [a, b])).toEqual({ kind: 'gap' });
		expect(blockConflict(block('18:05', '18:15'), [a, b])).toEqual({ kind: 'gap' });
	});

	it('refuses a block that exactly covers a booking as an overlap', () => {
		const a = booking('17:00');
		expect(blockConflict(block('17:00', '18:00'), [a])).toEqual({ kind: 'overlap', bookings: [a] });
	});
});

describe('blockConflict: Adjacent', () => {
	it('allows a block touching a booking’s end or start, with no gap pair', () => {
		expect(blockConflict(block('19:00', '19:30'), [booking('18:00')])).toBeNull();
		expect(blockConflict(block('17:00', '18:00'), [booking('18:00')])).toBeNull();
	});

	it('allows a block in a longer gap than the changeover', () => {
		expect(blockConflict(block('19:00', '19:30'), [booking('18:00'), booking('20:00')])).toBeNull();
	});
});

describe('FR-19: a block never heats and needs no changeover', () => {
	const settings: Settings = {
		changeoverMin: 15,
		openMinute: 600,
		closeMinute: 1320,
		horizonDays: 14,
		preheatMinMin: 30,
		preheatMaxMin: 40
	};
	it('offers 11:30 as a cold start after a block ending 11:10, and no kind-2 time from the block end', () => {
		const offered = offeredStartTimes({
			date: DAY,
			bookings: [],
			blocks: [block('09:00', '11:10')],
			settings,
			seasons: [{ startDate: '2027-01-09', endDate: '2027-04-30' }],
			now: '2027-01-11T07:00:00Z'
		});
		const times = offered.map((o) => formatTime(o.start));
		expect(times[0]).toBe('11:30');
		expect(times).not.toContain('11:25');
		expect(offered[0].heat).toBe('cold');
	});
});
