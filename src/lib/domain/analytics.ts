// Analytics records (FR-30; AD-12, AD-19; Story 4.1): what a booking record and a day record say,
// computed from the day's final bookings and blocks. Pure: every input is a parameter.
import { addMinutes, compareInstants, localMinuteOfDay, toInstant, type Instant, type LocalDate } from '#lib/time/index.ts';
import { bookingEnd, live, type Block, type Booking, type HeatState, type Settings } from './heat.ts';
import { offeredStartTimes, type Season, type StartTimeKind } from './start-times.ts';

/**
 * The kind of a booking's start time: 1 on the full or half hour, else 2 if it starts exactly its
 * recorded changeover after another live booking ends, else 3. `bookings` are those that can touch
 * the day (`dayItemsWindow`).
 */
export function bookingStartKind(booking: Booking, bookings: Booking[]): StartTimeKind {
	if (localMinuteOfDay(booking.start) % 30 === 0) return 1;
	const follows = live(bookings).some(
		(other) =>
			other.id !== booking.id &&
			compareInstants(addMinutes(bookingEnd(other), booking.changeoverMin), booking.start) === 0
	);
	return follows ? 2 : 3;
}

/** A start time that passed unbooked, with its heat state. */
export type UnbookedStartTime = { start: Instant; heat: HeatState };

/**
 * The kind-1 and kind-2 start times of a passed `date` that nobody booked: those the core offers
 * with at least one duration just before they pass, over the day's final bookings and blocks. Offers
 * depend on `now` only through "has not started yet", so one evaluation just before the day begins
 * gives the same list as one per start time.
 */
export function unbookedStartTimes(input: {
	date: LocalDate;
	bookings: Booking[];
	blocks: Block[];
	settings: Settings;
	seasons: Season[];
}): UnbookedStartTime[] {
	const justBefore = addMinutes(toInstant(input.date, 0), -1);
	return offeredStartTimes({ ...input, now: justBefore })
		.filter((offer) => offer.kinds.includes(1) || offer.kinds.includes(2))
		.map(({ start, heat }) => ({ start, heat }));
}
