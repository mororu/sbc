// Story 3.2 matrix, "Flag": the out-of-times flag against season 2027-01-09…2027-03-31, hours 16:00–22:00.
import { describe, expect, it } from 'vitest';
import { outsideCurrentTimes } from './flags.ts';

const SEASONS = [{ startDate: '2027-01-09', endDate: '2027-03-31' }];
const HOURS = { openMinute: 16 * 60, closeMinute: 22 * 60 };

describe('outsideCurrentTimes', () => {
	it('is false for a booking inside the season and the hours, up to the closing time', () => {
		expect(outsideCurrentTimes({ start: '2027-01-12T15:00:00Z', durationMin: 60 }, SEASONS, HOURS)).toBe(false);
		// 20:30–22:00 ends exactly at closing.
		expect(outsideCurrentTimes({ start: '2027-01-12T19:30:00Z', durationMin: 90 }, SEASONS, HOURS)).toBe(false);
	});

	it('is true when the booking ends after closing (21:30–23:00)', () => {
		expect(outsideCurrentTimes({ start: '2027-01-12T20:30:00Z', durationMin: 90 }, SEASONS, HOURS)).toBe(true);
	});

	it('is true when the booking starts before opening', () => {
		expect(outsideCurrentTimes({ start: '2027-01-12T14:30:00Z', durationMin: 60 }, SEASONS, HOURS)).toBe(true);
	});

	it('is true on a date in no season row (2027-04-05), and false on the season edges', () => {
		expect(outsideCurrentTimes({ start: '2027-04-05T16:00:00Z', durationMin: 60 }, SEASONS, HOURS)).toBe(true);
		expect(outsideCurrentTimes({ start: '2027-01-09T15:00:00Z', durationMin: 60 }, SEASONS, HOURS)).toBe(false);
		expect(outsideCurrentTimes({ start: '2027-03-31T15:00:00Z', durationMin: 60 }, SEASONS, HOURS)).toBe(false);
		expect(outsideCurrentTimes({ start: '2027-01-12T15:00:00Z', durationMin: 60 }, [], HOURS)).toBe(true);
	});

	it('judges the local date and hours in Zurich, also in summer time', () => {
		const summer = [{ startDate: '2027-04-01', endDate: '2027-04-30' }];
		// 16:00 CEST is 14:00 UTC.
		expect(outsideCurrentTimes({ start: '2027-04-05T14:00:00Z', durationMin: 60 }, summer, HOURS)).toBe(false);
		expect(outsideCurrentTimes({ start: '2027-04-05T13:55:00Z', durationMin: 60 }, summer, HOURS)).toBe(true);
	});
});
