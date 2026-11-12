// Season states and redirect targets (FR-1). Seed settings: horizon 14; season 9 Jan – 30 Apr 2027.
import { describe, expect, it } from 'vitest';
import { calendarState, nearestSelectableDay, selectableDays } from './calendar.ts';
import type { Season, Settings } from './start-times.ts';

const settings: Settings = { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 };
const season: Season = { startDate: '2027-01-09', endDate: '2027-04-30' };
const seasons = [season];
/** 10:00 in Zurich (UTC+1 in winter). */
const at = (date: string) => `${date}T09:00:00Z`;

describe('calendarState', () => {
	it('is open inside the season, from today to the end of the horizon', () => {
		expect(calendarState({ seasons, settings, now: at('2027-01-12') })).toEqual({
			kind: 'open',
			firstDay: '2027-01-12',
			lastDay: '2027-01-26'
		});
	});

	it('is before the season when booking has not opened yet', () => {
		expect(calendarState({ seasons, settings, now: at('2026-12-20') })).toEqual({
			kind: 'before',
			seasonStart: '2027-01-09',
			bookingOpens: '2026-12-26'
		});
	});

	it('opens exactly one horizon before the season starts', () => {
		expect(calendarState({ seasons, settings, now: at('2026-12-25') }).kind).toBe('before');
		expect(calendarState({ seasons, settings, now: at('2026-12-26') })).toEqual({
			kind: 'open',
			firstDay: '2027-01-09',
			lastDay: '2027-01-09',
			seasonStartsOn: '2027-01-09'
		});
	});

	it('is open with the season start when booking is open but the season has not begun', () => {
		expect(calendarState({ seasons, settings, now: at('2026-12-28') })).toEqual({
			kind: 'open',
			firstDay: '2027-01-09',
			lastDay: '2027-01-11',
			seasonStartsOn: '2027-01-09'
		});
	});

	it('clips the last day to the season end', () => {
		expect(calendarState({ seasons, settings, now: at('2027-04-25') })).toEqual({
			kind: 'open',
			firstDay: '2027-04-25',
			lastDay: '2027-04-30'
		});
	});

	it('is after the season once the last season has ended, or with no season', () => {
		expect(calendarState({ seasons, settings, now: at('2027-05-01') })).toEqual({ kind: 'after' });
		expect(calendarState({ seasons: [], settings, now: at('2027-01-12') })).toEqual({ kind: 'after' });
	});

	it('switches to the before state when a later season exists', () => {
		const next: Season = { startDate: '2028-01-08', endDate: '2028-04-29' };
		expect(calendarState({ seasons: [next, season], settings, now: at('2027-05-01') })).toEqual({
			kind: 'before',
			seasonStart: '2028-01-08',
			bookingOpens: '2027-12-25'
		});
	});

	it('counts today in Zurich, not UTC', () => {
		// 23:30 UTC on 8 January is already 9 January in Zurich.
		expect(calendarState({ seasons, settings, now: '2027-01-08T23:30:00Z' })).toMatchObject({
			kind: 'open',
			firstDay: '2027-01-09'
		});
	});
});

describe('selectableDays', () => {
	it('skips days between two seasons', () => {
		const split: Season[] = [
			{ startDate: '2027-01-09', endDate: '2027-01-14' },
			{ startDate: '2027-01-20', endDate: '2027-04-30' }
		];
		const days = selectableDays({ seasons: split, settings, now: at('2027-01-12') });
		expect(days).toContain('2027-01-14');
		expect(days).not.toContain('2027-01-15');
		expect(days).toContain('2027-01-20');
	});
});

describe('nearestSelectableDay', () => {
	const input = { seasons, settings, now: at('2027-01-12') };

	it.each([
		['a selectable day', '2027-01-13', '2027-01-13'],
		['a past day', '2026-01-01', '2027-01-12'],
		['yesterday', '2027-01-11', '2027-01-12'],
		['a day beyond the horizon', '2027-02-20', '2027-01-26'],
		['an impossible date', '2027-02-30', '2027-01-12'],
		['garbage', 'abc', '2027-01-12'],
		['an empty string', '', '2027-01-12']
	])('sends %s to the nearest selectable day', (_label, date, expected) => {
		expect(nearestSelectableDay(date, input)).toBe(expected);
	});

	it('picks the closest day outside a season, the earlier on a tie', () => {
		const split: Season[] = [
			{ startDate: '2027-01-09', endDate: '2027-01-14' },
			{ startDate: '2027-01-20', endDate: '2027-04-30' }
		];
		const gap = { seasons: split, settings, now: at('2027-01-12') };
		expect(nearestSelectableDay('2027-01-16', gap)).toBe('2027-01-14');
		expect(nearestSelectableDay('2027-01-17', gap)).toBe('2027-01-14');
		expect(nearestSelectableDay('2027-01-18', gap)).toBe('2027-01-20');
	});

	it('sends a day before the season to the first season day', () => {
		expect(nearestSelectableDay('2026-12-30', { seasons, settings, now: at('2026-12-28') })).toBe(
			'2027-01-09'
		);
	});

	it('is null when no day is selectable', () => {
		expect(nearestSelectableDay('2027-01-12', { seasons, settings, now: at('2026-12-20') })).toBeNull();
		expect(nearestSelectableDay('abc', { seasons: [], settings, now: at('2027-01-12') })).toBeNull();
	});
});
