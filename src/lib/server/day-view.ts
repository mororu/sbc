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
	type Block,
	type Booking,
	type CalendarState,
	type Duration,
	type HeatState,
	type Season,
	type Settings
} from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { getDayItems, getSeasons, getSettings } from '#lib/server/db/queries/index.ts';
import {
	addDays,
	compareInstants,
	formatDateTitle,
	formatDayMonth,
	formatTime,
	formatWeekday,
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
	/** The start instant, for `<time datetime>`. */
	datetime: Instant;
	durations: Duration[];
	heat: HeatState;
	/** "Schon heiss" / "Kaltstart" in sentence case; CSS uppercases it. */
	label: string;
	/** "Bis 90 Min. · Ofen läuft. Komm um 18:15." or null when there is nothing to say. */
	notice: string | null;
	/** "18:15, schon heiss. Ofen läuft. Komm um 18:15." */
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

export type DayView = {
	kind: 'day';
	date: LocalDate;
	/** `<title>` without the suffix: "Di, 12. Januar". */
	title: string;
	/** `h1`: eyebrow "Heute" or "Dienstag", then "12. Januar". */
	heading: { eyebrow: string; date: string };
	/** "Die Saison beginnt am 9. Januar. Hier sind die ersten Tage." when today is in no season. */
	note: string | null;
	rows: DayRow[];
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
}): DayView {
	const { date, now, locale, settings, seasons, blocks } = input;
	const bookings = input.bookings.filter((b) => !b.deletedAt);

	const free: FreeRow[] = offeredStartTimes({ date, bookings, blocks, settings, seasons, now }).map(
		(offer) => {
			const time = formatTime(offer.start);
			const limit = durationLimit(offer.durations, locale);
			if (offer.heat === 'hot') {
				const heatNotice = m.hot_notice({ time }, { locale });
				return {
					kind: 'free',
					time,
					datetime: offer.start,
					durations: offer.durations,
					heat: 'hot',
					label: m.heat_hot_label({}, { locale }),
					notice: limit ? `${limit} · ${heatNotice}` : heatNotice,
					srText: [m.row_sr_hot({ time }, { locale }), sentence(limit), heatNotice].filter(Boolean).join(' ')
				};
			}
			// The arrival time for cold starts arrives with Story 1.6.
			return {
				kind: 'free',
				time,
				datetime: offer.start,
				durations: offer.durations,
				heat: 'cold',
				label: m.heat_cold_label({}, { locale }),
				notice: limit,
				srText: [m.row_sr_cold({ time }, { locale }), sentence(limit)].filter(Boolean).join(' ')
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

	return {
		kind: 'day',
		date,
		title: formatDateTitle(date, locale),
		heading: {
			eyebrow: date === today(now) ? m.day_today({}, { locale }) : formatWeekday(date, locale),
			date: formatDayMonth(date, locale)
		},
		note: input.seasonStartsOn
			? m.season_soon_note({ date: formatDayMonth(input.seasonStartsOn, locale) }, { locale })
			: null,
		rows
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
	options: { now?: Instant; db?: Parameters<typeof getSettings>[0] } = {}
): DayPage {
	const { db } = options;
	const now = options.now ?? clockNow();
	const settings = getSettings(db);
	const seasons = getSeasons(db);
	const state = calendarState({ seasons, settings, now });

	let day: LocalDate;
	if (date === null) {
		if (state.kind !== 'open') return buildSeasonView(state, locale);
		const todayDate = today(now);
		day = isBookableDay(todayDate, seasons, settings, now) ? todayDate : state.firstDay;
	} else {
		if (!isBookableDay(date, seasons, settings, now)) {
			const nearest = nearestSelectableDay(date, { seasons, settings, now });
			return { kind: 'redirect', to: nearest ? `/day/${nearest}` : '/' };
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
		seasonStartsOn: state.kind === 'open' ? state.seasonStartsOn : undefined
	});
}
