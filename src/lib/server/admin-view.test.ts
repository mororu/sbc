// Story 3.1 matrix, "Health": the admin home's worker warning at Tue 12 Jan 2027, 10:00 Zurich.
// Story 3.2 matrix, "Home" and "Flag": the next bookings (Heute/Morgen) and the home flags.
import { describe, expect, it } from 'vitest';
import type { AdminBooking } from '#lib/server/db/queries/index.ts';
import type { AdminRowContext } from './admin-day-view.ts';
import { buildHomeFlags, buildNextBookings, workerWarning } from './admin-view.ts';

const NOW = '2027-01-12T09:00:00Z';

describe('workerWarning', () => {
	it('says the worker is not running, without a time, before any heartbeat', () => {
		expect(workerWarning(null, NOW, 'de')).toBe('Der Versand läuft nicht.');
		expect(workerWarning(null, NOW, 'en')).toBe("Sending isn't running.");
	});

	it('names the last tick of a stale heartbeat as a clock time', () => {
		const beat = { beatAt: '2027-01-12T08:55:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit 09:55 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since 09:55.");
	});

	it('adds the date for a tick on an earlier day', () => {
		const beat = { beatAt: '2027-01-11T21:30:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit Mo 11. Januar, 22:30 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since Mon 11 January, 22:30.");
	});

	it('names when sends started failing while the worker ticks', () => {
		const beat = { beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:45:00Z' };
		expect(workerWarning(beat, NOW, 'de')).toBe('Seit 09:45 geht keine Mail raus. Der Versand versucht es weiter.');
		expect(workerWarning(beat, NOW, 'en')).toBe('No email has gone out since 09:45. Sending keeps trying.');
	});

	it('shows nothing while the worker is healthy', () => {
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: null }, NOW, 'de')).toBeNull();
		// Failing for less than 15 minutes is still ok.
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:50:00Z' }, NOW, 'de')).toBeNull();
	});
});

const context = (over: Partial<AdminRowContext> = {}): AdminRowContext => ({
	now: NOW,
	locale: 'de',
	seasons: [{ startDate: '2027-01-09', endDate: '2027-03-31' }],
	settings: { openMinute: 960, closeMinute: 1320 },
	keyboxCode: '4711',
	...over
});

const booking = (over: Partial<AdminBooking> = {}): AdminBooking => ({
	id: 7,
	start: '2027-01-12T16:15:00Z',
	durationMin: 60,
	partySize: 2,
	locale: 'de',
	name: 'Tom Brunner',
	email: null,
	mobile: null,
	current: null,
	lastTold: null,
	keybox: null,
	refusals: [],
	...over
});

describe('buildNextBookings', () => {
	it('groups today and tomorrow under their labels, with the empty line for a day without bookings', () => {
		const next = buildNextBookings([booking()], context());
		expect(next.heading).toBe('Nächste Buchungen');
		expect(next.groups.map((g) => g.label)).toEqual(['Heute · Di 12. Januar', 'Morgen · Mi 13. Januar']);
		expect(next.groups[0].rows.map((r) => r.id)).toEqual([7]);
		expect(next.groups[0].empty).toBeNull();
		expect(next.groups[1]).toEqual({ label: 'Morgen · Mi 13. Januar', rows: [], empty: 'Keine Buchungen an diesem Tag.' });
	});

	it('uses the English labels', () => {
		const next = buildNextBookings([], context({ locale: 'en' }));
		expect(next.heading).toBe('Next bookings');
		expect(next.groups.map((g) => g.label)).toEqual(['Today · Tue 12 January', 'Tomorrow · Wed 13 January']);
	});
});

describe('buildHomeFlags', () => {
	const candidate = (id: number, start: string, over: { durationMin?: number; refused?: boolean; name?: string | null } = {}) => ({
		id,
		start,
		durationMin: over.durationMin ?? 60,
		name: over.name === undefined ? 'Tom Brunner' : over.name,
		refused: over.refused ?? false
	});

	it('says one flagged booking in the singular, with its link', () => {
		const flags = buildHomeFlags([candidate(1, '2027-01-12T20:30:00Z', { durationMin: 90 }), candidate(2, '2027-01-13T16:00:00Z')], context());
		expect(flags).toEqual([
			{
				kind: 'outside',
				text: '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.',
				links: [{ href: '/admin/booking/1', text: 'Di 12. Januar, 21:30 · Tom Brunner' }]
			}
		]);
	});

	it('uses the EXPERIENCE plural for several, and flags a booking outside every season', () => {
		const flags = buildHomeFlags([candidate(1, '2027-01-12T20:30:00Z', { durationMin: 90 }), candidate(2, '2027-04-05T14:00:00Z')], context());
		expect(flags[0].text).toBe('2 Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig.');
		expect(flags[0].links.map((l) => l.href)).toEqual(['/admin/booking/1', '/admin/booking/2']);
	});

	it('lists the bookings with a refused email, one link each', () => {
		const flags = buildHomeFlags(
			[candidate(3, '2027-01-13T16:00:00Z', { refused: true }), candidate(4, '2027-01-14T16:00:00Z', { refused: true, name: null })],
			context()
		);
		expect(flags).toEqual([
			{
				kind: 'refused',
				text: '2 Buchungen haben eine abgelehnte Mail.',
				links: [
					{ href: '/admin/booking/3', text: 'Mi 13. Januar, 17:00 · Tom Brunner' },
					{ href: '/admin/booking/4', text: 'Do 14. Januar, 17:00 · (ohne Name)' }
				]
			}
		]);
		expect(buildHomeFlags([candidate(3, '2027-01-13T16:00:00Z', { refused: true })], context())[0].text).toBe(
			'1 Buchung hat eine abgelehnte Mail.'
		);
	});

	it('flags nothing for a booking that has started, or when nothing applies', () => {
		expect(buildHomeFlags([candidate(1, '2027-01-12T06:00:00Z', { refused: true })], context())).toEqual([]);
		expect(buildHomeFlags([candidate(1, '2027-01-13T16:00:00Z')], context())).toEqual([]);
	});
});
