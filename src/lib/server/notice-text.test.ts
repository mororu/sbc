// The notice sentences on their own. The day rows, the form and the badge cover them in context.
import { describe, expect, it } from 'vitest';
import type { Notice } from '#lib/domain/index.ts';
import { coldNoticeText, durationLimit, offerNoticeText, sentence } from './notice-text.ts';

/** 18:00 in Zurich on 12 January 2027. */
const START = '2027-01-12T17:00:00Z';
/** 09:00 in Zurich. */
const NOW = '2027-01-12T08:00:00Z';
const window: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };
const short: Notice = { heat: 'cold', earliest: '2027-01-12T16:45:00Z', latest: null };

describe('durationLimit', () => {
	it('names one duration, a shorter prefix, or nothing for all of them', () => {
		expect(durationLimit([60], 'de')).toBe('Nur 60 Min.');
		expect(durationLimit([60, 90], 'de')).toBe('Bis 90 Min.');
		expect(durationLimit([60, 90], 'en')).toBe('Up to 90 min');
		expect(durationLimit([60, 90, 120, 150, 180], 'de')).toBeNull();
	});
});

describe('sentence', () => {
	it('ends a part with a full stop unless it has one', () => {
		expect(sentence('Up to 90 min')).toBe('Up to 90 min.');
		expect(sentence('Nur 60 Min.')).toBe('Nur 60 Min.');
		expect(sentence(null)).toBeNull();
	});
});

describe('coldNoticeText', () => {
	it('tells the arrival window', () => {
		expect(coldNoticeText(window, START, NOW, 'de')).toBe('Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein.');
	});

	it('gives a single arrival time when there is too little time to heat', () => {
		expect(coldNoticeText(short, START, NOW, 'en')).toBe('Only 15 minutes to heat: come at 17:45. It will still be warming up.');
	});

	it('says to come as soon as possible once the last arrival has passed', () => {
		expect(coldNoticeText(window, START, '2027-01-12T16:30:01Z', 'de')).toBe(
			'Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss.'
		);
	});

	it('throws for a cold notice without an earliest arrival', () => {
		expect(() => coldNoticeText({ heat: 'cold', earliest: null, latest: null }, START, NOW, 'de')).toThrow();
	});
});

describe('offerNoticeText', () => {
	it('tells a hot start its time, and a cold start its arrival', () => {
		const hot: Notice = { heat: 'hot', earliest: null, latest: null };
		expect(offerNoticeText({ start: START, heat: 'hot', notice: hot }, NOW, 'de')).toBe('Ofen läuft. Komm um 18:00.');
		expect(offerNoticeText({ start: START, heat: 'cold', notice: window }, NOW, 'en')).toBe(
			'Nobody before you: come between 17:20 and 17:30 and light the fire.'
		);
	});
});
