// The heat-change email (FR-9; Story 2.3). Pure: rendered only from the frozen snapshot (the current
// notice and the last-told notice at claim, and the locale), the start time, the
// admin contact read at send time, and the claim instant. The variant comes from the direction of
// the change: good news (cold → hot), now cold (hot → cold), a later earliest arrival or an earlier
// latest arrival. The lead line and the arrival sentence come first, then the date and start, then
// the cancel line. A collapsed range, or an arrival already past at the claim, uses the day-view
// cold notice wording, so the guest reads the same message as on the site.
import { heatChangeDirection, parseNotice, type HeatChangeDirection, type Notice } from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { compareInstants, formatDateShort, formatTime, localDate, type Instant, type Locale } from '#lib/time/index.ts';
import { coldNoticeText } from '../notice-text.ts';
import { cancelBlock, whenItems } from './blocks.ts';
import { renderEmail, type Block, type RenderedEmail } from './layout.ts';

export type HeatChangeInput = {
	snapshot: {
		/** Canonical Notice JSON: the current notice at claim. */
		notice: string | null;
		/** Canonical Notice JSON: the notice the guest was last told, frozen at claim. */
		lastTold: string | null;
		locale: Locale;
	};
	booking: {
		start: Instant;
		/** The admin contact address, or null: then the cancel line is left out. */
		adminContact: string | null;
	};
	claimedAt: Instant;
};

/** A coded error the worker records as `render_error`. */
const noChange = () => Object.assign(new Error('No heat change to render'), { code: 'NO_HEAT_CHANGE' });

/** "Komm zwischen 17:50 und 18:00 und heiz ein.", or the cold notice text for a collapsed or past arrival. */
function arrivalSentence(notice: Notice, start: Instant, claimedAt: Instant, locale: Locale): string {
	const { earliest, latest } = notice;
	if (earliest === null) throw noChange();
	if (latest !== null && compareInstants(claimedAt, latest) <= 0) {
		return m.mail_heat_arrival({ earliest: formatTime(earliest), latest: formatTime(latest) }, { locale });
	}
	return coldNoticeText(notice, start, claimedAt, locale);
}

/** True when the last time to arrive is already past at the claim: the body then says "come as soon as you can". */
function arrivalPast(notice: Notice, claimedAt: Instant): boolean {
	const last = notice.latest ?? notice.earliest;
	return last !== null && compareInstants(claimedAt, last) > 0;
}

function subjectFor(
	direction: Exclude<HeatChangeDirection, 'none'>,
	notice: Notice,
	claimedAt: Instant,
	date: string,
	time: string,
	locale: Locale
): string {
	switch (direction) {
		case 'now_hot':
			return m.mail_heat_good_subject({ date, time }, { locale });
		case 'now_cold': {
			if (notice.earliest === null) throw noChange();
			// No arrival time in the subject once it has passed, so the subject and the body agree.
			if (arrivalPast(notice, claimedAt)) return m.mail_heat_cold_past_subject({ date, time }, { locale });
			const earliest = formatTime(notice.earliest);
			return notice.latest === null
				? m.mail_heat_cold_short_subject({ date, time, earliest }, { locale })
				: m.mail_heat_cold_subject({ date, time, earliest, latest: formatTime(notice.latest) }, { locale });
		}
		case 'later_earliest':
		case 'earlier_latest':
			return m.mail_heat_arrival_subject({ date, time }, { locale });
	}
}

const LEADS = {
	now_cold: m.mail_heat_now_cold,
	later_earliest: m.mail_heat_later_earliest,
	earlier_latest: m.mail_heat_longer_preheat
} as const;

export function renderHeatChange(input: HeatChangeInput): RenderedEmail {
	const { locale } = input.snapshot;
	const { start, adminContact } = input.booking;
	if (input.snapshot.notice === null || input.snapshot.lastTold === null) throw noChange();
	const notice = parseNotice(input.snapshot.notice);
	const direction = heatChangeDirection(parseNotice(input.snapshot.lastTold), notice);
	if (direction === 'none') throw noChange();
	const date = formatDateShort(localDate(start), locale);
	const time = formatTime(start);

	const message =
		direction === 'now_hot'
			? m.mail_heat_good_body({ date, time }, { locale })
			: `${LEADS[direction]({}, { locale })} ${arrivalSentence(notice, start, input.claimedAt, locale)}`;
	const blocks: Block[] = [
		{ type: 'paragraph', content: [message] },
		{ type: 'details', items: whenItems(start, locale) }
	];
	const cancel = cancelBlock(adminContact, locale);
	if (cancel) blocks.push(cancel);

	return renderEmail({ locale, subject: subjectFor(direction, notice, input.claimedAt, date, time, locale), blocks });
}
