// Server-side render of the booking form: the hidden fields the action needs are really in the
// HTML, and a notice problem shows as the form-level message, never at a field the guest can't see.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { offeredStartTimes, type Settings } from '#lib/domain/index.ts';
import { buildBookView, type BookView } from '#lib/server/book-view.ts';
import { toInstant } from '#lib/time/index.ts';
import BookForm from './BookForm.svelte';

const settings: Settings = { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 };
const DAY = '2027-01-12';
const NOW = '2027-01-12T08:00:00Z';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';

function view(): BookView {
	const start = toInstant(DAY, 18 * 60);
	const offer = offeredStartTimes({
		date: DAY,
		bookings: [],
		blocks: [],
		settings,
		seasons: [{ startDate: '2027-01-09', endDate: '2027-04-30' }],
		now: NOW
	}).find((o) => o.start === start);
	if (!offer) throw new Error('18:00 is not offered');
	return buildBookView({ date: DAY, offer, now: NOW, locale: 'de', settings, bookings: [], blocks: [], submitToken: TOKEN });
}

/** The value as Svelte writes it into an attribute. */
const attr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

describe('BookForm (server render)', () => {
	it('posts the displayed notice and the submit token as hidden fields', () => {
		const v = view();
		expect(v.noticeToken).toBe('{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}');
		const { body } = render(BookForm, { props: { view: v, failure: null } });
		expect(body).toContain(`<input type="hidden" name="notice" value="${attr(v.noticeToken)}"`);
		expect(body).toContain(`<input type="hidden" name="submitToken" value="${TOKEN}"`);
	});

	it('shows a notice error as the form-level message, with no field marked invalid', () => {
		const values = { name: 'Lena', email: 'lena@example.ch', mobile: '079 123 45 67', duration: '90', partySize: '3' };
		const { body } = render(BookForm, {
			props: { view: view(), failure: { errors: { notice: 'form_invalid' }, values } }
		});
		expect(body).toContain('Das hat nicht geklappt, die Buchung ist nicht gespeichert. Versuch es bitte nochmal.');
		expect(body).toMatch(/role="alert"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="alert"/);
		expect(body).not.toContain('aria-invalid="true"');
		expect(body).not.toMatch(/<input[^>]*name="notice"[^>]*autofocus/);
		// The typed values are kept.
		expect(body).toContain('value="Lena"');
	});
});
