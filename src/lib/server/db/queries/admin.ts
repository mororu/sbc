// Admin read queries (Epic 3). Unlike the guest queries these may read contact data, but the ones
// here select none: the call feed and the reply-reminder count carry no name, email or mobile.
import { and, count, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { bookingNotice, parseNotice, type CallFeedEntry, type Notice } from '#lib/domain/index.ts';
import { localDate, type Instant } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, setting } from '../schema.ts';
import { getDayData } from './calendar.ts';
import { getSendProblemRows } from './outbox.ts';

/** The stored admin password hash, or null when none is set. For the sign-in command only. */
export function getAdminPasswordHash(db: Db = getDb()): string | null {
	const row = db.select({ hash: setting.adminPasswordHash }).from(setting).where(eq(setting.id, 1)).get();
	return row?.hash ?? null;
}

const noticeOrNull = (json: string | null): Notice | null => {
	if (json === null) return null;
	try {
		return parseNotice(json);
	} catch {
		return null;
	}
};

/**
 * The call-list feed at `now` (AD-21), by booking id, for `deriveCallList`: every live booking that
 * has not started, with its outbox rows (`getSendProblemRows`), its last-told notice and the notice
 * it has now (`bookingNotice` over its day, read once per day). No contact data, no keybox code.
 */
export function getCallFeed(now: Instant, db: Db = getDb()): Map<number, CallFeedEntry> {
	const problems = getSendProblemRows(now, db);
	const live = db
		.select({ id: booking.id, start: booking.startAt, createdAt: booking.createdAt, lastTold: booking.lastToldNotice })
		.from(booking)
		.where(and(isNull(booking.deletedAt), gt(booking.startAt, now)))
		.orderBy(booking.startAt, booking.id)
		.all();
	const days = new Map<string, ReturnType<typeof getDayData>>();
	const feed = new Map<number, CallFeedEntry>();
	for (const row of live) {
		const date = localDate(row.start);
		let day = days.get(date);
		if (!day) days.set(date, (day = getDayData(date, db)));
		const { settings, bookings, blocks } = day;
		const self = bookings.find((b) => b.id === row.id);
		const preheat = { minMin: settings.preheatMinMin, maxMin: settings.preheatMaxMin };
		const sendEntry = problems.get(row.id) ?? {
			start: row.start,
			createdAt: row.createdAt,
			preheatMaxMin: settings.preheatMaxMin,
			rows: []
		};
		feed.set(row.id, {
			...sendEntry,
			lastTold: noticeOrNull(row.lastTold),
			current: self ? bookingNotice(self, bookings, blocks, preheat) : null
		});
	}
	return feed;
}

/**
 * The open reply reminders (FR-31): deleted bookings with an email address whose reply is not
 * marked done. The one query that reads deleted bookings.
 */
export function countReplyReminders(db: Db = getDb()): number {
	const row = db
		.select({ n: count() })
		.from(booking)
		.where(and(isNotNull(booking.deletedAt), isNull(booking.replyDoneAt), isNotNull(booking.email)))
		.get();
	return row?.n ?? 0;
}
