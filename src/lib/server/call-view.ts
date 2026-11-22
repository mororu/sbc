// The call list (FR-13, FR-14, FR-21; EXPERIENCE "Call list entry"; Story 3.6): its view model for
// the admin home. One item per `deriveCallList` entry of `getCallFeed` (AD-21, the nav badge's
// source too), with the guest's contact (`getCallContacts`, admin-only) and the current keybox code
// (`getKeyboxSettings`) beside it. Every string is formatted here on the server (src/lib/time stays
// off the client). Read-only: only the mark-called command writes `last_told_notice`/`resolved_at`.
import {
	deriveCallList,
	noticeEquals,
	serializeNotice,
	type CallEntry,
	type CallFeedEntry,
	type CallReason,
	type Notice
} from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { addDays, formatDateShort, formatTime, localDate, today, type Instant, type Locale } from '#lib/time/index.ts';
import { telHref } from './admin-day-view.ts';
import {
	firstName,
	getCallContacts,
	getCallFeed,
	getKeyboxSettings,
	type CallContact
} from './db/queries/index.ts';
import { heatChangeLine, type HeatChangeLineView } from './impact-view.ts';
import { badgeText } from './notice-text.ts';

type Db = Parameters<typeof getCallFeed>[1];

/** One call-list entry as the admin home shows it. */
export type CallItemView = {
	bookingId: number;
	/** "17:15 · Tom Brunner" ("(ohne Name)" once erased or blank): the `h3`. */
	heading: string;
	/** For the status after "Angerufen" ("Tom angerufen. …"); null without a name. */
	firstName: string | null;
	/** "Anruf nötig" (urgent) or "optional". */
	marker: { text: string; urgent: boolean };
	/** "Heute, Di 12. Januar" · "Morgen, Mi 13. Januar" · "Do 14. Januar". */
	dateLine: string;
	/** "HEISS → KALTSTART": last told → current, only when both are known and differ. */
	line: HeatChangeLineView | null;
	/** The notice to give, in the confirmation-badge text; null when it cannot be derived. */
	notice: string | null;
	/** "zuletzt gesagt: Schon heiss um 17:15."; null when the last-told notice is unknown. */
	lastTold: string | null;
	/** "Schlüsselmail abgelehnt", …: one line per send problem (trigger b). */
	reasons: string[];
	/** "Code durchgeben: 4711": with a keybox reason and a set code only. */
	code: string | null;
	/** The mobile as a `tel:` link and as text; null once erased or blank. */
	tel: { href: string; text: string } | null;
	/** What "Angerufen" posts: `serializeNotice(current)`, or "" without a current notice. */
	token: string;
};

/** The call list of the admin home: heading, count (the nav badge's), empty line and items. */
export type CallsView = {
	/** "Anrufliste" */
	heading: string;
	count: number;
	/** "Niemand muss angerufen werden." */
	empty: string;
	items: CallItemView[];
};

const REASON_TEXT: Record<CallReason, (locale: Locale) => string> = {
	keybox_refused: (locale) => m.admin_call_reason_keybox_refused({}, { locale }),
	keybox_expired: (locale) => m.admin_call_reason_keybox_expired({}, { locale }),
	keybox_overdue: (locale) => m.admin_call_reason_keybox_overdue({}, { locale }),
	warning_refused: (locale) => m.admin_call_reason_warning_refused({}, { locale }),
	warning_expired: (locale) => m.admin_call_reason_warning_expired({}, { locale }),
	warning_overdue: (locale) => m.admin_call_reason_warning_overdue({}, { locale })
};

const KEYBOX_REASONS: readonly CallReason[] = ['keybox_refused', 'keybox_expired', 'keybox_overdue'];

/** Pure: "Heute, Di 12. Januar" / "Morgen, …" / the short date, judged at `now` (Zurich). */
export function callDateLine(start: Instant, now: Instant, locale: Locale): string {
	const date = localDate(start);
	const short = formatDateShort(date, locale);
	if (date === today(now)) return m.admin_call_date_today({ date: short }, { locale });
	if (date === addDays(today(now), 1)) return m.admin_call_date_tomorrow({ date: short }, { locale });
	return short;
}

/** `badgeText`, or null for a notice it cannot word (e.g. a cold notice without an earliest arrival): never throws. */
function noticeText(notice: Notice, start: Instant, now: Instant, locale: Locale): string | null {
	try {
		return badgeText(notice, start, now, locale);
	} catch {
		return null;
	}
}

export type CallItemInput = {
	entry: CallEntry;
	feed: CallFeedEntry;
	contact: CallContact | null;
	/** The current keybox code setting, or null when unset. */
	keyboxCode: string | null;
};

/** Pure: one entry. */
export function buildCallItem({ entry, feed, contact, keyboxCode }: CallItemInput, now: Instant, locale: Locale): CallItemView {
	const { start } = entry;
	const { lastTold, current } = feed;
	const name = contact?.name?.trim() || m.admin_no_name({}, { locale });
	const mobile = contact?.mobile?.trim() || null;
	const urgent = entry.marker === 'call_required';
	const toldText = lastTold ? noticeText(lastTold, start, now, locale) : null;
	const keyboxReason = entry.reasons.some((r) => KEYBOX_REASONS.includes(r));
	return {
		bookingId: entry.bookingId,
		heading: m.admin_call_heading({ time: formatTime(start), name }, { locale }),
		firstName: firstName(contact?.name ?? null),
		marker: {
			text: urgent ? m.call_marker_required({}, { locale }) : m.call_marker_optional({}, { locale }),
			urgent
		},
		dateLine: callDateLine(start, now, locale),
		line: lastTold && current && !noticeEquals(lastTold, current) ? heatChangeLine(lastTold, current, locale) : null,
		notice: current ? noticeText(current, start, now, locale) : null,
		lastTold: toldText ? m.admin_call_last_told({ notice: toldText }, { locale }) : null,
		reasons: entry.reasons.map((r) => REASON_TEXT[r](locale)),
		code: keyboxReason && keyboxCode ? m.admin_call_code({ code: keyboxCode }, { locale }) : null,
		tel: mobile ? { href: telHref(mobile), text: mobile } : null,
		token: current ? serializeNotice(current) : ''
	};
}

/** Pure: the list from its parts. */
export function buildCalls(items: CallItemView[], locale: Locale): CallsView {
	return {
		heading: m.admin_calls_heading({}, { locale }),
		count: items.length,
		empty: m.admin_calls_empty({}, { locale }),
		items
	};
}

/**
 * Pure: the list for `entries` (`deriveCallList(feed, now)`), one item per entry, never fewer: a
 * missing contact gives "(ohne Name)" and no tel link, so the count always equals the nav badge's.
 */
export function buildCallList(
	feed: ReadonlyMap<number, CallFeedEntry>,
	entries: CallEntry[],
	contacts: ReadonlyMap<number, CallContact>,
	keyboxCode: string | null,
	now: Instant,
	locale: Locale
): CallsView {
	const items = entries.map((entry) => {
		const source = feed.get(entry.bookingId);
		// `deriveCallList` only lists bookings of `feed`.
		if (!source) throw new Error('A call-list entry without its feed entry');
		return buildCallItem({ entry, feed: source, contact: contacts.get(entry.bookingId) ?? null, keyboxCode }, now, locale);
	});
	return buildCalls(items, locale);
}

/** The call list at `now`: `deriveCallList(getCallFeed(now))`, the count the nav badge shows. */
export function loadCalls(locale: Locale, now: Instant, db?: Db): CallsView {
	const feed = getCallFeed(now, db);
	const entries = deriveCallList(feed, now);
	const contacts = getCallContacts(
		entries.map((e) => e.bookingId),
		db
	);
	const keyboxCode = entries.length > 0 ? getKeyboxSettings(db).code : null;
	return buildCallList(feed, entries, contacts, keyboxCode, now, locale);
}
