// Notice copy: the heat notice sentences of a free start time (`offerNoticeText`, used by the day
// rows and the booking form; `coldNoticeText`, also used by the confirmation badge for its cold
// fallbacks), plus `durationLimit` and `sentence`, which the day rows use for their duration limit
// and screen-reader text. Formatted on the server, so client code never needs src/lib/time.
import { DURATIONS, type Duration, type HeatState, type Notice } from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { compareInstants, formatTime, minutesBetween, type Instant, type Locale } from '#lib/time/index.ts';

/** "Nur 60 Min." for one duration, "Bis 90 Min." for a shorter prefix, null for all of them. */
export function durationLimit(durations: Duration[], locale: Locale): string | null {
	if (durations.length === 1) return m.duration_only({ minutes: durations[0] }, { locale });
	if (durations.length < DURATIONS.length) {
		return m.duration_up_to({ minutes: Math.max(...durations) }, { locale });
	}
	return null;
}

/** Screen-reader text reads the parts as sentences: "Up to 90 min" becomes "Up to 90 min." */
export function sentence(text: string | null): string | null {
	if (!text) return null;
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The cold-start notice text. "Already past" and "too little time" are derived here from the
 * notice, the start and `now`; they are never part of the notice itself. Neither is an error:
 * the time stays bookable.
 */
export function coldNoticeText(notice: Notice, start: Instant, now: Instant, locale: Locale): string {
	const earliest = notice.earliest;
	if (earliest === null) throw new Error('A cold notice without an earliest arrival');
	const lastArrival = notice.latest ?? earliest;
	if (compareInstants(now, lastArrival) > 0) return m.cold_notice_past({}, { locale });
	if (notice.latest === null) {
		const minutes = Math.floor(minutesBetween(earliest, start));
		return m.cold_notice_short({ minutes, time: formatTime(earliest) }, { locale });
	}
	return m.cold_notice({ earliest: formatTime(earliest), latest: formatTime(notice.latest) }, { locale });
}

/** The heat notice of a free start time, as the row and the booking form show it. */
export function offerNoticeText(
	offer: { start: Instant; heat: HeatState; notice: Notice },
	now: Instant,
	locale: Locale
): string {
	return offer.heat === 'hot'
		? m.hot_notice({ time: formatTime(offer.start) }, { locale })
		: coldNoticeText(offer.notice, offer.start, now, locale);
}
