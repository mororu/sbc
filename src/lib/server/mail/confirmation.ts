// The confirmation email (FR-7; Story 2.1). Pure: rendered only from the frozen snapshot (the notice
// at booking and the locale), the immutable booking facts and the admin contact read at send time,
// and the claim instant. "Past the keybox cutoff" is judged at booking and at the claim. The claim
// time is overwritten on every re-claim, so a retry claimed after the cutoff renders "the code
// follows right away" even though the first attempt named the cutoff time: by then that is true.
import { isPastKeyboxCutoff, keyboxCutoff, parseNotice } from '#lib/domain/index.ts';
import { mailtoHref } from '#lib/mailto.ts';
import { m } from '#lib/paraglide/messages.js';
import { addMinutes, formatDateShort, formatTime, localDate, type Instant, type Locale } from '#lib/time/index.ts';
import { badgeText } from '../booked-view.ts';
import { renderEmail, type Block, type RenderedEmail } from './layout.ts';

export type ConfirmationInput = {
	snapshot: {
		/** Canonical Notice JSON; null for a booking made before notices were stored. */
		notice: string | null;
		locale: Locale;
	};
	booking: {
		start: Instant;
		durationMin: number;
		partySize: number;
		createdAt: Instant;
		/** The admin contact address, or null: then the cancel line is left out. */
		adminContact: string | null;
	};
	claimedAt: Instant;
};

const MARKER = '\u0000';

export function renderConfirmation(input: ConfirmationInput): RenderedEmail {
	const { locale } = input.snapshot;
	const { start, durationMin, partySize, createdAt, adminContact } = input.booking;
	const date = formatDateShort(localDate(start), locale);
	const time = formatTime(start);

	const blocks: Block[] = [
		{ type: 'heading', text: m.booked_heading({}, { locale }) },
		{
			type: 'details',
			items: [
				{ term: m.mail_detail_date({}, { locale }), value: date },
				{ term: m.mail_detail_start({}, { locale }), value: time },
				{
					term: m.mail_detail_duration({}, { locale }),
					value: m.duration_option({ minutes: durationMin, time: formatTime(addMinutes(start, durationMin)) }, { locale })
				},
				{ term: m.mail_detail_people({}, { locale }), value: m.booked_people({ count: partySize }, { locale }) }
			]
		}
	];

	if (input.snapshot.notice !== null) {
		const notice = badgeText(parseNotice(input.snapshot.notice), start, createdAt, locale);
		blocks.push({ type: 'paragraph', content: [`${notice} ${m.mail_notice_may_change({}, { locale })}`] });
	}

	const pastCutoff = isPastKeyboxCutoff(start, createdAt) || isPastKeyboxCutoff(start, input.claimedAt);
	if (pastCutoff) {
		blocks.push({ type: 'paragraph', content: [m.mail_keybox_now({}, { locale })] });
	} else {
		const cutoff = keyboxCutoff(start);
		const at = m.booked_keybox_at({ date: formatDateShort(localDate(cutoff), locale), time: formatTime(cutoff) }, { locale });
		blocks.push({ type: 'paragraph', content: [m.mail_keybox({ at }, { locale })] });
	}

	if (adminContact !== null) {
		const [before, after = ''] = m.booked_cancel({ address: MARKER }, { locale }).split(MARKER);
		blocks.push({
			type: 'paragraph',
			content: [`${m.booked_cancel_term({}, { locale })}: ${before}`, { text: adminContact, href: mailtoHref(adminContact) }, after]
		});
	}

	return renderEmail({
		locale,
		subject: m.mail_confirmation_subject({ date, time }, { locale }),
		blocks
	});
}
