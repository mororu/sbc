// The impact mini row (EXPERIENCE "Impact dialog", "Heat-change line"; Story 3.3): an `Impact` as the
// dialog shows it. "Tom, 17:15:" · "heiss → Kaltstart" (hidden "wird zu") · the consequence
// ("bekommt eine Mail." / "weniger als 24 h." with *Anruf nötig* or "optional" / "Kein Effekt auf
// andere Buchungen.") · "Neuer Hinweis: …". Deleting a booking uses it now; block and pre-heat
// dialogs (3.5, 3.7) reuse it. Every string is formatted here on the server.
import type { HeatState, Impact, ImpactConsequence, Notice } from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { compareInstants, formatTime, formatWeekdayShort, localDate, type Instant, type LocalDate, type Locale } from '#lib/time/index.ts';
import { coldNoticeText } from './notice-text.ts';

/** One side of the heat-change line: the state icon and its label. */
export type HeatChangeSide = { heat: HeatState; label: string };

/** The heat-change line: told → current, with the hidden word for the arrow. */
export type HeatChangeLineView = { from: HeatChangeSide; to: HeatChangeSide; becomes: string };

export type ImpactRowView = {
	/** `none`, `mail` or `call`: which consequence the row shows. */
	consequence: ImpactConsequence;
	/** "Tom, 17:15:" ("Tom, Sa 18:30:" on another date, "17:15:" without a name); null for `none`. */
	who: string | null;
	line: HeatChangeLineView | null;
	/** "bekommt eine Mail." · "weniger als 24 h." · "Kein Effekt auf andere Buchungen." */
	text: string;
	/** The call-list marker for `call`: "Anruf nötig" (urgent) or "optional" (good news). */
	marker: { text: string; urgent: boolean } | null;
	/** "Neuer Hinweis: komm zwischen 16:35 und 16:45."; null for `none` (or a notice that cannot be worded). */
	notice: string | null;
};

export type ImpactRowContext = {
	now: Instant;
	locale: Locale;
	/** The affected guest's first name, or null. */
	firstName: string | null;
	/** The date of the changed item: the weekday is added when the affected booking is on another one. */
	date: LocalDate;
};

const side = (heat: HeatState, locale: Locale): HeatChangeSide => ({
	heat,
	label: heat === 'hot' ? m.impact_heat_hot({}, { locale }) : m.impact_heat_cold({}, { locale })
});

/** Pure: told heat → current heat; cold → cold reads "Kaltstart → neue Ankunftszeit". */
export function heatChangeLine(told: Notice, current: Notice, locale: Locale): HeatChangeLineView {
	const to =
		told.heat === 'cold' && current.heat === 'cold'
			? { heat: 'cold' as const, label: m.impact_heat_new_arrival({}, { locale }) }
			: side(current.heat, locale);
	return { from: side(told.heat, locale), to, becomes: m.impact_becomes({}, { locale }) };
}

/**
 * Pure: "Neuer Hinweis: …" for a notice at `start`, judged at `now`. Never throws: a cold notice
 * without an earliest arrival (not a valid notice) gives null, and the row omits the line.
 */
export function newNoticeText(notice: Notice, start: Instant, now: Instant, locale: Locale): string | null {
	if (notice.heat === 'hot') return m.impact_new_notice_hot({ time: formatTime(start) }, { locale });
	const { earliest, latest } = notice;
	if (earliest === null) return null;
	if (latest !== null && compareInstants(now, latest) <= 0) {
		return m.impact_new_notice_cold({ earliest: formatTime(earliest), latest: formatTime(latest) }, { locale });
	}
	return m.impact_new_notice_other({ notice: coldNoticeText(notice, start, now, locale) }, { locale });
}

/** Pure: the mini row of `impact`. */
export function buildImpactRow(impact: Impact, context: ImpactRowContext): ImpactRowView {
	const { locale, now } = context;
	const { affected, told, current } = impact;
	if (impact.consequence === 'none' || !affected || !told || !current) {
		return { consequence: 'none', who: null, line: null, text: m.impact_none({}, { locale }), marker: null, notice: null };
	}
	const day = localDate(affected.start);
	const time = day === context.date ? formatTime(affected.start) : `${formatWeekdayShort(day, locale)} ${formatTime(affected.start)}`;
	const who = context.firstName
		? m.impact_who({ name: context.firstName, time }, { locale })
		: m.impact_who_no_name({ time }, { locale });
	const call = impact.consequence === 'call';
	const urgent = impact.class === 'urgent';
	return {
		consequence: impact.consequence,
		who,
		line: heatChangeLine(told, current, locale),
		text: call ? m.impact_call({}, { locale }) : m.impact_mail({}, { locale }),
		marker: call
			? { text: urgent ? m.call_marker_required({}, { locale }) : m.call_marker_optional({}, { locale }), urgent }
			: null,
		notice: newNoticeText(current, affected.start, now, locale)
	};
}
