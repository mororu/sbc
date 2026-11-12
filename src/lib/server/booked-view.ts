// The confirmation (FR-7, FR-10; UX confirmation) behind `/booked/{publicId}`. Every string is
// formatted here on the server, so client code never needs src/lib/time. The model is built only
// from the date, start, duration, party size, the notice at booking, the keybox time and the admin
// contact (AD-26): never the guest's name, email or mobile, and no row ids.
import { parseNotice, type HeatState, type Notice } from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { m } from '#lib/paraglide/messages.js';
import { mailtoHref } from '#lib/mailto.ts';
import { getConfirmation, type Confirmation } from '#lib/server/db/queries/index.ts';
import {
	addMinutes,
	compareInstants,
	formatDateLong,
	formatDateShort,
	formatTime,
	localDate,
	type Instant,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';
import { coldNoticeText } from './day-view.ts';
import { isRandomId } from './ids.ts';

/** The keybox email goes out 24 hours of real time before the start (AD-9). */
const KEYBOX_LEAD_MIN = 24 * 60;

export type BookedBadge = {
	heat: HeatState;
	/** The notice at booking as the badge says it: "Schon heiss um 18:15." */
	text: string;
};

export type BookedView = {
	/** `<title>` without the suffix: "Gebucht". */
	title: string;
	/** The eyebrow: "Dienstag, 12. Januar". */
	date: string;
	/** "Gebucht!" */
	heading: string;
	/** The notice at booking, or null for a booking made before notices were stored. */
	badge: BookedBadge | null;
	/** "Das hat sich gerade geändert.": only right after a booking whose notice changed. */
	changed: string | null;
	/** "So stand es bei der Buchung. …": on every visit but the one right after booking. */
	revisit: string | null;
	/** "Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00." */
	keybox: string;
	details: {
		/** "Di 12. Januar, 18:00–19:30", split so the start can be a `<time>`. */
		when: { term: string; before: string; start: string; datetime: Instant; after: string };
		people: { term: string; value: string };
		/** How to cancel: an email to the admin contact. Null when no contact address is set. */
		cancel: { term: string; before: string; address: string; href: string; after: string } | null;
	};
	/** "Weitere Zeit buchen" → the booked day. */
	another: { href: ResolvedPathname; text: string };
	/** "So funktioniert's" → the info page. */
	info: { href: ResolvedPathname; text: string };
};

/**
 * The badge text for the notice at booking. Too little time and an arrival already past use the
 * row texts behind "Kaltstart: ". "Past" is judged at `createdAt`: the badge shows the state at booking.
 */
export function badgeText(notice: Notice, start: Instant, createdAt: Instant, locale: Locale): string {
	if (notice.heat === 'hot') return m.booked_badge_hot({ time: formatTime(start) }, { locale });
	const earliest = notice.earliest;
	if (earliest === null) throw new Error('A cold notice without an earliest arrival');
	const past = compareInstants(createdAt, notice.latest ?? earliest) > 0;
	if (notice.latest !== null && !past) {
		return m.booked_badge_cold(
			{ earliest: formatTime(earliest), latest: formatTime(notice.latest) },
			{ locale }
		);
	}
	// The row text continues the sentence after "Kaltstart: ", so it starts lower-case.
	const row = coldNoticeText(notice, start, createdAt, locale);
	const rest = row.charAt(0).toLocaleLowerCase(locale) + row.slice(1);
	return m.booked_badge_cold_other({ notice: rest }, { locale });
}

/**
 * The keybox sentence. The email goes out at start − 24 h (AD-9). Booked at or after that time, or
 * once it has passed, the code is already on its way.
 */
export function keyboxText(start: Instant, createdAt: Instant, now: Instant, locale: Locale): string {
	const at = addMinutes(start, -KEYBOX_LEAD_MIN);
	if (compareInstants(createdAt, at) >= 0 || compareInstants(now, at) >= 0) {
		return m.booked_keybox_sent({}, { locale });
	}
	const when = m.booked_keybox_at(
		{ date: formatDateShort(localDate(at), locale), time: formatTime(at) },
		{ locale }
	);
	return m.booked_keybox({ at: when }, { locale });
}

const MARKER = '\u0000';

/** A message split around one placeholder, filled with `MARKER`. */
function around(text: string): { before: string; after: string } {
	const [before, after = ''] = text.split(MARKER);
	return { before, after };
}

/** "Schreib an {address}." split around the address, so the address can be a link. */
function cancelLine(address: string, locale: Locale) {
	return {
		term: m.booked_cancel_term({}, { locale }),
		...around(m.booked_cancel({ address: MARKER }, { locale })),
		address,
		href: mailtoHref(address)
	};
}

/** The stored notice, or null when it is missing or not a valid notice. */
function storedNotice(json: string | null): Notice | null {
	if (json === null) return null;
	try {
		return parseNotice(json);
	} catch {
		return null;
	}
}

/** Pure. `fresh`: reached right after booking (`?new=1`); `changed`: the notice changed (`&changed=1`). */
export function buildBookedView(
	confirmation: Confirmation,
	input: { locale: Locale; now: Instant; fresh: boolean; changed: boolean }
): BookedView {
	const { locale, now, fresh } = input;
	const { start, createdAt } = confirmation;
	const date = localDate(start);
	const notice = storedNotice(confirmation.noticeAtBooking);
	const end = addMinutes(start, confirmation.durationMin);
	return {
		title: m.booked_title({}, { locale }),
		date: formatDateLong(date, locale),
		heading: m.booked_heading({}, { locale }),
		badge: notice ? { heat: notice.heat, text: badgeText(notice, start, createdAt, locale) } : null,
		changed: fresh && input.changed && notice ? m.booked_changed({}, { locale }) : null,
		revisit: fresh ? null : m.booked_revisit({}, { locale }),
		keybox: keyboxText(start, createdAt, now, locale),
		details: {
			when: {
				term: m.booked_when({}, { locale }),
				...around(
					m.booked_when_value(
						{ date: formatDateShort(date, locale), start: MARKER, end: formatTime(end) },
						{ locale }
					)
				),
				start: formatTime(start),
				datetime: start
			},
			people: {
				term: m.booked_people_term({}, { locale }),
				value: m.booked_people({ count: confirmation.partySize }, { locale })
			},
			cancel: confirmation.adminContact ? cancelLine(confirmation.adminContact, locale) : null
		},
		another: { href: `/day/${date}` as ResolvedPathname, text: m.book_another({}, { locale }) },
		info: { href: '/info' as ResolvedPathname, text: m.footer_info({}, { locale }) }
	};
}

/** The confirmation, or null for anything that is not a live booking's public id. */
export function loadBookedView(
	publicId: string,
	locale: Locale,
	options: {
		db?: Parameters<typeof getConfirmation>[1];
		now?: Instant;
		/** The one-time query flags `new` and `changed`, as given. */
		flags?: { new: string | null; changed: string | null };
	} = {}
): BookedView | null {
	if (!isRandomId(publicId)) return null;
	const confirmation = getConfirmation(publicId, options.db);
	if (!confirmation) return null;
	const fresh = options.flags?.new === '1';
	return buildBookedView(confirmation, {
		locale,
		now: options.now ?? clockNow(),
		fresh,
		changed: fresh && options.flags?.changed === '1'
	});
}
