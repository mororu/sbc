// Story 3.3: the impact mini row text model. Tue 12 Jan 2027, 10:00 Zurich (UTC+1).
import { describe, expect, it } from 'vitest';
import type { Booking, Impact, Notice } from '#lib/domain/index.ts';
import { buildImpactRow, heatChangeLine, newNoticeText, type ImpactRowContext } from './impact-view.ts';

const NOW = '2027-01-12T09:00:00Z';
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
const COLD: Notice = { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' };
const tom: Booking = { id: 2, start: '2027-01-12T16:15:00Z', durationMin: 60, changeoverMin: 15, createdAt: '2027-01-07T10:00:00Z' };
const context: ImpactRowContext = { now: NOW, locale: 'de', firstName: 'Tom', date: '2027-01-12' };
const impact = (over: Partial<Impact> = {}): Impact => ({
	affected: tom,
	told: HOT,
	current: COLD,
	class: 'urgent',
	consequence: 'call',
	...over
});

describe('buildImpactRow', () => {
	it('Call: "Tom, 17:15:", heiss → Kaltstart, "weniger als 24 h." with Anruf nötig, and the new notice', () => {
		expect(buildImpactRow(impact(), context)).toEqual({
			consequence: 'call',
			who: 'Tom, 17:15:',
			line: { from: { heat: 'hot', label: 'heiss' }, to: { heat: 'cold', label: 'Kaltstart' }, becomes: 'wird zu' },
			text: 'weniger als 24 h.',
			marker: { text: 'Anruf nötig', urgent: true },
			notice: 'Neuer Hinweis: komm zwischen 16:35 und 16:45.'
		});
	});

	it('Mail: "bekommt eine Mail." and no marker', () => {
		expect(buildImpactRow(impact({ consequence: 'mail' }), context)).toMatchObject({
			consequence: 'mail',
			text: 'bekommt eine Mail.',
			marker: null,
			notice: 'Neuer Hinweis: komm zwischen 16:35 und 16:45.'
		});
	});

	it('Good news, call: the marker is "optional", the line Kaltstart → heiss', () => {
		const row = buildImpactRow(impact({ told: COLD, current: HOT, class: 'good_news' }), context);
		expect(row.marker).toEqual({ text: 'optional', urgent: false });
		expect(row.line).toMatchObject({ from: { label: 'Kaltstart' }, to: { label: 'heiss' } });
		expect(row.notice).toBe('Neuer Hinweis: schon heiss um 17:15.');
	});

	it('No effect: only "Kein Effekt auf andere Buchungen."', () => {
		expect(buildImpactRow(impact({ consequence: 'none', class: 'none' }), context)).toEqual({
			consequence: 'none',
			who: null,
			line: null,
			text: 'Kein Effekt auf andere Buchungen.',
			marker: null,
			notice: null
		});
	});

	it('adds the short weekday on another date, and shows the time alone without a name', () => {
		expect(buildImpactRow(impact(), { ...context, date: '2027-01-11' }).who).toBe('Tom, Di 17:15:');
		expect(buildImpactRow(impact(), { ...context, firstName: null }).who).toBe('17:15:');
	});

	it('renders in English', () => {
		const row = buildImpactRow(impact(), { ...context, locale: 'en' });
		expect(row).toMatchObject({
			text: 'less than 24 h.',
			marker: { text: 'Call needed' },
			line: { from: { label: 'hot' }, to: { label: 'cold start' }, becomes: 'becomes' },
			notice: 'New notice: come between 16:35 and 16:45.'
		});
	});
});

describe('heatChangeLine and newNoticeText', () => {
	it('reads cold → cold as "Kaltstart → neue Ankunftszeit"', () => {
		const later: Notice = { ...COLD, earliest: '2027-01-12T15:40:00Z' };
		expect(heatChangeLine(COLD, later, 'de')).toMatchObject({ from: { label: 'Kaltstart' }, to: { heat: 'cold', label: 'neue Ankunftszeit' } });
	});

	it('uses the cold notice text for a collapsed window and for an arrival already past', () => {
		const collapsed: Notice = { heat: 'cold', earliest: '2027-01-12T15:50:00Z', latest: null };
		expect(newNoticeText(collapsed, tom.start, NOW, 'de')).toMatch(/^Neuer Hinweis: Nur 25 Minuten/);
		expect(newNoticeText(COLD, tom.start, '2027-01-12T15:50:00Z', 'de')).toBe(
			'Neuer Hinweis: Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss.'
		);
	});

	it('degrades instead of throwing for a cold notice without an earliest arrival', () => {
		const broken: Notice = { heat: 'cold', earliest: null, latest: null };
		expect(newNoticeText(broken, tom.start, NOW, 'de')).toBeNull();
		const row = buildImpactRow(impact({ current: broken }), context);
		expect(row).toMatchObject({ consequence: 'call', notice: null, who: 'Tom, 17:15:' });
	});
});
