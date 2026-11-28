// The reply reminders (FR-31; EXPERIENCE "Reply reminder"; Story 3.4): their view model, for the
// admin home and the admin day view. The reminder's line is in the admin's locale; the prepared
// reply (the `mailto:` subject and body, and the text "Text kopieren" copies) is in the booking's
// stored locale (AD-14). Every string is formatted here on the server (src/lib/time stays off the
// client). Read-only: only the mark-reply-done command writes `reply_done_at`.
import { mailtoHref } from '#lib/mailto.ts';
import { m } from '#lib/paraglide/messages.js';
import {
	countReplyReminders,
	firstName,
	getReplyReminders,
	type ReplyReminderRow
} from '#lib/server/db/queries/index.ts';
import { addMinutes, formatDateShort, formatTime, localDate, type LocalDate, type Locale } from '#lib/time/index.ts';
import { displayName } from './display-name.ts';

type Db = Parameters<typeof getReplyReminders>[1];

/** One open reply reminder as the admin pages show it. */
export type ReplyReminderView = {
	id: number;
	/** The guest's name, the `h3` ("(ohne Name)" once erased or blank). */
	name: string;
	/** "Di 12. Januar, 16:00–17:00 · gelöscht", in the admin's locale. */
	when: string;
	/** The address, shown as the link text. */
	email: string;
	/** `mailto:` with subject and body prefilled in the booking's locale. */
	href: string;
	/** What "Text kopieren" copies: address, subject, a blank line, the body. */
	copyText: string;
};

/** The reply reminders of a page: the section heading, the count of all open ones and the list. */
export type RepliesView = {
	/** "Antworten" */
	heading: string;
	/** Every open reminder (the nav badge's count, the same predicate); the home's badge and the status after "Erledigt". */
	count: number;
	/** "Keine offenen Antworten." when the list is empty. */
	empty: string;
	items: ReplyReminderView[];
};

/** Pure: the prepared reply in the booking's locale: subject and body lines. */
export function replyMessage(reminder: ReplyReminderRow): { subject: string; body: string[] } {
	const locale = reminder.locale;
	const first = firstName(reminder.name);
	const greeting = first
		? m.admin_reply_greeting({ name: first }, { locale })
		: m.admin_reply_greeting_no_name({}, { locale });
	const sentence = m.admin_reply_body(
		{ date: formatDateShort(localDate(reminder.start), locale), time: formatTime(reminder.start) },
		{ locale }
	);
	return {
		subject: m.admin_reply_subject({}, { locale }),
		body: [greeting, '', sentence, '', m.brand({}, { locale })]
	};
}

/** Pure: one reminder; `locale` is the admin's. */
export function buildReplyReminder(reminder: ReplyReminderRow, locale: Locale): ReplyReminderView {
	const { subject, body } = replyMessage(reminder);
	const end = addMinutes(reminder.start, reminder.durationMin);
	const name = displayName(reminder.name, locale);
	return {
		id: reminder.id,
		name,
		when: m.admin_reply_when(
			{
				date: formatDateShort(localDate(reminder.start), locale),
				time: `${formatTime(reminder.start)}–${formatTime(end)}`
			},
			{ locale }
		),
		email: reminder.email,
		href: mailtoHref(reminder.email, { subject, body }),
		copyText: [reminder.email, subject, '', ...body].join('\n')
	};
}

/** Pure: the replies of a page. `count` is the number of every open reminder (`countReplyReminders`). */
export function buildReplies(reminders: ReplyReminderRow[], count: number, locale: Locale): RepliesView {
	return {
		heading: m.admin_replies_heading({}, { locale }),
		count,
		empty: m.admin_replies_empty({}, { locale }),
		items: reminders.map((r) => buildReplyReminder(r, locale))
	};
}

/**
 * The reply reminders, all of them or (`date`) those whose booking starts that day. Unfiltered, the
 * count is the list's length (one read, so they cannot disagree); for a day it is every open
 * reminder (`countReplyReminders`, the nav badge's predicate) for the status line.
 */
export function loadReplies(locale: Locale, filter: { date?: LocalDate } = {}, db?: Db): RepliesView {
	const reminders = getReplyReminders(filter, db);
	const count = filter.date === undefined ? reminders.length : countReplyReminders(db);
	return buildReplies(reminders, count, locale);
}
