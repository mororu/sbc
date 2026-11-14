// Heat change (PRD FR-9; AD-6, AD-24; Story 2.3). Which way a booking's notice moved since the guest
// was last told, whether that is worth an email, and which booking a change can affect at all.
// Together with `noticeEquals`, these are the notice comparisons the rest of the code goes through.
// Pure: every input is a parameter.
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';
import { live, type Booking, type Settings } from './heat.ts';
import { noticeEquals, type Notice } from './notice.ts';

/**
 * How the notice moved from `lastTold` to `current`:
 * - `now_hot`: a cold start became hot (good news).
 * - `now_cold`: a hot start became cold.
 * - `later_earliest`: the earliest arrival moved later. Wins over an earlier latest arrival.
 * - `earlier_latest`: the latest arrival moved earlier.
 * - `none`: equal, or the arrival range only widened.
 * A collapsed range (`latest` null) has the earliest arrival as its latest.
 */
export type HeatChangeDirection = 'none' | 'now_hot' | 'now_cold' | 'later_earliest' | 'earlier_latest';

export type HeatChangeClass = 'none' | 'urgent' | 'good_news';

/** The time the guest must arrive by: the latest arrival, or the earliest for a collapsed range. */
const lastArrival = (notice: Notice): Instant | null => notice.latest ?? notice.earliest;

export function heatChangeDirection(lastTold: Notice, current: Notice): HeatChangeDirection {
	if (noticeEquals(lastTold, current)) return 'none';
	if (lastTold.heat === 'cold' && current.heat === 'hot') return 'now_hot';
	if (lastTold.heat === 'hot' && current.heat === 'cold') return 'now_cold';
	if (lastTold.heat === 'hot') return 'none';
	const toldEarliest = lastTold.earliest;
	const earliest = current.earliest;
	const toldLatest = lastArrival(lastTold);
	const latest = lastArrival(current);
	if (toldEarliest === null || earliest === null || toldLatest === null || latest === null) {
		throw new Error('A cold notice without an earliest arrival');
	}
	if (compareInstants(earliest, toldEarliest) > 0) return 'later_earliest';
	if (compareInstants(latest, toldLatest) < 0) return 'earlier_latest';
	return 'none';
}

/** Good news: cold → hot. Nothing: equal or widened only. Everything else is urgent. */
export function classifyHeatChange(lastTold: Notice, current: Notice): HeatChangeClass {
	const direction = heatChangeDirection(lastTold, current);
	if (direction === 'none') return 'none';
	return direction === 'now_hot' ? 'good_news' : 'urgent';
}

/**
 * The booking whose notice a booking or block ending at `item.end` can change: the first live
 * booking (by start, never the item itself) starting at or after the end and no later than the end
 * plus the current changeover plus the longer pre-heat end. A later booking is shielded by that
 * one: the item is no longer the last thing before it. Whether the notice really changed (e.g. a
 * block in between) is left to the helper's recheck. Null when there is none.
 */
export function affectedBooking(
	item: { end: Instant; bookingId?: number },
	bookings: Booking[],
	settings: Pick<Settings, 'changeoverMin' | 'preheatMaxMin'>
): Booking | null {
	const windowEnd = addMinutes(item.end, settings.changeoverMin + settings.preheatMaxMin);
	let first: Booking | null = null;
	for (const booking of live(bookings)) {
		if (item.bookingId !== undefined && booking.id === item.bookingId) continue;
		if (compareInstants(booking.start, item.end) < 0 || compareInstants(booking.start, windowEnd) > 0) continue;
		if (!first || compareInstants(booking.start, first.start) < 0) first = booking;
	}
	return first;
}
