// The minimal confirmation (Story 1.7) behind `/booked/{publicId}`: date, start, duration and party
// size. The notice, the keybox line and the details list follow in Story 1.8.
import type { ResolvedPathname } from '$app/types';
import { m } from '#lib/paraglide/messages.js';
import { getConfirmation, type Confirmation } from '#lib/server/db/queries/index.ts';
import { formatDateLong, formatTime, localDate, type Instant, type Locale } from '#lib/time/index.ts';
import { isRandomId } from './ids.ts';

export type BookedView = {
	/** `<title>` without the suffix: "Gebucht". */
	title: string;
	/** "Dienstag, 12. Januar" */
	date: string;
	heading: string;
	/** "18:00" */
	time: string;
	datetime: Instant;
	/** "90 Min." */
	duration: string;
	/** "3 Personen" */
	people: string;
	/** "Weitere Zeit buchen" → the booked day. */
	another: { href: ResolvedPathname; text: string };
};

/** Pure. */
export function buildBookedView(confirmation: Confirmation, locale: Locale): BookedView {
	const date = localDate(confirmation.start);
	return {
		title: m.booked_title({}, { locale }),
		date: formatDateLong(date, locale),
		heading: m.booked_heading({}, { locale }),
		time: formatTime(confirmation.start),
		datetime: confirmation.start,
		duration: m.booked_minutes({ minutes: confirmation.durationMin }, { locale }),
		people: m.booked_people({ count: confirmation.partySize }, { locale }),
		another: { href: `/day/${date}` as ResolvedPathname, text: m.book_another({}, { locale }) }
	};
}

/** The confirmation, or null for anything that is not a live booking's public id. */
export function loadBookedView(
	publicId: string,
	locale: Locale,
	options: { db?: Parameters<typeof getConfirmation>[1] } = {}
): BookedView | null {
	if (!isRandomId(publicId)) return null;
	const confirmation = getConfirmation(publicId, options.db);
	return confirmation ? buildBookedView(confirmation, locale) : null;
}
