// Block conflicts (FR-17; AD-8; Story 3.5): whether a new block may be saved next to the live
// bookings. A block never removes a booking, so one that overlaps a booking is refused; and a block
// may not sit inside the changeover gap of a back-to-back pair (it would turn the later booking into a
// cold start without giving it any time). Touching a booking's start or end is fine: no changeover is
// needed next to a block. Overlapping another block is fine too.
// Pure: every input is a parameter.
import { compareInstants, type Instant } from '#lib/time/index.ts';
import { bookingEnd, gapMinutes, laterMade, live, type Booking } from './heat.ts';

export type BlockCandidate = { start: Instant; end: Instant };

export type BlockConflict =
	/** The live bookings that intersect [start, end), in start order. */
	| { kind: 'overlap'; bookings: Booking[] }
	/** The block intersects the changeover gap of a back-to-back pair. */
	| { kind: 'gap' };

const intersects = (a: BlockCandidate, from: Instant, to: Instant) =>
	compareInstants(a.start, to) < 0 && compareInstants(a.end, from) > 0;

/**
 * Why `candidate` cannot be saved, or null. Overlap wins over gap. A pair is back to back when the
 * gap from the earlier booking's end to the later one's start equals the changeover recorded on the
 * later-made of the two (AD-8); the gap is [earlier end, later start).
 */
export function blockConflict(candidate: BlockCandidate, bookings: Booking[]): BlockConflict | null {
	const sorted = [...live(bookings)].sort((a, b) => compareInstants(a.start, b.start) || a.id - b.id);
	const overlapping = sorted.filter((b) => intersects(candidate, b.start, bookingEnd(b)));
	if (overlapping.length > 0) return { kind: 'overlap', bookings: overlapping };
	for (const earlier of sorted) {
		const end = bookingEnd(earlier);
		for (const later of sorted) {
			if (later === earlier || compareInstants(later.start, end) <= 0) continue;
			if (gapMinutes(end, later.start) !== laterMade(earlier, later).changeoverMin) continue;
			if (intersects(candidate, end, later.start)) return { kind: 'gap' };
		}
	}
	return null;
}
