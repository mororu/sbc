import { describe, expect, it } from 'vitest';
import { bookedHref, bookHref, dayError, dayErrorHref, parseHhmm } from './guest-urls.ts';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';

describe('bookedHref', () => {
	it('carries only the one-time flags', () => {
		expect(bookedHref(TOKEN, false)).toBe(`/booked/${TOKEN}?new=1`);
		expect(bookedHref(TOKEN, true)).toBe(`/booked/${TOKEN}?new=1&changed=1`);
	});
});

describe('parseHhmm', () => {
	it('reads a valid hhmm as clock text and minute of the day', () => {
		expect(parseHhmm('0000')).toEqual({ clock: '00:00', minute: 0 });
		expect(parseHhmm('2359')).toEqual({ clock: '23:59', minute: 1439 });
	});

	it('refuses anything else', () => {
		expect(parseHhmm('2400')).toBeNull();
		expect(parseHhmm('0960')).toBeNull();
		expect(parseHhmm('180')).toBeNull();
		expect(parseHhmm(null)).toBeNull();
	});
});

describe('dayErrorHref', () => {
	it('carries only the code and the time', () => {
		expect(dayErrorHref('2027-01-12', '1800', 'conflict')).toBe('/day/2027-01-12?error=conflict&time=1800');
		expect(dayErrorHref('2027-01-12', '1800', 'past')).toBe('/day/2027-01-12?error=past&time=1800');
	});
});

describe('bookHref', () => {
	it('names the local start time in winter and in summer time', () => {
		expect(bookHref('2027-01-12', '2027-01-12T17:00:00Z')).toBe('/book/2027-01-12/1800');
		expect(bookHref('2027-04-12', '2027-04-12T16:00:00Z')).toBe('/book/2027-04-12/1800');
	});
});

describe('dayError', () => {
	it('is null for an unknown code or a bad time', () => {
		expect(dayError('nope', '1800', 'de')).toBeNull();
		expect(dayError(null, '1800', 'de')).toBeNull();
		expect(dayError('conflict', '2400', 'de')).toBeNull();
		expect(dayError('conflict', null, 'de')).toBeNull();
	});

	it('tells a conflict in DE and EN', () => {
		expect(dayError('conflict', '1800', 'de')).toEqual({
			text: '18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da.'
		});
		expect(dayError('conflict', '1800', 'en')).toEqual({
			text: "Someone just took 18:00. Here's the day as it is now. Your details are still filled in."
		});
	});

	it('tells a past start', () => {
		expect(dayError('past', '1800', 'de')).toEqual({ text: '18:00 hat schon angefangen. Wähl bitte eine andere Zeit.' });
	});
});
