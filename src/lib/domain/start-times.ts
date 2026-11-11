// Start times and heat state (PRD §4 Glossary, FR-2, FR-4, FR-8, FR-19; AD-1, AD-8).
// Pure: every input, including `now`, is a parameter. The calendar and the book command both call
// `offeredStartTimes`, so the calendar never offers a time the command would refuse.
import {
	addMinutes,
	compareDates,
	compareInstants,
	isValidDate,
	lastBookableDay,
	localDate,
	minutesBetween,
	toInstant,
	today,
	type Instant,
	type LocalDate
} from '#lib/time/index.ts';

export const DURATIONS = [60, 90, 120, 150, 180] as const;
export type Duration = (typeof DURATIONS)[number];
export type HeatState = 'hot' | 'cold';

export type Booking = {
	id: number;
	start: Instant;
	durationMin: number;
	/** The changeover in force when the booking was made (AD-8). */
	changeoverMin: number;
	createdAt: Instant;
	deletedAt?: Instant | null;
};

export type Block = { start: Instant; end: Instant };

export type Settings = {
	/** The current changeover: applies to new bookings and to free start times. */
	changeoverMin: number;
	/** Operating hours as minutes after local midnight, e.g. 600 = 10:00, 1320 = 22:00. */
	openMinute: number;
	closeMinute: number;
	horizonDays: number;
};

export type Season = { startDate: LocalDate; endDate: LocalDate };

export type StartTimeKind = 1 | 2 | 3;

export type OfferedStartTime = {
	start: Instant;
	kinds: StartTimeKind[];
	durations: Duration[];
	heat: HeatState;
};

export function bookingEnd(booking: Booking): Instant {
	return addMinutes(booking.start, booking.durationMin);
}

function live(bookings: Booking[]): Booking[] {
	return bookings.filter((b) => !b.deletedAt);
}

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

/**
 * The booking or block that ends last at or before `start` (a block wins a tie: it never heats).
 * A block that is still running at `start` counts as the last item too, so it can never be hot.
 */
function lastBefore(
	start: Instant,
	bookings: Booking[],
	blocks: Block[],
	exclude?: Booking
): { kind: 'booking'; booking: Booking; end: Instant } | { kind: 'block'; end: Instant } | null {
	let best: ReturnType<typeof lastBefore> = null;
	for (const booking of live(bookings)) {
		if (booking === exclude || (exclude && booking.id === exclude.id)) continue;
		const end = bookingEnd(booking);
		if (compareInstants(end, start) > 0) continue;
		if (!best || compareInstants(end, best.end) > 0) best = { kind: 'booking', booking, end };
	}
	for (const block of blocks) {
		const runningAtStart =
			compareInstants(block.start, start) < 0 && compareInstants(block.end, start) > 0;
		if (runningAtStart) return { kind: 'block', end: block.end };
		if (compareInstants(block.end, start) > 0) continue;
		if (!best || compareInstants(block.end, best.end) >= 0) best = { kind: 'block', end: block.end };
	}
	return best;
}

/**
 * Heat state of a free start time: hot only if the last booking or block before it is a booking
 * ending exactly one current changeover earlier. A block in between, any longer gap, or nothing
 * before it makes it a cold start.
 */
export function freeHeat(
	start: Instant,
	bookings: Booking[],
	blocks: Block[],
	changeoverMin: number
): HeatState {
	const previous = lastBefore(start, bookings, blocks);
	if (previous?.kind !== 'booking') return 'cold';
	return gapMinutes(previous.end, start) === changeoverMin ? 'hot' : 'cold';
}

/** Whole minutes between two instants; stray seconds never turn a back-to-back pair cold. */
function gapMinutes(from: Instant, to: Instant): number {
	return Math.round(minutesBetween(from, to));
}

/** Whichever of two bookings was made later: by `createdAt`, then by row id. */
function laterMade(a: Booking, b: Booking): Booking {
	const order = compareInstants(a.createdAt, b.createdAt);
	if (order !== 0) return order > 0 ? a : b;
	return a.id > b.id ? a : b;
}

/**
 * Heat state of an existing booking: hot only if the last booking or block before it is a booking
 * that is back to back with it, i.e. the gap equals the changeover recorded on the later-made of
 * the two (AD-8).
 */
export function bookingHeat(booking: Booking, bookings: Booking[], blocks: Block[]): HeatState {
	const previous = lastBefore(booking.start, bookings, blocks, booking);
	if (previous?.kind !== 'booking') return 'cold';
	const changeover = laterMade(previous.booking, booking).changeoverMin;
	return gapMinutes(previous.end, booking.start) === changeover ? 'hot' : 'cold';
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
 * its heat state. Kind 1: every full and half hour. Kind 2: a booking's end plus the current
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

		offered.push({
			start,
			kinds: [...kindSet].sort((a, b) => a - b),
			durations,
			heat: freeHeat(start, bookings, blocks, changeover)
		});
	}
	return offered.sort((a, b) => compareInstants(a.start, b.start));
}
