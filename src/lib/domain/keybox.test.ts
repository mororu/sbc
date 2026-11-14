// Keybox cutoff (AD-9): 24 hours of real time before the start.
import { describe, expect, it } from 'vitest';
import { formatTime, localDate, toInstant } from '#lib/time/index.ts';
import { isPastKeyboxCutoff, KEYBOX_LEAD_MIN, keyboxCutoff } from './keybox.ts';

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
