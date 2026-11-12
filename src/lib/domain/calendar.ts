// Season state of the calendar and the nearest selectable day (FR-1).
// Pure: every input, including `now`, is a parameter.
import {
	addDays,
	compareDates,
	isValidDate,
	lastBookableDay,
	today,
	type Instant,
	type LocalDate
} from '#lib/time/index.ts';
import { isBookableDay, type Season, type Settings } from './start-times.ts';

export type CalendarInput = { seasons: Season[]; settings: Settings; now: Instant };

export type CalendarState =
	/** Some day from today to the end of the horizon is selectable. */
	| {
			kind: 'open';
			firstDay: LocalDate;
			lastDay: LocalDate;
			/** Set when today is in no season: the start of the season that holds `firstDay`. */
			seasonStartsOn?: LocalDate;
	  }
	/** Nothing selectable yet; the next season starts later. Booking opens one horizon before it. */
	| { kind: 'before'; seasonStart: LocalDate; bookingOpens: LocalDate }
	/** Nothing selectable and no later season (or no season at all). */
	| { kind: 'after' };

function inSeason(date: LocalDate, season: Season): boolean {
	return compareDates(season.startDate, date) <= 0 && compareDates(date, season.endDate) <= 0;
}

/** Every selectable day, in order: from today to the end of the horizon, inside a season. */
export function selectableDays({ seasons, settings, now }: CalendarInput): LocalDate[] {
	const days: LocalDate[] = [];
	const last = lastBookableDay(now, settings.horizonDays);
	for (let day = today(now); compareDates(day, last) <= 0; day = addDays(day, 1)) {
		if (isBookableDay(day, seasons, settings, now)) days.push(day);
	}
	return days;
}

export function calendarState(input: CalendarInput): CalendarState {
	const { seasons, settings, now } = input;
	const days = selectableDays(input);
	const todayDate = today(now);

	if (days.length > 0) {
		const firstDay = days[0];
		const lastDay = days[days.length - 1];
		if (seasons.some((s) => inSeason(todayDate, s))) return { kind: 'open', firstDay, lastDay };
		const season = seasons.find((s) => inSeason(firstDay, s));
		return season
			? { kind: 'open', firstDay, lastDay, seasonStartsOn: season.startDate }
			: { kind: 'open', firstDay, lastDay };
	}

	const upcoming = seasons
		.filter((s) => compareDates(s.startDate, todayDate) > 0)
		.sort((a, b) => compareDates(a.startDate, b.startDate));
	if (upcoming.length === 0) return { kind: 'after' };
	const seasonStart = upcoming[0].startDate;
	return { kind: 'before', seasonStart, bookingOpens: addDays(seasonStart, -settings.horizonDays) };
}

/**
 * The selectable day closest to `date`: a past date goes to the first day, one beyond the horizon
 * to the last day, a day outside a season to the closest one (the earlier on a tie), and anything
 * that is not a valid date to the first day. `null` when no day is selectable.
 */
export function nearestSelectableDay(date: string, input: CalendarInput): LocalDate | null {
	const days = selectableDays(input);
	if (days.length === 0) return null;
	const first = days[0];
	const last = days[days.length - 1];
	if (!isValidDate(date) || compareDates(date, first) <= 0) return first;
	if (compareDates(date, last) >= 0) return last;
	const selectable = new Set(days);
	for (let k = 0; ; k++) {
		const earlier = addDays(date, -k);
		if (selectable.has(earlier)) return earlier;
		const later = addDays(date, k);
		if (selectable.has(later)) return later;
	}
}
