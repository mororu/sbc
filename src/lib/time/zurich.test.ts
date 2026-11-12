import { describe, expect, it } from 'vitest';
import {
	addDays,
	addMinutes,
	compareDates,
	compareInstants,
	formatDateLong,
	formatDateShort,
	formatDateTitle,
	formatDayMonth,
	formatTime,
	formatWeekday,
	formatWeekdayShort,
	formatDayNumber,
	hoursInDay,
	isValidDate,
	isValidInstant,
	lastBookableDay,
	localDate,
	localMinuteOfDay,
	minutesBetween,
	toInstant,
	today
} from './zurich.ts';

describe('toInstant', () => {
	it('converts winter wall-clock (UTC+1)', () => {
		expect(toInstant('2027-01-12', 17 * 60)).toBe('2027-01-12T16:00:00Z');
	});

	it('converts summer wall-clock (UTC+2) on the switch day', () => {
		expect(toInstant('2027-03-28', 10 * 60)).toBe('2027-03-28T08:00:00Z');
	});

	it('resolves a time skipped by the spring switch to the later offset', () => {
		expect(toInstant('2027-03-28', 2 * 60 + 30)).toBe('2027-03-28T01:30:00Z');
	});

	it('treats 1440 as the next midnight', () => {
		expect(toInstant('2027-01-12', 1440)).toBe('2027-01-12T23:00:00Z');
	});
});

describe('localDate and localMinuteOfDay', () => {
	it('read Zurich date and clock time', () => {
		expect(localDate('2027-01-12T23:30:00Z')).toBe('2027-01-13');
		expect(localMinuteOfDay('2027-01-12T16:15:00Z')).toBe(17 * 60 + 15);
		expect(localMinuteOfDay('2027-03-28T08:00:00Z')).toBe(10 * 60);
	});
});

describe('instant arithmetic', () => {
	it('adds real minutes', () => {
		expect(addMinutes('2027-01-12T16:00:00Z', 75)).toBe('2027-01-12T17:15:00Z');
	});

	it('adds real minutes across the spring switch', () => {
		expect(addMinutes('2027-03-28T00:30:00Z', 60)).toBe('2027-03-28T01:30:00Z');
		expect(localMinuteOfDay('2027-03-28T01:30:00Z')).toBe(3 * 60 + 30);
	});

	it('measures and compares', () => {
		expect(minutesBetween('2027-01-12T16:00:00Z', '2027-01-12T17:15:00Z')).toBe(75);
		expect(minutesBetween('2027-01-12T17:15:00Z', '2027-01-12T16:00:00Z')).toBe(-75);
		expect(compareInstants('2027-01-12T16:00:00Z', '2027-01-12T17:00:00Z')).toBeLessThan(0);
		expect(compareInstants('2027-01-12T17:00:00Z', '2027-01-12T17:00:00Z')).toBe(0);
	});
});

describe('calendar days', () => {
	it('adds days and compares dates', () => {
		expect(addDays('2027-03-27', 1)).toBe('2027-03-28');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(compareDates('2027-01-09', '2027-01-10')).toBeLessThan(0);
	});

	it('reads today in Zurich, not UTC', () => {
		expect(today('2026-12-25T23:30:00Z')).toBe('2026-12-26');
	});

	it('counts the horizon in calendar days: 26 December + 14 is 9 January', () => {
		expect(lastBookableDay('2026-12-26T08:00:00Z', 14)).toBe('2027-01-09');
		expect(lastBookableDay('2026-12-26T22:59:00Z', 14)).toBe('2027-01-09');
	});

	it('knows the 23-hour spring day and the 25-hour autumn day', () => {
		expect(hoursInDay('2027-03-28')).toBe(23);
		expect(hoursInDay('2027-10-31')).toBe(25);
		expect(hoursInDay('2027-01-12')).toBe(24);
	});

	it.each([
		['2027-01-12', true],
		['2027-02-29', false],
		['2027-13-01', false],
		['2027-1-12', false],
		['12.01.2027', false],
		['', false]
	])('isValidDate(%s) is %s', (value, expected) => {
		expect(isValidDate(value)).toBe(expected);
	});
});

describe('isValidInstant', () => {
	it.each([
		['2027-01-12T16:45:00Z', true],
		['2027-03-28T07:20:00Z', true],
		['2027-01-12T16:45Z', false],
		['2027-01-12T16:45:00.000Z', false],
		['2027-01-12T16:45:00+01:00', false],
		['2027-02-30T16:45:00Z', false],
		['2027-01-12T24:00:00Z', false],
		['2027-01-12T16:45:60Z', false],
		['2027-01-12T16:45:00z', false],
		[' 2027-01-12T16:45:00Z', false],
		['2027-01-12T16:45:00Z ', false],
		['\n2027-01-12T16:45:00Z\n', false],
		['', false]
	])('isValidInstant(%s) is %s', (value, expected) => {
		expect(isValidInstant(value)).toBe(expected);
	});
});

describe('formatting', () => {
	it.each([
		['de', 'Dienstag, 12. Januar', 'Di 12. Januar'],
		['en', 'Tuesday, 12 January', 'Tue 12 January']
	] as const)('formats dates in %s', (locale, long, short) => {
		expect(formatDateLong('2027-01-12', locale)).toBe(long);
		expect(formatDateShort('2027-01-12', locale)).toBe(short);
	});

	it.each([
		['de', '12. Januar', 'Dienstag', 'Di, 12. Januar'],
		['en', '12 January', 'Tuesday', 'Tue, 12 January']
	] as const)('formats heading and title parts in %s', (locale, dayMonth, weekday, title) => {
		expect(formatDayMonth('2027-01-12', locale)).toBe(dayMonth);
		expect(formatWeekday('2027-01-12', locale)).toBe(weekday);
		expect(formatDateTitle('2027-01-12', locale)).toBe(title);
	});

	it('formats single-digit days and other months', () => {
		expect(formatDayMonth('2027-01-09', 'de')).toBe('9. Januar');
		expect(formatDayMonth('2026-12-26', 'en')).toBe('26 December');
		expect(formatDateTitle('2027-03-28', 'de')).toBe('So, 28. März');
	});

	it('formats the DST day correctly', () => {
		expect(formatDateLong('2027-03-28', 'de')).toBe('Sonntag, 28. März');
		expect(formatDateShort('2027-03-28', 'en')).toBe('Sun 28 March');
	});

	it.each([
		['de', '2027-01-13', 'Mi', '13'],
		['en', '2027-01-13', 'Wed', '13'],
		['de', '2027-01-09', 'Sa', '9'],
		['en', '2027-03-28', 'Sun', '28']
	] as const)('formats strip cells in %s (%s)', (locale, date, weekday, day) => {
		expect(formatWeekdayShort(date, locale)).toBe(weekday);
		expect(formatDayNumber(date, locale)).toBe(day);
	});

	it('formats Zurich clock times', () => {
		expect(formatTime('2027-01-12T17:15:00Z')).toBe('18:15');
		expect(formatTime('2027-03-28T08:00:00Z')).toBe('10:00');
	});
});
