// Guest URLs: the links the view models carry, the URL time `hhmm`, and the refusal query a day
// shows (`?error=conflict|past&time=hhmm`). No URL ever carries guest data.
import type { ResolvedPathname } from '$app/types';
import { m } from '#lib/paraglide/messages.js';
import { formatTime, type Instant, type LocalDate, type Locale } from '#lib/time/index.ts';

// Links in the view model are root-relative. `resolve()` from `$app/paths` would return paths
// relative to the request URL during SSR, and a load fetched as `/day/x/__data.json` would get
// `../../day/…`. The app has no base path, so the root-relative path is the resolved pathname.
export const HOME_HREF = '/' as ResolvedPathname;

/** The link to a day: `/day/{date}`. */
export function dayHref(date: LocalDate): ResolvedPathname {
	return `/day/${date}` as ResolvedPathname;
}

/** `/book/{date}/{hhmm}` for a start instant. */
export function bookHref(date: LocalDate, start: Instant): ResolvedPathname {
	return `/book/${date}/${formatTime(start).replace(':', '')}` as ResolvedPathname;
}

/** A URL time `hhmm` ("1800") as its clock text and minute of the day, or null. */
export function parseHhmm(hhmm: string | null): { clock: string; minute: number } | null {
	const match = /^([01]\d|2[0-3])([0-5]\d)$/.exec(hhmm ?? '');
	if (!match) return null;
	return { clock: `${match[1]}:${match[2]}`, minute: Number(match[1]) * 60 + Number(match[2]) };
}

/** The refusals the book form sends back to the day (FR-6). */
export const DAY_ERRORS = ['conflict', 'past'] as const;
export type DayError = (typeof DAY_ERRORS)[number];

/** True for a valid refusal query: `?error=conflict|past&time=hhmm`. */
function isDayErrorQuery(error: string | null, time: string | null): error is DayError {
	return parseHhmm(time) !== null && (DAY_ERRORS as readonly (string | null)[]).includes(error);
}

/** The day's error message for `?error=…&time=hhmm`, or null for anything else. No guest data. */
export function dayError(error: string | null, time: string | null, locale: Locale): { text: string } | null {
	const parsed = parseHhmm(time);
	if (!parsed || !isDayErrorQuery(error, time)) return null;
	const clock = parsed.clock;
	return {
		text:
			error === 'conflict'
				? m.error_conflict({ time: clock }, { locale })
				: m.error_past({ time: clock }, { locale })
	};
}

/** Where a refused booking goes: the refreshed day with the message (no guest data). */
export function dayErrorHref(date: LocalDate, hhmm: string, code: DayError): string {
	return `/day/${date}?error=${code}&time=${hhmm}`;
}

/**
 * Where a booking goes: its confirmation with the one-time flags `?new=1` and, when the notice
 * changed since the form loaded, `&changed=1`. The flags are no guest data, only how it was reached.
 */
export function bookedHref(publicId: string, changed: boolean): string {
	return `/booked/${publicId}?new=1${changed ? '&changed=1' : ''}`;
}
