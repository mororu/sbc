// The notice (AD-24): the one canonical value of what a guest is told about a start time.
// Hot: the stove is going, nothing more to say. Cold: the arrival window to light the fire.
// Pure: every input is a parameter. "Past" and the minutes to heat are never part of a notice; the
// view derives them at render time from the notice, the start time and `now`.
import { addMinutes, compareInstants, isValidInstant, type Instant } from '#lib/time/index.ts';
import {
	bookingEnd,
	bookingHeat,
	freeHeat,
	live,
	type Block,
	type Booking,
	type HeatState,
	type Settings
} from './heat.ts';

export type Notice = {
	heat: HeatState;
	/** Cold: the earliest arrival. Hot: null. */
	earliest: Instant | null;
	/** Cold: the latest arrival, after `earliest`; null when the window collapsed to `earliest`. Hot: null. */
	latest: Instant | null;
};

/** The pre-heat window in minutes, e.g. 30–40. */
export type Preheat = { minMin: number; maxMin: number };

const HOT: Notice = { heat: 'hot', earliest: null, latest: null };

/**
 * The arrival window for a cold start at `start`. `earliest` is start − pre-heat max, moved later to
 * the latest point after it at which the wagon is free: a booking's end plus its recorded
 * changeover, or a block's end. Only bookings and blocks that end at or before `start` count, and
 * a block still running at `start`. `earliest` is never after `start`.
 * `latest` is start − pre-heat min, or null when `earliest` is at or after it (the window
 * collapsed; equal counts too).
 * The arrival may fall before operating hours.
 */
export function arrivalFor(
	start: Instant,
	bookings: Booking[],
	blocks: Block[],
	preheat: Preheat
): { earliest: Instant; latest: Instant | null } {
	let earliest = addMinutes(start, -preheat.maxMin);
	const later = (candidate: Instant) => {
		if (compareInstants(candidate, earliest) > 0) earliest = candidate;
	};
	for (const booking of live(bookings)) {
		const end = bookingEnd(booking);
		if (compareInstants(end, start) > 0) continue;
		later(addMinutes(end, booking.changeoverMin));
	}
	for (const block of blocks) {
		// A block still running at the start (an admin block over an existing booking) counts too.
		const runningAtStart =
			compareInstants(block.start, start) < 0 && compareInstants(block.end, start) > 0;
		if (!runningAtStart && compareInstants(block.end, start) > 0) continue;
		later(block.end);
	}
	// Never after the start: a recorded changeover longer than the current one, or a block still
	// running, would push it past; the guest is then told to come at the start ("Nur 0 Minuten").
	if (compareInstants(earliest, start) > 0) earliest = start;
	const latest = addMinutes(start, -preheat.minMin);
	return { earliest, latest: compareInstants(earliest, latest) >= 0 ? null : latest };
}

/** The notice for a free start time, with the current changeover deciding hot or cold. */
export function freeNotice(start: Instant, bookings: Booking[], blocks: Block[], settings: Settings): Notice {
	if (freeHeat(start, bookings, blocks, settings.changeoverMin) === 'hot') return { ...HOT };
	const preheat = { minMin: settings.preheatMinMin, maxMin: settings.preheatMaxMin };
	return { heat: 'cold', ...arrivalFor(start, bookings, blocks, preheat) };
}

/** The notice for an existing booking: its heat state (AD-8) and the same arrival rule. */
export function bookingNotice(
	booking: Booking,
	bookings: Booking[],
	blocks: Block[],
	preheat: Preheat
): Notice {
	if (bookingHeat(booking, bookings, blocks) === 'hot') return { ...HOT };
	const others = bookings.filter((b) => b !== booking && b.id !== booking.id);
	return { heat: 'cold', ...arrivalFor(booking.start, others, blocks, preheat) };
}

/** The one canonical JSON form: exactly `{"heat":…,"earliest":…,"latest":…}` in that key order. */
export function serializeNotice(notice: Notice): string {
	return JSON.stringify({ heat: notice.heat, earliest: notice.earliest, latest: notice.latest });
}

/** Parses and validates a serialized notice. Throws on anything that is not a valid notice. */
export function parseNotice(json: string): Notice {
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		throw new Error('Notice: not valid JSON');
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Notice: not an object');
	}
	const keys = Object.keys(value);
	if (keys.length !== 3 || !['heat', 'earliest', 'latest'].every((k) => keys.includes(k))) {
		throw new Error('Notice: expected exactly heat, earliest and latest');
	}
	const { heat, earliest, latest } = value as Record<string, unknown>;
	const instantOrNull = (v: unknown): v is Instant | null =>
		v === null || (typeof v === 'string' && isValidInstant(v));
	if (!instantOrNull(earliest) || !instantOrNull(latest)) throw new Error('Notice: invalid instant');
	if (heat === 'hot') {
		if (earliest !== null || latest !== null) throw new Error('Notice: a hot notice has no arrival');
		return { heat, earliest, latest };
	}
	if (heat === 'cold') {
		if (earliest === null) throw new Error('Notice: a cold notice needs an earliest arrival');
		if (latest !== null && compareInstants(earliest, latest) >= 0) {
			throw new Error('Notice: earliest is not before latest (a collapsed window has no latest)');
		}
		return { heat, earliest, latest };
	}
	throw new Error('Notice: invalid heat');
}

/** The only notice comparison in the codebase. */
export function noticeEquals(a: Notice, b: Notice): boolean {
	const same = (x: Instant | null, y: Instant | null) =>
		x === null || y === null ? x === y : compareInstants(x, y) === 0;
	return a.heat === b.heat && same(a.earliest, b.earliest) && same(a.latest, b.latest);
}
