// Blocks the guest emails share, so the same facts read the same in every email. Pure.
import { mailtoHref } from '#lib/mailto.ts';
import { m } from '#lib/paraglide/messages.js';
import { formatDateShort, formatTime, localDate, type Instant, type Locale } from '#lib/time/index.ts';
import type { Block } from './layout.ts';

type DetailItem = Extract<Block, { type: 'details' }>['items'][number];

/** "Date: Tue 12 January" and "Start: 18:00". */
export function whenItems(start: Instant, locale: Locale): DetailItem[] {
	return [
		{ term: m.mail_detail_date({}, { locale }), value: formatDateShort(localDate(start), locale) },
		{ term: m.mail_detail_start({}, { locale }), value: formatTime(start) }
	];
}

const MARKER = '\u0000';

/** "To cancel: Email {address}." with the address as a `mailto:` link; null without an admin contact. */
export function cancelBlock(adminContact: string | null, locale: Locale): Block | null {
	if (adminContact === null) return null;
	const [before, after = ''] = m.booked_cancel({ address: MARKER }, { locale }).split(MARKER);
	return {
		type: 'paragraph',
		content: [`${m.booked_cancel_term({}, { locale })}: ${before}`, { text: adminContact, href: mailtoHref(adminContact) }, after]
	};
}
