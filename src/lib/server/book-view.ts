// The booking form view model (FR-5, FR-9; UX booking form) and its loader behind
// `/book/{date}/{hhmm}`. Like the day view, every string is formatted here on the server, so client
// code never needs src/lib/time. The model holds no row ids and no guest data.
import {
	DURATIONS,
	isBookableDay,
	offeredStartTimes,
	serializeNotice,
	type Block,
	type Booking,
	type Duration,
	type HeatState,
	type OfferedStartTime,
	type Season,
	type Settings
} from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { m } from '#lib/paraglide/messages.js';
import { PARTY_SIZES } from '#lib/schemas/index.ts';
import { getDayItems, getSeasons, getSettings } from '#lib/server/db/queries/index.ts';
import {
	addDays,
	addMinutes,
	compareInstants,
	formatDateLong,
	formatDateTitle,
	formatTime,
	isValidDate,
	localDate,
	toInstant,
	type Instant,
	type LocalDate,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';
import { offerNoticeText, parseHhmm, type DayError } from './day-view.ts';
import { randomId } from './ids.ts';

export type DurationOption = {
	value: Duration;
	/** The accessible name: "90 Minuten, bis 19:30". */
	name: string;
	/** The note under the control while this one is selected: "Minuten · bis 19:30". */
	note: string;
	enabled: boolean;
};

export type BookView = {
	kind: 'form';
	/** `<title>` without the suffix, and the button label: "18:00 buchen". */
	title: string;
	/** "18:00" */
	time: string;
	datetime: Instant;
	back: {
		href: ResolvedPathname;
		/** "Di, 12. Januar" */
		text: string;
		/** "Zurück zu Dienstag, 12. Januar" */
		name: string;
	};
	heat: HeatState;
	/** "Schon heiss" / "Kaltstart"; CSS uppercases it. */
	label: string;
	/** The same heat notice the row showed. */
	notice: string;
	durations: DurationOption[];
	/** Why some durations are not possible, or null when all are. */
	unavailable: string | null;
	duration: Duration;
	partySizes: readonly number[];
	partySize: number;
	/** Fresh for every form: a resubmit with it never books twice. */
	submitToken: string;
	/** The displayed notice as canonical JSON (AD-24), posted back so the command can tell a change. */
	noticeToken: string;
};

export type BookPage = BookView | { kind: 'redirect'; to: string };

/** The start instant of `/book/{date}/{hhmm}`, or null when the URL names no real Zurich time. */
export function parseStart(date: string, hhmm: string): Instant | null {
	if (!isValidDate(date)) return null;
	const time = parseHhmm(hhmm);
	if (!time) return null;
	const start = toInstant(date, time.minute);
	// A time skipped by the spring switch resolves to another clock time: not a real start.
	if (localDate(start) !== date || formatTime(start) !== time.clock) return null;
	return start;
}

/** Where a book URL that names no real time goes: its day (which redirects on if needed), or `/`. */
export function invalidUrlTarget(date: string): string {
	return isValidDate(date) ? `/day/${date}` : '/';
}

/** Where a refused booking goes: the refreshed day with the message (no guest data). */
export function dayErrorHref(date: LocalDate, hhmm: string, code: DayError): string {
	return `/day/${date}?error=${code}&time=${hhmm}`;
}

/**
 * Where a booking goes: its confirmation with the one-time flags `?new=1` and, when the notice
 * changed since the form loaded, `&changed=1`. The flags are no guest data, only how it was reached.
 */
export function bookedHref(publicId: string, changed: boolean): string {
	return `/booked/${publicId}?new=1${changed ? '&changed=1' : ''}`;
}

/** "120–180", or "180" when only the longest is out. */
function range(from: Duration): string {
	const last = DURATIONS[DURATIONS.length - 1];
	return from === last ? String(last) : `${from}–${last}`;
}

/**
 * The note for the durations that are not possible. They always form a suffix, except on a start
 * time only of the third kind, which offers just the durations that end one changeover before the
 * next booking. A block is never named as such: it reads "ab 20:00 belegt".
 */
export function unavailableNote(
	offer: OfferedStartTime,
	bookings: Booking[],
	blocks: Block[],
	settings: Settings,
	locale: Locale
): string | null {
	if (offer.durations.length === DURATIONS.length) return null;
	const start = offer.start;
	const nextBooking = bookings
		.filter((b) => !b.deletedAt && compareInstants(b.start, start) >= 0)
		.sort((a, b) => compareInstants(a.start, b.start))[0];

	const onlyKind3 = !offer.kinds.includes(1) && !offer.kinds.includes(2);
	if (onlyKind3 && nextBooking) {
		return m.duration_only_possible(
			{ durations: offer.durations.join(', '), time: formatTime(nextBooking.start) },
			{ locale }
		);
	}

	const from = DURATIONS.find((d) => !offer.durations.includes(d));
	if (from === undefined) return null;
	// The constraint that first rules out `from`: the latest end it allows, then its message.
	const candidates: { limit: Instant; text: string }[] = [];
	const end = addMinutes(start, from);
	for (const b of bookings) {
		if (b.deletedAt || compareInstants(b.start, start) < 0) continue;
		if (compareInstants(addMinutes(end, settings.changeoverMin), b.start) > 0) {
			candidates.push({
				limit: addMinutes(b.start, -settings.changeoverMin),
				text: m.duration_unavailable_booking({ range: range(from), time: formatTime(b.start) }, { locale })
			});
		}
	}
	for (const block of blocks) {
		if (compareInstants(block.end, start) <= 0) continue;
		if (compareInstants(end, block.start) > 0) {
			candidates.push({
				limit: block.start,
				text: m.duration_unavailable_block({ range: range(from), time: formatTime(block.start) }, { locale })
			});
		}
	}
	const close = toInstant(localDate(start), settings.closeMinute);
	if (compareInstants(end, close) > 0) {
		candidates.push({
			limit: close,
			text: m.duration_unavailable_hours({ range: range(from), time: formatTime(close) }, { locale })
		});
	}
	// Earliest limit wins; on a tie the order above (booking, block, hours) is kept.
	// Should no reason be found, the guest still learns which durations are out.
	candidates.sort((a, b) => compareInstants(a.limit, b.limit));
	return candidates[0]?.text ?? m.duration_unavailable({ range: range(from) }, { locale });
}

/** 60 when offered, else the shortest offered, unless `?d=` names an offered one. */
function preselectDuration(offered: Duration[], requested: string | null): Duration {
	const wanted = Number(requested);
	if ((offered as number[]).includes(wanted)) return wanted as Duration;
	return offered.includes(60) ? 60 : offered[0];
}

/** 2, unless `?p=` names a party size 1–6. */
function preselectPartySize(requested: string | null): number {
	const wanted = Number(requested);
	return requested && (PARTY_SIZES as readonly number[]).includes(wanted) ? wanted : 2;
}

/** Pure: the form for one offered start time. */
export function buildBookView(input: {
	date: LocalDate;
	offer: OfferedStartTime;
	now: Instant;
	locale: Locale;
	settings: Settings;
	bookings: Booking[];
	blocks: Block[];
	submitToken: string;
	/** `?d=` and `?p=`: the choices kept across a language switch. */
	d?: string | null;
	p?: string | null;
}): BookView {
	const { date, offer, now, locale, settings, bookings, blocks } = input;
	const time = formatTime(offer.start);
	return {
		kind: 'form',
		title: m.book_title({ time }, { locale }),
		time,
		datetime: offer.start,
		back: {
			href: `/day/${date}` as ResolvedPathname,
			text: formatDateTitle(date, locale),
			name: m.book_back_name({ date: formatDateLong(date, locale) }, { locale })
		},
		heat: offer.heat,
		label: offer.heat === 'hot' ? m.heat_hot_label({}, { locale }) : m.heat_cold_label({}, { locale }),
		notice: offerNoticeText(offer, now, locale),
		durations: DURATIONS.map((value) => {
			const end = formatTime(addMinutes(offer.start, value));
			return {
				value,
				name: m.duration_option({ minutes: value, time: end }, { locale }),
				note: m.duration_end_note({ time: end }, { locale }),
				enabled: offer.durations.includes(value)
			};
		}),
		unavailable: unavailableNote(offer, bookings, blocks, settings, locale),
		duration: preselectDuration(offer.durations, input.d ?? null),
		partySizes: PARTY_SIZES,
		partySize: preselectPartySize(input.p ?? null),
		submitToken: input.submitToken,
		noticeToken: serializeNotice(offer.notice)
	};
}

type DayData = {
	settings: Settings;
	seasons: Season[];
	bookings: Booking[];
	blocks: Block[];
};

function loadDay(date: LocalDate, db?: Parameters<typeof getSettings>[0]): DayData {
	const { bookings, blocks } = getDayItems(toInstant(addDays(date, -1), 0), toInstant(addDays(date, 2), 0), db);
	return { settings: getSettings(db), seasons: getSeasons(db), bookings, blocks };
}

/**
 * The loader. A URL that names no real time goes to the day (or `/`). A stale form, whose time is
 * taken or has begun, goes straight to the day with the conflict or "hat schon angefangen" message.
 */
export function loadBookView(
	date: string,
	hhmm: string,
	locale: Locale,
	options: {
		now?: Instant;
		db?: Parameters<typeof getSettings>[0];
		d?: string | null;
		p?: string | null;
	} = {}
): BookPage {
	const now = options.now ?? clockNow();
	const start = parseStart(date, hhmm);
	if (!start) return { kind: 'redirect', to: invalidUrlTarget(date) };

	const day = loadDay(date, options.db);
	if (compareInstants(start, now) <= 0) return { kind: 'redirect', to: dayErrorHref(date, hhmm, 'past') };
	// A day that is not bookable (outside the seasons or the horizon): the day route redirects on.
	if (!isBookableDay(date, day.seasons, day.settings, now)) return { kind: 'redirect', to: `/day/${date}` };

	const offer = offeredStartTimes({ date, now, ...day }).find((o) => o.start === start);
	if (!offer) return { kind: 'redirect', to: dayErrorHref(date, hhmm, 'conflict') };

	return buildBookView({
		date,
		offer,
		now,
		locale,
		...day,
		submitToken: randomId(),
		d: options.d,
		p: options.p
	});
}
