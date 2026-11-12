// Story 1.8 matrix, confirmation rows: pre-heat 30–40, changeover 15. Pure: no database.
import { describe, expect, it } from 'vitest';
import { serializeNotice, type Notice } from '#lib/domain/index.ts';
import type { Confirmation } from '#lib/server/db/queries/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { badgeText, buildBookedView, keyboxText } from './booked-view.ts';

const at = (date: string, hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const START = at('2027-01-12', '18:00');
/** Thursday 7 January, 09:00. */
const BOOKED_AT = at('2027-01-07', '09:00');
const COLD: Notice = { heat: 'cold', earliest: at('2027-01-12', '17:20'), latest: at('2027-01-12', '17:30') };
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };

const confirmation = (over: Partial<Confirmation> = {}): Confirmation => ({
	start: START,
	durationMin: 90,
	partySize: 3,
	createdAt: BOOKED_AT,
	noticeAtBooking: serializeNotice(COLD),
	adminContact: 'platzhalter@sauna-luegisee.ch',
	...over
});
const view = (over: Partial<Confirmation> = {}, input: Partial<Parameters<typeof buildBookedView>[1]> = {}) =>
	buildBookedView(confirmation(over), { locale: 'de', now: BOOKED_AT, fresh: true, changed: false, ...input });

describe('badgeText', () => {
	it('says hot and cold as in the UX catalogue', () => {
		const hotStart = at('2027-01-12', '18:15');
		expect(badgeText(HOT, hotStart, BOOKED_AT, 'de')).toBe('Schon heiss um 18:15.');
		expect(badgeText(HOT, hotStart, BOOKED_AT, 'en')).toBe('Already hot at 18:15.');
		expect(badgeText(COLD, START, BOOKED_AT, 'de')).toBe('Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.');
		expect(badgeText(COLD, START, BOOKED_AT, 'en')).toBe(
			'Cold start: come between 17:20 and 17:30 and light the fire.'
		);
	});

	it('uses the row text behind "Kaltstart: " for a collapsed window', () => {
		const collapsed: Notice = { heat: 'cold', earliest: at('2027-01-12', '17:45'), latest: null };
		expect(badgeText(collapsed, START, BOOKED_AT, 'de')).toBe(
			'Kaltstart: nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf.'
		);
		expect(badgeText(collapsed, START, BOOKED_AT, 'en')).toBe(
			'Cold start: only 15 minutes to heat: come at 17:45. It will still be warming up.'
		);
	});

	it('judges "already past" at the booking time, not now', () => {
		const late = at('2027-01-12', '17:40');
		expect(badgeText(COLD, START, late, 'de')).toBe(
			'Kaltstart: komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss.'
		);
		expect(badgeText(COLD, START, late, 'en')).toBe(
			"Cold start: come as soon as you can and light the fire. It won't be fully hot at the start."
		);
		// At the latest arrival itself it is not past yet.
		expect(badgeText(COLD, START, at('2027-01-12', '17:30'), 'de')).toBe(
			'Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.'
		);
	});
});

describe('keyboxText', () => {
	it('names the time 24 hours before the start', () => {
		expect(keyboxText(START, BOOKED_AT, BOOKED_AT, 'de')).toBe('Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00.');
		expect(keyboxText(START, BOOKED_AT, BOOKED_AT, 'en')).toBe("You'll get the keybox code on Mon 11 January at 18:00.");
	});

	it('counts 24 hours of real time across the spring clock change', () => {
		const sunday = at('2027-03-28', '10:00');
		expect(keyboxText(sunday, BOOKED_AT, BOOKED_AT, 'de')).toBe('Den Schlüsselcode bekommst du am Sa 27. März um 09:00.');
	});

	it('says the code is on its way when booked at or after the cutoff, or once it has passed', () => {
		const sent = 'Der Schlüsselcode ist schon unterwegs in dein Postfach.';
		const cutoff = at('2027-01-11', '18:00');
		expect(keyboxText(START, at('2027-01-12', '09:00'), at('2027-01-12', '09:00'), 'de')).toBe(sent);
		expect(keyboxText(START, cutoff, cutoff, 'de')).toBe(sent);
		expect(keyboxText(START, BOOKED_AT, cutoff, 'de')).toBe(sent);
		expect(keyboxText(START, BOOKED_AT, at('2027-01-11', '17:59'), 'de')).not.toBe(sent);
		expect(keyboxText(START, cutoff, cutoff, 'en')).toBe('The keybox code is already on its way to your inbox.');
	});
});

describe('buildBookedView', () => {
	it('builds the cold confirmation of the matrix', () => {
		expect(view()).toEqual({
			title: 'Gebucht',
			date: 'Dienstag, 12. Januar',
			heading: 'Gebucht!',
			badge: { heat: 'cold', text: 'Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.' },
			changed: null,
			revisit: null,
			keybox: 'Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00.',
			details: {
				when: { term: 'Wann', before: 'Di 12. Januar, ', start: '18:00', datetime: '2027-01-12T17:00:00Z', after: '–19:30' },
				people: { term: 'Personen', value: '3 Personen' },
				cancel: {
					term: 'Absagen',
					before: 'Schreib an ',
					address: 'platzhalter@sauna-luegisee.ch',
					href: 'mailto:platzhalter@sauna-luegisee.ch',
					after: '.'
				}
			},
			another: { href: '/day/2027-01-12', text: 'Weitere Zeit buchen' },
			info: { href: '/info', text: "So funktioniert's" }
		});
	});

	it('shows the changed line only right after booking, and the revisit line otherwise', () => {
		expect(view({}, { changed: true })).toMatchObject({ changed: 'Das hat sich gerade geändert.', revisit: null });
		expect(view({}, { changed: true, locale: 'en' })).toMatchObject({ changed: 'That just changed.' });
		expect(view({}, { fresh: false })).toMatchObject({
			changed: null,
			revisit: 'So stand es bei der Buchung. Änderungen schicken wir dir per Mail.'
		});
		expect(view({}, { fresh: false, locale: 'en' })).toMatchObject({
			revisit: "This is how it stood when you booked. We'll email you about any changes."
		});
	});

	it('shows the stored notice, never a fresh one', () => {
		expect(view({ start: at('2027-01-12', '18:15'), noticeAtBooking: serializeNotice(HOT) })).toMatchObject({
			badge: { heat: 'hot', text: 'Schon heiss um 18:15.' }
		});
	});

	it('leaves out the badge for a row without a stored notice, and the cancel line without a contact', () => {
		const v = view({ noticeAtBooking: null, adminContact: null }, { changed: true });
		expect(v.badge).toBeNull();
		expect(v.changed).toBeNull();
		expect(v.details.cancel).toBeNull();
		expect(view({ noticeAtBooking: 'nonsense' }).badge).toBeNull();
	});

	it('encodes the address in the mailto link, keeping the @', () => {
		expect(view({ adminContact: 'sauna+info@example.ch' }).details.cancel).toMatchObject({
			address: 'sauna+info@example.ch',
			href: 'mailto:sauna%2Binfo@example.ch'
		});
	});

	it('writes the English details', () => {
		expect(view({ partySize: 1 }, { locale: 'en' }).details).toEqual({
			when: { term: 'When', before: 'Tue 12 January, ', start: '18:00', datetime: '2027-01-12T17:00:00Z', after: '–19:30' },
			people: { term: 'People', value: '1 person' },
			cancel: {
				term: 'To cancel',
				before: 'Email ',
				address: 'platzhalter@sauna-luegisee.ch',
				href: 'mailto:platzhalter@sauna-luegisee.ch',
				after: '.'
			}
		});
	});
});
