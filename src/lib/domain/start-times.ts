// Start times (PRD §4 Glossary, FR-2, FR-4, FR-8, FR-19; AD-1, AD-8).
// Pure: every input, including `now`, is a parameter. The calendar and the book command both call
// `offeredStartTimes`, so the calendar never offers a time the command would refuse.
import {
	addMinutes,
	compareDates,
	compareInstants,
	isValidDate,
	lastBookableDay,
	localDate,
	toInstant,
	today,
	type Instant,
	type LocalDate
} from '#lib/time/index.ts';
import { bookingEnd, live, type Block, type Booking, type HeatState, type Settings } from './heat.ts';
import { freeNotice, type Notice } from './notice.ts';

// The shared types and heat state live in heat.ts, so notice.ts can use them without a cycle.
export {
	bookingEnd,
	bookingHeat,
	freeHeat,
	type Block,
	type Booking,
	type HeatState,
	type Settings
} from './heat.ts';

export const DURATIONS = [60, 90, 120, 150, 180] as const;
export type Duration = (typeof DURATIONS)[number];
export type Season = { startDate: LocalDate; endDate: LocalDate };

export type StartTimeKind = 1 | 2 | 3;

export type OfferedStartTime = {
	start: Instant;
	kinds: StartTimeKind[];
	durations: Duration[];
	heat: HeatState;
	/** The canonical notice (AD-24), shared by the calendar and the book command. */
	notice: Notice;
};

/** True if `date` lies in a season and between today and the end of the booking horizon. */
export function isBookableDay(
	date: LocalDate,
	seasons: Season[],
	settings: Settings,
	now: Instant
): boolean {
	if (!isValidDate(date)) return false;
	if (compareDates(date, today(now)) < 0) return false;
	if (compareDates(date, lastBookableDay(now, settings.horizonDays)) > 0) return false;
	return seasons.some(
		(s) => compareDates(s.startDate, date) <= 0 && compareDates(date, s.endDate) <= 0
	);
}

/** True if a new booking [start, end) keeps one current changeover to every booking and overlaps no block. */
function fits(
	start: Instant,
	end: Instant,
	bookings: Booking[],
	blocks: Block[],
	changeoverMin: number
): boolean {
	for (const booking of bookings) {
		const clearBefore = compareInstants(addMinutes(end, changeoverMin), booking.start) <= 0;
		const clearAfter = compareInstants(start, addMinutes(bookingEnd(booking), changeoverMin)) >= 0;
		if (!clearBefore && !clearAfter) return false;
	}
	for (const block of blocks) {
		const clear =
			compareInstants(end, block.start) <= 0 || compareInstants(start, block.end) >= 0;
		if (!clear) return false;
	}
	return true;
}

/**
 * `bookings` and `blocks` must include everything that can touch the day: at least those of the day
 * before, the day itself and the day after (a booking ending near midnight still needs a changeover).
 *
 * Every start time a guest may book on `date`, in time order, each with the durations that fit and
 * its heat state and notice. Kind 1: every full and half hour. Kind 2: a booking's end plus the current
 * changeover. Kind 3: a time from which a booking would end exactly one changeover before an
 * existing booking; offered only with those durations unless it is also of kind 1 or 2.
 */
export function offeredStartTimes(input: {
	date: LocalDate;
	bookings: Booking[];
	blocks: Block[];
	settings: Settings;
	seasons: Season[];
	now: Instant;
}): OfferedStartTime[] {
	const { date, blocks, settings, seasons, now } = input;
	if (!isBookableDay(date, seasons, settings, now)) return [];

	const bookings = live(input.bookings);
	const changeover = settings.changeoverMin;
	const open = toInstant(date, settings.openMinute);
	const close = toInstant(date, settings.closeMinute);

	const candidates = new Map<Instant, Set<StartTimeKind>>();
	const add = (start: Instant, kind: StartTimeKind) => {
		const kinds = candidates.get(start) ?? new Set<StartTimeKind>();
		kinds.add(kind);
		candidates.set(start, kinds);
	};

	for (let m = Math.ceil(settings.openMinute / 30) * 30; m < settings.closeMinute; m += 30) {
		add(toInstant(date, m), 1);
	}
	for (const booking of bookings) {
		add(addMinutes(bookingEnd(booking), changeover), 2);
		for (const d of DURATIONS) add(addMinutes(booking.start, -(changeover + d)), 3);
	}

	const offered: OfferedStartTime[] = [];
	for (const [start, kindSet] of candidates) {
		if (localDate(start) !== date) continue;
		if (compareInstants(start, open) < 0) continue;
		if (compareInstants(start, now) <= 0) continue;

		const onlyKind3 = !kindSet.has(1) && !kindSet.has(2);
		const durations = DURATIONS.filter((d) => {
			const end = addMinutes(start, d);
			if (compareInstants(end, close) > 0) return false;
			if (!fits(start, end, bookings, blocks, changeover)) return false;
			if (!onlyKind3) return true;
			const endsBeforeBooking = addMinutes(end, changeover);
			return bookings.some((b) => compareInstants(b.start, endsBeforeBooking) === 0);
		});
		if (durations.length === 0) continue;

		const notice = freeNotice(start, bookings, blocks, settings);
		offered.push({
			start,
			kinds: [...kindSet].sort((a, b) => a - b),
			durations,
			heat: notice.heat,
			notice
		});
	}
	return offered.sort((a, b) => compareInstants(a.start, b.start));
}
