// The calendar day view model (AD-26) and the one loader behind `/` and `/day/{date}`.
// The page data is only this view model: times, durations, heat state, taken start/end, season
// state and pre-formatted display strings. Never row ids, `created_at`, names or block reasons.
// All formatting happens here, on the server, so client code never needs src/lib/time.
import {
	bookingEnd,
	calendarState,
	DURATIONS,
	isBookableDay,
	nearestSelectableDay,
	offeredStartTimes,
	selectableDays,
	type Block,
	type Booking,
	type CalendarState,
	type Duration,
	type HeatState,
	type Notice,
	type Season,
	type Settings
} from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { m } from '#lib/paraglide/messages.js';
import { getDayItems, getSeasons, getSettings } from '#lib/server/db/queries/index.ts';
import {
	addDays,
	compareDates,
	compareInstants,
	formatDateLong,
	formatDateTitle,
	formatDayMonth,
	formatDayNumber,
	formatTime,
	formatWeekday,
	formatWeekdayShort,
	lastBookableDay,
	minutesBetween,
	toInstant,
	today,
	type Instant,
	type LocalDate,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';

export type FreeRow = {
	kind: 'free';
	/** "18:15" */
	time: string;
	/** The booking form: `/book/{date}/{hhmm}`. */
	href: ResolvedPathname;
	/** The start instant, for `<time datetime>`. */
	datetime: Instant;
	durations: Duration[];
	heat: HeatState;
	/** "Schon heiss" / "Kaltstart" in sentence case; CSS uppercases it. */
	label: string;
	/** "Bis 90 Min. · Ofen läuft. Komm um 18:15." or null when there is nothing to say. */
	notice: string | null;
	/** "18:15, schon heiss. Ofen läuft. Komm um 18:15. Buchen." */
	srText: string;
};

export type TakenRow = {
	kind: 'taken';
	/** Start clipped to operating hours, "16:00". */
	time: string;
	datetime: Instant;
	/** "bis 17:00" */
	until: string;
	/** End clipped to operating hours. */
	untilDatetime: Instant;
	/** "Belegt" in sentence case; CSS uppercases it. */
	label: string;
	/** "16:00 bis 17:00, belegt" */
	srText: string;
};

export type DayRow = FreeRow | TakenRow;

export type StripDay = {
	date: LocalDate;
	/** `/day/{date}`, or null for a day outside every season (shown struck through). */
	href: ResolvedPathname | null;
	/** "Mi" / "Wed" */
	weekday: string;
	/** "13" */
	day: string;
	/** The accessible name: "Mittwoch, 13. Januar", or "Mittwoch, 13. Januar, nicht buchbar". */
	name: string;
};

export type DayView = {
	kind: 'day';
	date: LocalDate;
	/** The day `/` shows: today, or the first selectable day. Lets the client select it while `/` loads. */
	home: LocalDate;
	/** `<title>` without the suffix: "Di, 12. Januar", or "Fehler: Di, 12. Januar" with an error. */
	title: string;
	/** `h1`: eyebrow "Heute" or "Dienstag", then "12. Januar". */
	heading: { eyebrow: string; date: string };
	/** A refused booking (`?error=conflict|past&time=hhmm`): shown first in `main`, focused on load. */
	error: { text: string } | null;
	/** "Die Saison beginnt am 9. Januar. Hier sind die ersten Tage." when today is in no season. */
	note: string | null;
	rows: DayRow[];
	/** Every day from today to the end of the horizon. */
	strip: StripDay[];
	/** The neighbouring selectable days, or null at the ends. */
	prev: ResolvedPathname | null;
	next: ResolvedPathname | null;
	/** `/`, or null when this view already shows the home day. */
	today: ResolvedPathname | null;
	/** Why there is no free start time: all of today's are over, or the day is fully taken. */
	empty: { kind: 'taken' | 'past'; text: string } | null;
	/** Announced after a day switch: "Mittwoch, 13. Januar: 4 freie Zeiten", or the empty line. */
	status: string;
	/** Fixed copy for the day navigation. */
	labels: { strip: string; prev: string; next: string; today: string; loading: string };
};

export type SeasonView = {
	kind: 'season';
	title: string;
	/** The first sentence, shown as the `h1`. */
	heading: string;
	/** The rest, below a hairline. */
	body: string;
};

export type DayPage = DayView | SeasonView | { kind: 'redirect'; to: string };

// Links in the view model are root-relative. `resolve()` from `$app/paths` would return paths
// relative to the request URL during SSR, and a load fetched as `/day/x/__data.json` would get
// `../../day/…`. The app has no base path, so the root-relative path is the resolved pathname.
const HOME_HREF = '/' as ResolvedPathname;

/** The link to a day: `/day/{date}`. */
function dayHref(date: LocalDate): ResolvedPathname {
	return `/day/${date}` as ResolvedPathname;
}

/** `/book/{date}/{hhmm}` for a start instant. */
export function bookHref(date: LocalDate, start: Instant): ResolvedPathname {
	return `/book/${date}/${formatTime(start).replace(':', '')}` as ResolvedPathname;
}

/** A URL time `hhmm` ("1800") as its clock text and minute of the day, or null. */
export function parseHhmm(hhmm: string | null): { clock: string; minute: number } | null {
	const match = /^([01]\d|2[0-3])([0-5]\d)$/.exec(hhmm ?? '');
	if (!match) return null;
	return { clock: `${match[1]}:${match[2]}`, minute: Number(match[1]) * 60 + Number(match[2]) };
}

/** True for a valid refusal query: `?error=conflict|past&time=hhmm`. */
function isDayErrorQuery(error: string | null, time: string | null): error is DayError {
	return parseHhmm(time) !== null && (DAY_ERRORS as readonly (string | null)[]).includes(error);
}

/** The refusals the book form sends back to the day (FR-6). */
export const DAY_ERRORS = ['conflict', 'past'] as const;
export type DayError = (typeof DAY_ERRORS)[number];

/** The day's error message for `?error=…&time=hhmm`, or null for anything else. No guest data. */
export function dayError(error: string | null, time: string | null, locale: Locale): { text: string } | null {
	const parsed = parseHhmm(time);
	if (!parsed || !isDayErrorQuery(error, time)) return null;
	const clock = parsed.clock;
	return {
		text:
			error === 'conflict'
				? m.error_conflict({ time: clock }, { locale })
				: m.error_past({ time: clock }, { locale })
	};
}

/** "Nur 60 Min." for one duration, "Bis 90 Min." for a shorter prefix, null for all of them. */
function durationLimit(durations: Duration[], locale: Locale): string | null {
	if (durations.length === 1) return m.duration_only({ minutes: durations[0] }, { locale });
	if (durations.length < DURATIONS.length) {
		return m.duration_up_to({ minutes: Math.max(...durations) }, { locale });
	}
	return null;
}

/** Screen-reader text reads the parts as sentences: "Up to 90 min" becomes "Up to 90 min." */
function sentence(text: string | null): string | null {
	if (!text) return null;
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The cold-start notice text. "Already past" and "too little time" are derived here from the
 * notice, the start and `now`; they are never part of the notice itself. Neither is an error:
 * the time stays bookable.
 */
export function coldNoticeText(notice: Notice, start: Instant, now: Instant, locale: Locale): string {
	const earliest = notice.earliest;
	if (earliest === null) throw new Error('A cold notice without an earliest arrival');
	const lastArrival = notice.latest ?? earliest;
	if (compareInstants(now, lastArrival) > 0) return m.cold_notice_past({}, { locale });
	if (notice.latest === null) {
		const minutes = Math.floor(minutesBetween(earliest, start));
		return m.cold_notice_short({ minutes, time: formatTime(earliest) }, { locale });
	}
	return m.cold_notice({ earliest: formatTime(earliest), latest: formatTime(notice.latest) }, { locale });
}

/** The heat notice of a free start time, as the row and the booking form show it. */
export function offerNoticeText(
	offer: { start: Instant; heat: HeatState; notice: Notice },
	now: Instant,
	locale: Locale
): string {
	return offer.heat === 'hot'
		? m.hot_notice({ time: formatTime(offer.start) }, { locale })
		: coldNoticeText(offer.notice, offer.start, now, locale);
}

/** Pure: builds the day's view model. `bookings` and `blocks` cover the day before to the day after. */
export function buildDayView(input: {
	date: LocalDate;
	now: Instant;
	locale: Locale;
	settings: Settings;
	seasons: Season[];
	bookings: Booking[];
	blocks: Block[];
	/** Set when today is in no season (CalendarState `seasonStartsOn`). */
	seasonStartsOn?: LocalDate;
	/** The day `/` shows. Defaults to `date`. */
	home?: LocalDate;
	/** A refused booking's message, from `dayError`. */
	error?: { text: string } | null;
}): DayView {
	const { date, now, locale, settings, seasons, blocks } = input;
	const home = input.home ?? date;
	const bookings = input.bookings.filter((b) => !b.deletedAt);

	const free: FreeRow[] = offeredStartTimes({ date, bookings, blocks, settings, seasons, now }).map(
		(offer) => {
			const time = formatTime(offer.start);
			const href = bookHref(date, offer.start);
			const book = m.row_sr_book({}, { locale });
			const limit = durationLimit(offer.durations, locale);
			if (offer.heat === 'hot') {
				const heatNotice = offerNoticeText(offer, now, locale);
				return {
					kind: 'free',
					time,
					href,
					datetime: offer.start,
					durations: offer.durations,
					heat: 'hot',
					label: m.heat_hot_label({}, { locale }),
					notice: limit ? `${limit} · ${heatNotice}` : heatNotice,
					srText: [m.row_sr_hot({ time }, { locale }), sentence(limit), heatNotice, book].filter(Boolean).join(' ')
				};
			}
			const coldNotice = offerNoticeText(offer, now, locale);
			return {
				kind: 'free',
				time,
				href,
				datetime: offer.start,
				durations: offer.durations,
				heat: 'cold',
				label: m.heat_cold_label({}, { locale }),
				notice: limit ? `${limit} · ${coldNotice}` : coldNotice,
				srText: [m.row_sr_cold({ time }, { locale }), sentence(limit), coldNotice, book].filter(Boolean).join(' ')
			};
		}
	);

	const open = toInstant(date, settings.openMinute);
	const close = toInstant(date, settings.closeMinute);
	// Clip every booking and block to operating hours, then merge the ones that overlap, so a block
	// over a booking (or two overlapping blocks) shows as one taken row. Intervals that only touch
	// (back-to-back bookings) stay separate rows.
	const clipped = [
		...bookings.map((b) => ({ start: b.start, end: bookingEnd(b) })),
		...blocks.map((b) => ({ start: b.start, end: b.end }))
	]
		.filter((i) => compareInstants(i.start, close) < 0 && compareInstants(i.end, open) > 0)
		.map((i) => ({
			start: compareInstants(i.start, open) < 0 ? open : i.start,
			end: compareInstants(i.end, close) > 0 ? close : i.end
		}))
		.sort((a, b) => compareInstants(a.start, b.start) || compareInstants(a.end, b.end));
	const merged: { start: Instant; end: Instant }[] = [];
	for (const interval of clipped) {
		const last = merged[merged.length - 1];
		if (last && compareInstants(interval.start, last.end) < 0) {
			if (compareInstants(interval.end, last.end) > 0) last.end = interval.end;
		} else {
			merged.push({ ...interval });
		}
	}
	const taken: TakenRow[] = merged.map(({ start, end }) => {
		const time = formatTime(start);
		const endTime = formatTime(end);
		return {
			kind: 'taken',
			time,
			datetime: start,
			until: m.taken_until({ time: endTime }, { locale }),
			untilDatetime: end,
			label: m.taken_label({}, { locale }),
			srText: m.row_sr_taken({ start: time, end: endTime }, { locale })
		};
	});

	// After the merge, taken rows never overlap, so no two taken rows share a start; and a free
	// start time never lies inside a taken interval. A free time can equal a taken row's start only
	// in theory; taken sorts first then, for a stable order.
	const rows: DayRow[] = [...taken, ...free].sort(
		(a, b) => compareInstants(a.datetime, b.datetime) || (a.kind === b.kind ? 0 : a.kind === 'taken' ? -1 : 1)
	);

	const days = selectableDays({ seasons, settings, now });
	const selectable = new Set(days);
	const strip: StripDay[] = [];
	const lastDay = lastBookableDay(now, settings.horizonDays);
	for (let day = today(now); compareDates(day, lastDay) <= 0; day = addDays(day, 1)) {
		const long = formatDateLong(day, locale);
		const bookable = selectable.has(day);
		strip.push({
			date: day,
			href: bookable ? dayHref(day) : null,
			weekday: formatWeekdayShort(day, locale),
			day: formatDayNumber(day, locale),
			name: bookable ? long : m.strip_day_unavailable({ date: long }, { locale })
		});
	}
	const index = days.indexOf(date);
	const prev = index > 0 ? dayHref(days[index - 1]) : null;
	const next = index >= 0 && index < days.length - 1 ? dayHref(days[index + 1]) : null;

	// No free start time left: on today, "past" if not even an empty day would offer one now.
	let empty: DayView['empty'] = null;
	if (free.length === 0) {
		const past =
			date === today(now) &&
			offeredStartTimes({ date, bookings: [], blocks: [], settings, seasons, now }).length === 0;
		empty = past
			? { kind: 'past', text: m.empty_past({}, { locale }) }
			: { kind: 'taken', text: m.empty_taken({}, { locale }) };
	}

	const error = input.error ?? null;
	return {
		kind: 'day',
		date,
		home,
		title: error
			? m.title_error({ title: formatDateTitle(date, locale) }, { locale })
			: formatDateTitle(date, locale),
		error,
		heading: {
			eyebrow: date === today(now) ? m.day_today({}, { locale }) : formatWeekday(date, locale),
			date: formatDayMonth(date, locale)
		},
		note: input.seasonStartsOn
			? m.season_soon_note({ date: formatDayMonth(input.seasonStartsOn, locale) }, { locale })
			: null,
		rows,
		strip,
		prev,
		next,
		today: date === home ? null : HOME_HREF,
		empty,
		status: empty
			? empty.text
			: m.day_status({ date: formatDateLong(date, locale), count: free.length }, { locale }),
		labels: {
			strip: m.strip_name({}, { locale }),
			prev: m.day_prev({}, { locale }),
			next: m.day_next({}, { locale }),
			today: m.today_link({}, { locale }),
			loading: m.day_loading({}, { locale })
		}
	};
}

/** Pure: the season notice for the before and after states. */
export function buildSeasonView(
	state: Exclude<CalendarState, { kind: 'open' }>,
	locale: Locale
): SeasonView {
	const title = m.calendar_title({}, { locale });
	if (state.kind === 'before') {
		return {
			kind: 'season',
			title,
			heading: m.season_before_heading({ date: formatDayMonth(state.seasonStart, locale) }, { locale }),
			body: m.season_before_body({ date: formatDayMonth(state.bookingOpens, locale) }, { locale })
		};
	}
	return {
		kind: 'season',
		title,
		heading: m.season_after_heading({}, { locale }),
		body: m.season_after_body({}, { locale })
	};
}

/**
 * The shared loader. `date` null is `/`: today, or the first selectable day when today is not
 * selectable, or the season notice. A `/day/{date}` that is not selectable redirects to the
 * nearest selectable day, or to `/` when there is none.
 */
export function loadDayView(
	date: string | null,
	locale: Locale,
	options: {
		now?: Instant;
		db?: Parameters<typeof getSettings>[0];
		/** `?error=` and `?time=` of `/day/{date}`. */
		error?: string | null;
		time?: string | null;
	} = {}
): DayPage {
	const { db } = options;
	const now = options.now ?? clockNow();
	const settings = getSettings(db);
	const seasons = getSeasons(db);
	const state = calendarState({ seasons, settings, now });

	if (state.kind !== 'open' && date === null) return buildSeasonView(state, locale);
	const todayDate = today(now);
	const home =
		state.kind === 'open' && !isBookableDay(todayDate, seasons, settings, now) ? state.firstDay : todayDate;

	let day: LocalDate;
	if (date === null) {
		day = home;
	} else {
		if (!isBookableDay(date, seasons, settings, now)) {
			const nearest = nearestSelectableDay(date, { seasons, settings, now });
			if (!nearest) return { kind: 'redirect', to: '/' };
			// A refusal is dropped: its time belongs to another day, so the message would mislead.
			return { kind: 'redirect', to: `/day/${nearest}` };
		}
		day = date;
	}

	const { bookings, blocks } = getDayItems(toInstant(addDays(day, -1), 0), toInstant(addDays(day, 2), 0), db);
	return buildDayView({
		date: day,
		now,
		locale,
		settings,
		seasons,
		bookings,
		blocks,
		seasonStartsOn: state.kind === 'open' ? state.seasonStartsOn : undefined,
		home,
		error: date === null ? null : dayError(options.error ?? null, options.time ?? null, locale)
	});
}
