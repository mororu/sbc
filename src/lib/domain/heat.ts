// Shared core types and the heat state (PRD FR-2; AD-1, AD-8). Both the start-time core and the
// notice build on this module, so the dependency goes one way: heat ← notice ← start-times.
// Pure: every input is a parameter.
import { addMinutes, compareInstants, minutesBetween, type Instant } from '#lib/time/index.ts';

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
	/** The pre-heat window for cold starts, in minutes (AD-24). */
	preheatMinMin: number;
	preheatMaxMin: number;
};

export function bookingEnd(booking: Booking): Instant {
	return addMinutes(booking.start, booking.durationMin);
}

export function live(bookings: Booking[]): Booking[] {
	return bookings.filter((b) => !b.deletedAt);
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
