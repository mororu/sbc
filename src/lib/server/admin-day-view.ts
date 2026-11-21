// The admin day view (UX-DR46; FR-16, Story 3.2) and the booking detail: their view models, builders
// and loaders. Bookings come from `getAdminBookings`/`getAdminBooking` (admin queries: contact data
// is fine here, admin routes only). The detail carries the delete dialog's model (Story 3.3): the
// impact from `getDeletionImpact` (the query the delete command rechecks), its mini row and token.
// Every string is formatted here on the server, so client code never needs src/lib/time.
// Read-only: nothing here writes.
import {
	impactToken,
	noticeEquals,
	outsideCurrentTimes,
	type HeatState,
	type Notice,
	type Season,
	type Settings
} from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { adminBookingHref, adminDayHref } from '#lib/admin-nav.ts';
import { mailtoHref } from '#lib/mailto.ts';
import { m } from '#lib/paraglide/messages.js';
import {
	adminDayAccepted,
	deletedBookingDate,
	getAdminBooking,
	getAdminBookings,
	getAdminStripExtraDates,
	getDeletionImpact,
	getFutureFlagCandidates,
	getKeyboxSettings,
	getSeasons,
	getSettings,
	type AdminBooking,
	type AdminKeyboxRow,
	type AdminRefusal,
	type DeletionImpact
} from '#lib/server/db/queries/index.ts';
import {
	addDays,
	addMinutes,
	compareDates,
	compareInstants,
	formatDateLong,
	formatDateShort,
	formatDateTitle,
	formatDayMonth,
	formatDayNumber,
	formatTime,
	formatWeekday,
	formatWeekdayShort,
	isValidDate,
	localDate,
	toInstant,
	today,
	type Instant,
	type LocalDate,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';
import type { StripDay } from './day-view.ts';
import { buildImpactRow, type ImpactRowView } from './impact-view.ts';
import { loadReplies, type RepliesView } from './reply-view.ts';
import { badgeText } from './notice-text.ts';

type Db = Parameters<typeof getSettings>[0];

/** A notice as the admin pages show it: the heat state (icon + label) and the badge text. */
export type AdminNotice = {
	heat: HeatState;
	/** "Schon heiss" / "Kaltstart" in sentence case; CSS uppercases it. */
	label: string;
	/** "Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein." (`badgeText` at `now`). */
	text: string;
};

/** One booking as a row of the admin day view, the admin day table and the admin home. */
export type AdminRow = {
	id: number;
	/** The booking detail. */
	href: ResolvedPathname;
	/** "17:15–18:15" */
	time: string;
	datetime: Instant;
	/** "Tom Brunner" ("(ohne Name)" once erased). */
	name: string;
	/** "2 Personen" */
	party: string;
	/** The party size as a number, for the table. */
	partySize: number;
	email: string | null;
	mobile: string | null;
	/** The notice it has now, or null when it cannot be derived. */
	notice: AdminNotice | null;
	/** The notice the guest was last told, or null when none is stored. */
	lastTold: AdminNotice | null;
	/** "Hinweis geändert" when the notice now differs from the last-told one. */
	changed: string | null;
	/** Muted "Code 4711": the keybox email went out with the current code. */
	code: string | null;
	/** Tag "Alter Code 1234": it went out with a code that is not the current one. */
	oldCode: string | null;
	/** The code the keybox email contained, for the table; null before it went out. */
	sentCode: string | null;
	/** Tag "Ausserhalb der Zeiten": a booking that has not started and no longer fits the current times. */
	flag: string | null;
};

/** What `buildAdminRow` needs besides the booking. */
export type AdminRowContext = {
	now: Instant;
	locale: Locale;
	seasons: Season[];
	settings: Pick<Settings, 'openMinute' | 'closeMinute'>;
	/** The current keybox code setting, or null when unset. */
	keyboxCode: string | null;
};

function adminNotice(notice: Notice | null, start: Instant, now: Instant, locale: Locale): AdminNotice | null {
	if (!notice) return null;
	return {
		heat: notice.heat,
		label: notice.heat === 'hot' ? m.heat_hot_label({}, { locale }) : m.heat_cold_label({}, { locale }),
		text: badgeText(notice, start, now, locale)
	};
}

/** The code a sent keybox email contained, or null while it has not gone out. */
const sentCodeOf = (keybox: AdminKeyboxRow | null): string | null => {
	const code = keybox?.state === 'accepted' ? keybox.snapshotKeyboxCode?.trim() : null;
	return code ? code : null;
};

/** True for a booking that has not started at `now` and no longer fits the current times. */
export function isFlagged(booking: { start: Instant; durationMin: number }, context: AdminRowContext): boolean {
	return (
		compareInstants(booking.start, context.now) > 0 &&
		outsideCurrentTimes(booking, context.seasons, context.settings)
	);
}

const blankToNull = (value: string | null): string | null => (value && value.trim() ? value : null);

/** `tel:` href for a stored mobile: only `+` and digits. */
export const telHref = (mobile: string) => `tel:${mobile.replace(/[^+0-9]/g, '')}`;

/** Pure: one booking as an admin row. */
export function buildAdminRow(booking: AdminBooking, context: AdminRowContext): AdminRow {
	const { now, locale } = context;
	const end = addMinutes(booking.start, booking.durationMin);
	const sentCode = sentCodeOf(booking.keybox);
	// Old only against a set code: with the setting unset there is nothing to compare with.
	const current = sentCode !== null && (context.keyboxCode === null || sentCode === context.keyboxCode);
	const changed =
		booking.current && booking.lastTold && !noticeEquals(booking.current, booking.lastTold)
			? m.admin_tag_changed({}, { locale })
			: null;
	return {
		id: booking.id,
		href: adminBookingHref(booking.id),
		time: `${formatTime(booking.start)}–${formatTime(end)}`,
		datetime: booking.start,
		name: booking.name ?? m.admin_no_name({}, { locale }),
		party: m.booked_people({ count: booking.partySize }, { locale }),
		partySize: booking.partySize,
		email: blankToNull(booking.email),
		mobile: blankToNull(booking.mobile),
		notice: adminNotice(booking.current, booking.start, now, locale),
		lastTold: adminNotice(booking.lastTold, booking.start, now, locale),
		changed,
		code: sentCode !== null && current ? m.admin_code({ code: sentCode }, { locale }) : null,
		oldCode: sentCode !== null && !current ? m.admin_tag_old_code({ code: sentCode }, { locale }) : null,
		sentCode,
		flag: isFlagged(booking, context) ? m.admin_flag_tag({}, { locale }) : null
	};
}

export type AdminDayView = {
	kind: 'admin-day';
	date: LocalDate;
	/** `<title>` without the suffix: "Di, 12. Januar · Buchungen". */
	title: string;
	/** `h1`: eyebrow "Heute" or "Dienstag", then "12. Januar". */
	heading: { eyebrow: string; date: string };
	rows: AdminRow[];
	/** The open reply reminders of bookings on this day (Story 3.4), above the bookings; the section only when non-empty. */
	replies: RepliesView;
	/** The current (else the next) season's days plus every later booking or block day, in date order. */
	strip: StripDay[];
	/** The nearest strip day before / after the shown day, or null at the ends. */
	prev: ResolvedPathname | null;
	next: ResolvedPathname | null;
	/** "Keine Buchungen an diesem Tag." when the day has no live booking. */
	empty: string | null;
	/** Announced after a day switch: "Dienstag, 12. Januar: 2 Buchungen" or "Dienstag, 12. Januar: Keine Buchungen." */
	status: string;
	labels: {
		strip: string;
		prev: string;
		next: string;
		loading: string;
		/** The table's caption: "Buchungen am Dienstag, 12. Januar". */
		caption: string;
		/** Hidden text behind the table's dash for a missing notice: "nicht gespeichert". */
		noNotice: string;
		columns: {
			time: string;
			name: string;
			party: string;
			email: string;
			mobile: string;
			notice: string;
			lastTold: string;
			code: string;
		};
	};
};

/** The days of the season that contains today, else of the next one, else none. `seasons` earliest first. */
function seasonDays(seasons: Season[], now: Instant): LocalDate[] {
	const day = today(now);
	const season =
		seasons.find((s) => compareDates(s.startDate, day) <= 0 && compareDates(day, s.endDate) <= 0) ??
		seasons.find((s) => compareDates(s.startDate, day) > 0);
	if (!season) return [];
	const days: LocalDate[] = [];
	for (let d = season.startDate; compareDates(d, season.endDate) <= 0; d = addDays(d, 1)) days.push(d);
	return days;
}

/** Pure: the strip's dates: the season's days plus `extra`, sorted, without repeats. */
export function adminStripDates(seasons: Season[], now: Instant, extra: LocalDate[]): LocalDate[] {
	return [...new Set([...seasonDays(seasons, now), ...extra])].sort(compareDates);
}

/**
 * Pure: the day `/admin/day` shows: today when it lies in a season, else the first day of the next
 * season, else today (always accepted).
 */
export function adminHomeDay(seasons: Season[], now: Instant): LocalDate {
	const day = today(now);
	if (seasons.some((s) => compareDates(s.startDate, day) <= 0 && compareDates(day, s.endDate) <= 0)) return day;
	const next = seasons.find((s) => compareDates(s.startDate, day) > 0);
	return next ? next.startDate : day;
}

/** The day `/admin/day` redirects to (see `adminHomeDay`). */
export function defaultAdminDay(options: { now?: Instant; db?: Db } = {}): LocalDate {
	return adminHomeDay(getSeasons(options.db), options.now ?? clockNow());
}

/** Pure: builds the admin day view. `bookings` are the day's live bookings in start order. */
export function buildAdminDayView(input: {
	date: LocalDate;
	bookings: AdminBooking[];
	/** The strip's dates (`adminStripDates`). */
	stripDates: LocalDate[];
	/** Dates with a booking that is flagged (`isFlagged`). */
	flaggedDates: ReadonlySet<LocalDate>;
	context: AdminRowContext;
	/** The day's reply reminders (`loadReplies` with the date). */
	replies: RepliesView;
}): AdminDayView {
	const { date, context, stripDates, flaggedDates } = input;
	const { now, locale } = context;
	const rows = input.bookings.map((b) => buildAdminRow(b, context));
	const strip: StripDay[] = stripDates.map((day) => {
		const long = formatDateLong(day, locale);
		const flagged = flaggedDates.has(day);
		return {
			date: day,
			href: adminDayHref(day),
			weekday: formatWeekdayShort(day, locale),
			day: formatDayNumber(day, locale),
			name: flagged ? m.admin_strip_flagged({ date: long }, { locale }) : long,
			flagged
		};
	});
	const before = stripDates.filter((d) => compareDates(d, date) < 0).at(-1);
	const after = stripDates.find((d) => compareDates(d, date) > 0);
	const empty = rows.length === 0 ? m.admin_day_empty({}, { locale }) : null;
	const long = formatDateLong(date, locale);
	return {
		kind: 'admin-day',
		date,
		title: m.admin_day_title({ date: formatDateTitle(date, locale) }, { locale }),
		heading: {
			eyebrow: date === today(now) ? m.day_today({}, { locale }) : formatWeekday(date, locale),
			date: formatDayMonth(date, locale)
		},
		rows,
		replies: input.replies,
		strip,
		prev: before ? adminDayHref(before) : null,
		next: after ? adminDayHref(after) : null,
		empty,
		status: empty
			? m.admin_day_status_empty({ date: long }, { locale })
			: m.admin_day_status({ date: long, count: rows.length }, { locale }),
		labels: {
			strip: m.strip_name({}, { locale }),
			prev: m.day_prev({}, { locale }),
			next: m.day_next({}, { locale }),
			loading: m.day_loading({}, { locale }),
			caption: m.admin_table_caption({ date: long }, { locale }),
			noNotice: m.admin_notice_none({}, { locale }),
			columns: {
				time: m.admin_col_time({}, { locale }),
				name: m.admin_term_name({}, { locale }),
				party: m.admin_term_people({}, { locale }),
				email: m.admin_term_email({}, { locale }),
				mobile: m.admin_term_mobile({}, { locale }),
				notice: m.admin_term_notice_now({}, { locale }),
				lastTold: m.admin_term_last_told({}, { locale }),
				code: m.admin_col_keybox_code({}, { locale })
			}
		}
	};
}

/** The row context at `now`: settings, seasons and the current keybox code. */
export function loadAdminRowContext(locale: Locale, now: Instant, db?: Db): AdminRowContext {
	return { now, locale, seasons: getSeasons(db), settings: getSettings(db), keyboxCode: getKeyboxSettings(db).code };
}

/**
 * The admin day view of `date`, or null (an admin 404) for anything that is not a valid date with
 * something to show: a season day (past seasons too), a day with a live booking or a block, or today.
 */
export function loadAdminDayView(
	date: string,
	locale: Locale,
	options: { now?: Instant; db?: Db } = {}
): AdminDayView | null {
	const { db } = options;
	const now = options.now ?? clockNow();
	if (!isValidDate(date)) return null;
	if (date !== today(now) && !adminDayAccepted(date, db)) return null;
	const context = loadAdminRowContext(locale, now, db);
	const bookings = getAdminBookings(toInstant(date, 0), toInstant(addDays(date, 1), 0), db);
	const flaggedDates = new Set(
		getFutureFlagCandidates(now, db)
			.filter((b) => isFlagged(b, context))
			.map((b) => localDate(b.start))
	);
	return buildAdminDayView({
		date,
		bookings,
		// The shown day is always a cell (today without a season, a past season day by URL), so one is selected.
		stripDates: adminStripDates(context.seasons, now, [...getAdminStripExtraDates(now, db), date]),
		flaggedDates,
		context,
		replies: loadReplies(locale, { date }, db)
	});
}

// ---------------------------------------------------------------------------
// Booking detail
// ---------------------------------------------------------------------------

export type AdminDetailItem = {
	term: string;
	value: string;
	/** `mailto:` / `tel:` for the email and the mobile; the value stays visible as the link text. */
	href: string | null;
};

export type AdminNoticeItem = { term: string; notice: AdminNotice | null; missing: string };

export type AdminBookingView = {
	kind: 'admin-booking';
	/** `<title>` without the suffix: "Buchung Di, 12. Januar, 17:15–18:15". */
	title: string;
	/** "‹ Di, 12. Januar" back to the booking's day; CSS uppercases it. */
	back: { href: ResolvedPathname; text: string };
	/** "Dienstag, 12. Januar" */
	eyebrow: string;
	/** "17:15–18:15", the `h1`. */
	heading: string;
	datetime: Instant;
	/** "Hat schon begonnen." once the start has come. */
	started: string | null;
	/** Name · E-Mail · Handy · Personen · Dauer · Schlüsselmail. */
	details: AdminDetailItem[];
	/** "Hinweis jetzt" and "Zuletzt gesagt". */
	notices: { now: AdminNoticeItem; lastTold: AdminNoticeItem };
	changed: string | null;
	oldCode: string | null;
	/** "Liegt ausserhalb der neuen Zeiten. Bleibt gültig." */
	flag: string | null;
	/** The refused non-urgent emails (FR-14), or null when there are none. */
	refusals: { heading: string; items: string[] } | null;
	/** "Buchung löschen" and its impact dialog; null once the booking has started (or without an impact). */
	delete: AdminDeleteView | null;
};

/** The delete-booking impact dialog (EXPERIENCE "Impact dialog"; Story 3.3). */
export type AdminDeleteView = {
	/** "Buchung löschen": the destructive button on the detail and the dialog's confirm. */
	button: string;
	/** "Buchung löschen?" */
	title: string;
	/** "Anna Meier · Di 12. Januar, 16:00–17:00" */
	what: string;
	row: ImpactRowView;
	/** The impact token the form posts (`impactToken`). */
	token: string;
	/** "Abbrechen" */
	cancel: string;
	messages: {
		/** "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." */
		stale: string;
		/** "Hat schon begonnen." */
		past: string;
		/** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." */
		failed: string;
	};
};

/** The detail of a booking another admin deleted (Story 3.3): the line and the way back to its day. */
export type AdminBookingGoneView = {
	kind: 'admin-booking-gone';
	/** `<title>` without the suffix: "Gelöschte Buchung". */
	title: string;
	/** "Diese Buchung gibt es nicht mehr." */
	message: string;
	/** "‹ Di, 12. Januar" back to the deleted booking's day. */
	back: { href: ResolvedPathname; text: string };
};

/**
 * "Mo 16:00" when the instant's local date is within 6 days of today (either way), so the weekday
 * names one day; otherwise "Mo 1. März, 16:00".
 */
function shortWhen(at: Instant, now: Instant, locale: Locale): string {
	const date = localDate(at);
	const day = today(now);
	const near = compareDates(date, addDays(day, -6)) >= 0 && compareDates(date, addDays(day, 6)) <= 0;
	return near
		? `${formatWeekdayShort(date, locale)} ${formatTime(at)}`
		: `${formatDateShort(date, locale)}, ${formatTime(at)}`;
}

/** The keybox email status line: "verschickt Mo 16:00 · Code 4711", "geplant Fr 17:15", "abgelehnt: smtp 550", … */
export function keyboxStatus(keybox: AdminKeyboxRow | null, now: Instant, locale: Locale): string {
	if (!keybox) return m.admin_keybox_none({}, { locale });
	switch (keybox.state) {
		case 'accepted': {
			const when = shortWhen(keybox.outcomeAt ?? keybox.dueAt, now, locale);
			const code = sentCodeOf(keybox);
			return code
				? m.admin_keybox_sent({ when, code }, { locale })
				: m.admin_keybox_sent_no_code({ when }, { locale });
		}
		case 'pending':
			return m.admin_keybox_planned({ when: shortWhen(keybox.dueAt, now, locale) }, { locale });
		case 'refused':
			return keybox.reason
				? m.admin_keybox_refused({ reason: keybox.reason }, { locale })
				: m.admin_keybox_refused_plain({}, { locale });
		case 'in_flight':
			return m.admin_keybox_in_flight({}, { locale });
		case 'transient_failure':
			return m.admin_keybox_retrying({ when: shortWhen(keybox.dueAt, now, locale) }, { locale });
		case 'expired':
			return m.admin_keybox_expired({}, { locale });
		case 'cancelled':
			return m.admin_keybox_cancelled({}, { locale });
	}
}

function refusalText(refusal: AdminRefusal, locale: Locale): string {
	const kind =
		refusal.kind === 'confirmation'
			? m.admin_kind_confirmation({}, { locale })
			: m.admin_kind_heat_change({}, { locale });
	return refusal.reason
		? m.admin_refused_item({ kind, reason: refusal.reason }, { locale })
		: m.admin_refused_item_plain({ kind }, { locale });
}

/** True once a booking's start has come (at or before `now`): it shows "Hat schon begonnen." and can no longer be deleted. */
export const hasStarted = (start: Instant, now: Instant): boolean => compareInstants(start, now) <= 0;

/** Pure: the delete dialog of a booking that has not started, from its deletion impact. */
export function buildAdminDeleteView(
	deletion: DeletionImpact,
	what: { name: string | null; time: string },
	context: Pick<AdminRowContext, 'now' | 'locale'>
): AdminDeleteView {
	const { now, locale } = context;
	const date = formatDateShort(deletion.date, locale);
	const name = what.name?.trim();
	return {
		button: m.admin_delete_button({}, { locale }),
		title: m.admin_delete_title({}, { locale }),
		what: name
			? m.admin_delete_what({ name, date, time: what.time }, { locale })
			: m.admin_delete_what_no_name({ date, time: what.time }, { locale }),
		row: buildImpactRow(deletion.impact, { now, locale, firstName: deletion.affectedFirstName, date: deletion.date }),
		token: impactToken(deletion.impact),
		cancel: m.admin_cancel({}, { locale }),
		messages: {
			stale: m.admin_impact_stale({}, { locale }),
			past: m.admin_started({}, { locale }),
			failed: m.admin_action_failed({}, { locale })
		}
	};
}

/**
 * Pure: the booking detail. `deletion` is the booking's deletion impact (`getDeletionImpact`); the
 * delete button and dialog appear only with it and only before the start.
 */
export function buildAdminBookingView(
	booking: AdminBooking,
	context: AdminRowContext,
	deletion: DeletionImpact | null = null
): AdminBookingView {
	const { now, locale } = context;
	const row = buildAdminRow(booking, context);
	const date = localDate(booking.start);
	const dash = '–';
	const started = deletion?.started ?? hasStarted(booking.start, now);
	return {
		kind: 'admin-booking',
		title: m.admin_booking_title({ date: formatDateTitle(date, locale), time: row.time }, { locale }),
		back: { href: adminDayHref(date), text: formatDateTitle(date, locale) },
		eyebrow: formatDateLong(date, locale),
		heading: row.time,
		datetime: booking.start,
		started: started ? m.admin_started({}, { locale }) : null,
		details: [
			{ term: m.admin_term_name({}, { locale }), value: row.name, href: null },
			{
				term: m.admin_term_email({}, { locale }),
				value: row.email ?? dash,
				href: row.email ? mailtoHref(row.email) : null
			},
			{
				term: m.admin_term_mobile({}, { locale }),
				value: row.mobile ?? dash,
				href: row.mobile ? telHref(row.mobile) : null
			},
			{ term: m.admin_term_people({}, { locale }), value: String(booking.partySize), href: null },
			{ term: m.admin_term_duration({}, { locale }), value: m.admin_duration({ minutes: booking.durationMin }, { locale }), href: null },
			{ term: m.admin_term_keybox({}, { locale }), value: keyboxStatus(booking.keybox, now, locale), href: null }
		],
		notices: {
			// A notice now that cannot be derived is a dash: "nicht gespeichert" is only for the last-told one.
			now: { term: m.admin_term_notice_now({}, { locale }), notice: row.notice, missing: dash },
			lastTold: { term: m.admin_term_last_told({}, { locale }), notice: row.lastTold, missing: m.admin_notice_none({}, { locale }) }
		},
		changed: row.changed,
		oldCode: row.oldCode,
		flag: row.flag ? m.admin_flag_detail({}, { locale }) : null,
		refusals:
			booking.refusals.length > 0
				? { heading: m.admin_refused_heading({}, { locale }), items: booking.refusals.map((r) => refusalText(r, locale)) }
				: null,
		delete: !started && deletion ? buildAdminDeleteView(deletion, { name: booking.name, time: row.time }, context) : null
	};
}

/** Pure: the detail of a deleted booking. */
export function buildAdminBookingGoneView(date: LocalDate, locale: Locale): AdminBookingGoneView {
	return {
		kind: 'admin-booking-gone',
		title: m.admin_booking_gone_title({}, { locale }),
		message: m.admin_booking_gone({}, { locale }),
		back: { href: adminDayHref(date), text: formatDateTitle(date, locale) }
	};
}

/** True for a booking id as the admin routes accept it: a positive integer without leading zeros. */
export const isAdminBookingId = (id: string): boolean => /^[1-9][0-9]{0,14}$/.test(id);

/**
 * The detail of a live booking with its delete dialog, the gone view of a deleted one (Story 3.3),
 * or null (an admin 404) for an unknown or malformed id.
 */
export function loadAdminBookingView(
	id: string,
	locale: Locale,
	options: { now?: Instant; db?: Db } = {}
): AdminBookingView | AdminBookingGoneView | null {
	if (!isAdminBookingId(id)) return null;
	const { db } = options;
	const now = options.now ?? clockNow();
	const booking = getAdminBooking(Number(id), db);
	if (!booking) {
		const date = deletedBookingDate(Number(id), db);
		return date ? buildAdminBookingGoneView(date, locale) : null;
	}
	const context = loadAdminRowContext(locale, now, db);
	// A started booking has no delete dialog: its impact is not read.
	if (hasStarted(booking.start, now)) return buildAdminBookingView(booking, context);
	const deletion = getDeletionImpact(booking.id, now, db);
	// Deleted by another admin between the two reads: the gone view.
	if (!deletion) return buildAdminBookingGoneView(localDate(booking.start), locale);
	return buildAdminBookingView(booking, context, deletion);
}
