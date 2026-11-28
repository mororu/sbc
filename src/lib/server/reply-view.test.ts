// Story 3.4 matrix, "German mailto", "English mailto", "Odd input" and "Empty": the reply reminder
// view model. The line is in the admin's locale, the prepared reply in the booking's.
import { describe, expect, it } from 'vitest';
import type { ReplyReminderRow } from '#lib/server/db/queries/index.ts';
import { buildReplies, buildReplyReminder } from './reply-view.ts';

const reminder = (over: Partial<ReplyReminderRow> = {}): ReplyReminderRow => ({
	id: 3,
	name: 'Lena Muster',
	email: 'lena@example.ch',
	locale: 'de',
	// Tue 12 Jan 2027, 18:00–19:00 Zurich.
	start: '2027-01-12T17:00:00Z',
	durationMin: 60,
	...over
});

/** The subject and the body the `mailto:` href carries, decoded. */
const decode = (href: string) => {
	const [address, query] = href.slice('mailto:'.length).split('?');
	const fields = Object.fromEntries(
		query.split('&').map((pair) => {
			const [key, value] = pair.split('=');
			return [key, decodeURIComponent(value)];
		})
	);
	return { address: decodeURIComponent(address), subject: fields.subject, body: fields.body };
};

describe('buildReplyReminder', () => {
	it('prepares the German reply exactly (German mailto)', () => {
		const view = buildReplyReminder(reminder(), 'de');
		expect(view).toMatchObject({ id: 3, name: 'Lena Muster', when: 'Di 12. Januar, 18:00–19:00 · gelöscht', email: 'lena@example.ch' });
		const { address, subject, body } = decode(view.href);
		expect(address).toBe('lena@example.ch');
		expect(subject).toBe('Deine Sauna-Buchung ist gelöscht');
		expect(body).toBe(
			'Hallo Lena,\r\n\r\nwir haben deine Buchung vom Di 12. Januar, 18:00 gelöscht. Danke für die Nachricht, bis bald an der Sauna!\r\n\r\nSauna Luegisee'
		);
		expect(view.href).not.toMatch(/[ \r\n,]/);
	});

	it('prepares the reply in the booking language, the line in the admin language (English mailto)', () => {
		const view = buildReplyReminder(reminder({ name: 'Ben Arnold', locale: 'en' }), 'de');
		expect(view.when).toBe('Di 12. Januar, 18:00–19:00 · gelöscht');
		const { subject, body } = decode(view.href);
		expect(subject).toBe('Your sauna booking is cancelled');
		expect(body).toBe(
			'Hello Ben,\r\n\r\nwe have cancelled your booking for Tue 12 January, 18:00. Thanks for letting us know, see you soon at the sauna!\r\n\r\nSauna Luegisee'
		);
		expect(buildReplyReminder(reminder(), 'en').when).toBe('Tue 12 January, 18:00–19:00 · deleted');
	});

	it('copies address, subject, a blank line and the body', () => {
		expect(buildReplyReminder(reminder(), 'de').copyText).toBe(
			[
				'lena@example.ch',
				'Deine Sauna-Buchung ist gelöscht',
				'',
				'Hallo Lena,',
				'',
				'wir haben deine Buchung vom Di 12. Januar, 18:00 gelöscht. Danke für die Nachricht, bis bald an der Sauna!',
				'',
				'Sauna Luegisee'
			].join('\n')
		);
	});

	it('encodes a + in the address and greets the first word of a padded name (Odd input)', () => {
		const view = buildReplyReminder(reminder({ email: 'a+b@x.ch', name: '  Jo  Ann ' }), 'de');
		expect(view.href.startsWith('mailto:a%2Bb@x.ch?subject=')).toBe(true);
		expect(view.email).toBe('a+b@x.ch');
		expect(view.name).toBe('Jo  Ann');
		expect(decode(view.href).body.startsWith('Hallo Jo,\r\n')).toBe(true);
	});

	it.each([[''], ['   '], [null]])('greets without a name and heads "(ohne Name)" for the name %j', (name) => {
		const view = buildReplyReminder(reminder({ name }), 'de');
		expect(view.name).toBe('(ohne Name)');
		expect(decode(view.href).body.startsWith('Hallo,\r\n')).toBe(true);
		expect(decode(buildReplyReminder(reminder({ name, locale: 'en' }), 'de').href).body.startsWith('Hello,\r\n')).toBe(true);
	});

	it('heads a blank stored name "  " like the day rows, the home and the calls (retro D5)', () => {
		expect(buildReplyReminder(reminder({ name: '  ' }), 'de').name).toBe('(ohne Name)');
		expect(buildReplyReminder(reminder({ name: '  ' }), 'en').name).toBe('(no name)');
	});
});

describe('buildReplies', () => {
	it('has the heading, the count and the empty line (Empty)', () => {
		expect(buildReplies([], 0, 'de')).toEqual({ heading: 'Antworten', count: 0, empty: 'Keine offenen Antworten.', items: [] });
		expect(buildReplies([], 0, 'en')).toMatchObject({ heading: 'Replies', empty: 'No replies waiting.' });
	});

	it('keeps the order it is given', () => {
		const view = buildReplies([reminder({ id: 2, name: 'Ben' }), reminder({ id: 1, name: 'Anna' })], 2, 'de');
		expect(view.items.map((i) => [i.id, i.name])).toEqual([
			[2, 'Ben'],
			[1, 'Anna']
		]);
		expect(view.count).toBe(2);
	});
});
