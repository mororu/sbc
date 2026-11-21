// The keybox email (FR-8; Story 2.2). Pure: rendered from the frozen snapshot (the current notice
// at claim, the code and the locale), the start time, the instructions in the booking's locale and
// the admin contact, both read at send time (there is no snapshot column for them), and the claim
// instant. The code comes first, as real text with spaced characters, then the date and start, the
// notice that counts, the instructions and the cancel line. "Past" in the notice is judged at the claim.
import { parseNotice } from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { formatDateShort, formatTime, localDate, type Instant, type Locale } from '#lib/time/index.ts';
import { badgeText } from '../notice-text.ts';
import { cancelBlock, whenItems } from './blocks.ts';
import { renderEmail, type Block, type RenderedEmail } from './layout.ts';

export type KeyboxInput = {
	snapshot: {
		/** Canonical Notice JSON: the notice at claim, the one that counts. */
		notice: string | null;
		/** The code frozen at claim. */
		keyboxCode: string | null;
		locale: Locale;
	};
	booking: {
		start: Instant;
		/** The access and return instructions in the booking's locale, read at send time. */
		instructions: string | null;
		/** The admin contact address, or null: then the cancel line is left out. */
		adminContact: string | null;
	};
	claimedAt: Instant;
};

/** A coded error the worker records as `render_error`: never names the setting's value. */
const missingSetting = () => Object.assign(new Error('A keybox setting is missing'), { code: 'MISSING_SETTING' });

/** "4711" → "4 7 1 1": every character on its own, so it reads (and is read out) one by one. */
export function spacedCode(code: string): string {
	return [...code.replace(/\s+/g, '')].join(' ');
}

/** The instructions as paragraphs: blocks separated by a blank line. */
function paragraphs(instructions: string): Block[] {
	return instructions
		.split(/\n\s*\n/)
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.map((part) => ({ type: 'paragraph', content: [part] }));
}

export function renderKeybox(input: KeyboxInput): RenderedEmail {
	const { locale, keyboxCode } = input.snapshot;
	const { start } = input.booking;
	const code = keyboxCode?.trim();
	const instructions = input.booking.instructions?.trim();
	if (!code || !instructions) throw missingSetting();
	const date = formatDateShort(localDate(start), locale);
	const time = formatTime(start);

	const blocks: Block[] = [
		{ type: 'heading', text: m.mail_keybox_code({ code: spacedCode(code) }, { locale }) },
		{ type: 'details', items: whenItems(start, locale) }
	];
	if (input.snapshot.notice !== null) {
		// The marker is its own line, so it never runs into the "Kaltstart:" of the notice.
		const notice = badgeText(parseNotice(input.snapshot.notice), start, input.claimedAt, locale);
		blocks.push({ type: 'paragraph', content: [`${m.mail_keybox_counts({}, { locale })}\n${notice}`] });
	}
	blocks.push({ type: 'heading', text: m.mail_keybox_instructions_heading({}, { locale }) }, ...paragraphs(instructions));
	const cancel = cancelBlock(input.booking.adminContact, locale);
	if (cancel) blocks.push(cancel);

	return renderEmail({ locale, subject: m.mail_keybox_subject({ date, time }, { locale }), blocks });
}
