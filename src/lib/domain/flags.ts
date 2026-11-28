// Derived booking flags (FR-20; Stories 3.2, 3.8). A booking made under older seasons or operating
// hours stays valid when an admin shortens them; the admin pages flag it instead. Never stored:
// always derived from the booking and the settings as they are now.
// Pure: every input is a parameter. The caller decides which bookings count (only those that have
// not started).
import { addMinutes, compareDates, compareInstants, localDate, toInstant, type Instant } from '#lib/time/index.ts';
import type { Settings } from './heat.ts';
import type { Season } from './start-times.ts';

/** Why a booking no longer fits the current times: its date lies in no season, or it lies outside the hours. */
export type OutsideReason = 'season' | 'hours';

/**
 * Why a booking no longer fits the current times, or null when it fits:
 * - `season`: its local date lies in no season row (checked first, so a booking outside both counts here);
 * - `hours`: it starts before the opening time or ends after the closing time of that day.
 */
export function outsideReason(
	booking: { start: Instant; durationMin: number },
	seasons: Season[],
	settings: Pick<Settings, 'openMinute' | 'closeMinute'>
): OutsideReason | null {
	const date = localDate(booking.start);
	const inSeason = seasons.some((s) => compareDates(s.startDate, date) <= 0 && compareDates(date, s.endDate) <= 0);
	if (!inSeason) return 'season';
	const open = toInstant(date, settings.openMinute);
	const close = toInstant(date, settings.closeMinute);
	const end = addMinutes(booking.start, booking.durationMin);
	return compareInstants(booking.start, open) < 0 || compareInstants(end, close) > 0 ? 'hours' : null;
}

/** True when a booking no longer fits the current times, for either reason (`outsideReason` ≠ null). */
export function outsideCurrentTimes(
	booking: { start: Instant; durationMin: number },
	seasons: Season[],
	settings: Pick<Settings, 'openMinute' | 'closeMinute'>
): boolean {
	return outsideReason(booking, seasons, settings) !== null;
}
