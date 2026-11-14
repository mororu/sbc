// Keybox cutoff (AD-9): 24 hours of real time before the start.
import { describe, expect, it } from 'vitest';
import { formatTime, localDate, toInstant } from '#lib/time/index.ts';
import {
	isKeyboxPhase,
	isPastKeyboxCutoff,
	KEYBOX_LEAD_MIN,
	keyboxCutoff,
	keyboxDueAt,
	missingKeyboxSetting
} from './keybox.ts';

/** 18:00 in Zurich on 12 January 2027 (UTC+1). */
const START = '2027-01-12T17:00:00Z';

describe('KEYBOX_LEAD_MIN', () => {
	it('is 24 hours', () => {
		expect(KEYBOX_LEAD_MIN).toBe(1440);
	});
});

describe('keyboxCutoff', () => {
	it('is 24 hours before the start', () => {
		expect(keyboxCutoff(START)).toBe('2027-01-11T17:00:00Z');
	});

	it('counts 24 hours of real time across the spring clock change', () => {
		// 03:30 on 28 March 2027, just after the switch to summer time (UTC+2).
		const start = toInstant('2027-03-28', 210);
		expect(start).toBe('2027-03-28T01:30:00Z');
		const cutoff = keyboxCutoff(start);
		expect(cutoff).toBe('2027-03-27T01:30:00Z');
		// On the wall clock the two are 25 hours apart: 02:30 the day before (UTC+1).
		expect(localDate(cutoff)).toBe('2027-03-27');
		expect(formatTime(cutoff)).toBe('02:30');
	});

	it('counts 24 hours of real time across the autumn clock change', () => {
		// 01:30 on 1 November 2027, winter time (UTC+1); the switch back was on 31 October.
		const start = toInstant('2027-11-01', 90);
		expect(start).toBe('2027-11-01T00:30:00Z');
		const cutoff = keyboxCutoff(start);
		expect(cutoff).toBe('2027-10-31T00:30:00Z');
		// On the wall clock the two are 23 hours apart: 02:30 summer time (UTC+2) the day before.
		expect(localDate(cutoff)).toBe('2027-10-31');
		expect(formatTime(cutoff)).toBe('02:30');
	});
});

describe('isPastKeyboxCutoff', () => {
	it('is false one second before the cutoff', () => {
		expect(isPastKeyboxCutoff(START, '2027-01-11T16:59:59Z')).toBe(false);
	});

	it('is true exactly at the cutoff', () => {
		expect(isPastKeyboxCutoff(START, '2027-01-11T17:00:00Z')).toBe(true);
	});

	it('is true after the cutoff', () => {
		expect(isPastKeyboxCutoff(START, '2027-01-11T17:00:01Z')).toBe(true);
		expect(isPastKeyboxCutoff(START, START)).toBe(true);
	});

	it('uses the real-time cutoff across the spring clock change', () => {
		const start = '2027-03-28T01:30:00Z';
		expect(isPastKeyboxCutoff(start, '2027-03-27T01:29:59Z')).toBe(false);
		expect(isPastKeyboxCutoff(start, '2027-03-27T01:30:00Z')).toBe(true);
	});

	it('uses the real-time cutoff across the autumn clock change', () => {
		const start = '2027-11-01T00:30:00Z';
		expect(isPastKeyboxCutoff(start, '2027-10-31T00:29:59Z')).toBe(false);
		expect(isPastKeyboxCutoff(start, '2027-10-31T00:30:00Z')).toBe(true);
	});
});

describe('keyboxDueAt', () => {
	it('is the cutoff for a booking made before it', () => {
		// Tue 12 Jan 2027 18:00, booked on Thu 7 Jan.
		expect(keyboxDueAt(START, '2027-01-07T10:00:00Z')).toBe('2027-01-11T17:00:00Z');
	});

	it('is the real-time cutoff across the spring clock change', () => {
		// Sun 28 Mar 2027 10:00 (UTC+2): 24 hours earlier is 09:00 on Saturday (UTC+1).
		const start = toInstant('2027-03-28', 600);
		expect(start).toBe('2027-03-28T08:00:00Z');
		expect(keyboxDueAt(start, '2027-03-20T10:00:00Z')).toBe('2027-03-27T08:00:00Z');
	});

	it('is now for a booking made past the cutoff', () => {
		// 15:30 for 18:00 the same day.
		const now = '2027-01-12T14:30:00Z';
		expect(keyboxDueAt(START, now)).toBe(now);
	});

	it('is the cutoff exactly at it', () => {
		expect(keyboxDueAt(START, '2027-01-11T17:00:00Z')).toBe('2027-01-11T17:00:00Z');
	});
});

describe('missingKeyboxSetting', () => {
	const filled = { code: '4711', instructions: { de: 'Box links', en: 'Box on the left' } };

	it('is null when the code and the instructions in the locale are set', () => {
		expect(missingKeyboxSetting(filled, 'de')).toBeNull();
		expect(missingKeyboxSetting(filled, 'en')).toBeNull();
	});

	it('names a missing or blank code first', () => {
		expect(missingKeyboxSetting({ ...filled, code: null }, 'de')).toBe('keybox_code');
		expect(missingKeyboxSetting({ code: '  ', instructions: { de: null, en: null } }, 'en')).toBe('keybox_code');
	});

	it('names only the instructions in the booking locale', () => {
		const deOnly = { ...filled, instructions: { de: 'Box links', en: ' ' } };
		expect(missingKeyboxSetting(deOnly, 'de')).toBeNull();
		expect(missingKeyboxSetting(deOnly, 'en')).toBe('keybox_instructions_en');
		const enOnly = { ...filled, instructions: { de: null, en: 'Box on the left' } };
		expect(missingKeyboxSetting(enOnly, 'de')).toBe('keybox_instructions_de');
		expect(missingKeyboxSetting(enOnly, 'en')).toBeNull();
	});
});

describe('isKeyboxPhase', () => {
	it('is true for the terminal keybox states only', () => {
		for (const state of ['accepted', 'refused', 'expired'] as const) expect(isKeyboxPhase(state)).toBe(true);
		for (const state of ['pending', 'in_flight', 'transient_failure', 'cancelled'] as const) {
			expect(isKeyboxPhase(state)).toBe(false);
		}
	});
});
