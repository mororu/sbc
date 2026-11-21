// Admin read queries (Epic 3). Unlike the guest queries these may read contact data: the bookings
// by day and the booking detail (Story 3.2) select the name, email, mobile and the keybox code that
// was sent. Only admin routes call them. The call feed and the reply-reminder count carry none.
import { and, asc, count, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import {
	bookingNotice,
	parseNotice,
	type CallFeedEntry,
	type Notice,
	type OutboxKind,
	type OutboxState
} from '#lib/domain/index.ts';
import { addDays, addMinutes, localDate, toInstant, type Instant, type LocalDate, type Locale } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { block, booking, outbox, season, setting } from '../schema.ts';
import { getDayData, type DayData } from './calendar.ts';
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

/** The reply-reminder predicate, shared by the count and the list so they always agree. */
const openReplyReminder = () =>
	and(isNotNull(booking.deletedAt), isNull(booking.replyDoneAt), isNotNull(booking.email), sql`trim(${booking.email}) <> ''`);

/**
 * The open reply reminders (FR-31): deleted bookings with a (non-blank) email address whose reply
 * is not marked done. The one query that reads deleted bookings.
 */
export function countReplyReminders(db: Db = getDb()): number {
	const row = db.select({ n: count() }).from(booking).where(openReplyReminder()).get();
	return row?.n ?? 0;
}

/** One open reply reminder (FR-31, Story 3.4): the deleted booking and how to reach its guest. */
export type ReplyReminderRow = {
	id: number;
	/** Null once erased (the reminder stays while the email is there). */
	name: string | null;
	email: string;
	locale: Locale;
	start: Instant;
	durationMin: number;
};

/**
 * The open reply reminders (same predicate as `countReplyReminders`), oldest deletion first. With
 * `date`, only those whose booking starts on that local day (the admin day view).
 */
export function getReplyReminders(filter: { date?: LocalDate } = {}, db: Db = getDb()): ReplyReminderRow[] {
	const range = filter.date ? dayRange(filter.date) : null;
	const rows = db
		.select({
			id: booking.id,
			name: booking.name,
			email: booking.email,
			locale: booking.locale,
			start: booking.startAt,
			durationMin: booking.durationMin
		})
		.from(booking)
		.where(and(openReplyReminder(), range ? and(gte(booking.startAt, range.from), lt(booking.startAt, range.to)) : undefined))
		.orderBy(asc(booking.deletedAt), asc(booking.id))
		.all();
	// The predicate excludes a NULL email; the filter only narrows the type.
	return rows.flatMap((r) => (r.email === null ? [] : [{ ...r, email: r.email }]));
}

/** A booking's keybox outbox row as the admin pages show it. */
export type AdminKeyboxRow = {
	state: OutboxState;
	dueAt: Instant;
	outcomeAt: Instant | null;
	/** `smtp <code>` or an error code. */
	reason: string | null;
	/** The keybox code the sent email contained (frozen at claim), or null before the claim. */
	snapshotKeyboxCode: string | null;
};

/** An unresolved refused email that is not the call list's (FR-14): a confirmation or a non-urgent heat change. */
export type AdminRefusal = { kind: Exclude<OutboxKind, 'keybox'>; reason: string | null; outcomeAt: Instant | null };

/** One live booking for the admin day view and detail (FR-16). */
export type AdminBooking = {
	id: number;
	start: Instant;
	durationMin: number;
	partySize: number;
	locale: Locale;
	/** Contact data; null once erased. */
	name: string | null;
	email: string | null;
	mobile: string | null;
	/** The notice it has now (`bookingNotice` over its day), or null when it cannot be derived. */
	current: Notice | null;
	/** The notice the guest was last told, or null when unknown or unreadable. */
	lastTold: Notice | null;
	/** The keybox row, or null when there is none. */
	keybox: AdminKeyboxRow | null;
	/** Refused non-urgent emails, oldest first. */
	refusals: AdminRefusal[];
};

/** Live bookings matching `where`, in start order, with their notices, keybox row and refusals. */
function adminBookings(where: SQL | undefined, db: Db): AdminBooking[] {
	const rows = db
		.select({
			id: booking.id,
			start: booking.startAt,
			durationMin: booking.durationMin,
			partySize: booking.partySize,
			locale: booking.locale,
			name: booking.name,
			email: booking.email,
			mobile: booking.mobile,
			lastTold: booking.lastToldNotice
		})
		.from(booking)
		.where(and(isNull(booking.deletedAt), where))
		.orderBy(asc(booking.startAt), asc(booking.id))
		.all();
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const outboxRows = db
		.select({
			bookingId: outbox.bookingId,
			id: outbox.id,
			kind: outbox.kind,
			state: outbox.state,
			dueAt: outbox.dueAt,
			outcomeAt: outbox.outcomeAt,
			reason: outbox.reason,
			code: outbox.snapshotKeyboxCode,
			urgent: outbox.snapshotUrgent,
			resolvedAt: outbox.resolvedAt
		})
		.from(outbox)
		.where(inArray(outbox.bookingId, ids))
		.orderBy(asc(outbox.id))
		.all();
	const days = new Map<LocalDate, DayData>();
	return rows.map(({ lastTold, ...row }) => {
		const date = localDate(row.start);
		let day = days.get(date);
		if (!day) days.set(date, (day = getDayData(date, db)));
		const self = day.bookings.find((b) => b.id === row.id);
		const preheat = { minMin: day.settings.preheatMinMin, maxMin: day.settings.preheatMaxMin };
		const own = outboxRows.filter((r) => r.bookingId === row.id);
		// One keybox row per booking (unique index); the latest wins should that ever change.
		const keybox = own.filter((r) => r.kind === 'keybox').at(-1);
		const refusals = own.flatMap((r): AdminRefusal[] =>
			r.state === 'refused' && r.resolvedAt === null && r.kind !== 'keybox' && !(r.kind === 'heat_change' && r.urgent === true)
				? [{ kind: r.kind, reason: r.reason, outcomeAt: r.outcomeAt }]
				: []
		);
		return {
			...row,
			current: self ? bookingNotice(self, day.bookings, day.blocks, preheat) : null,
			lastTold: noticeOrNull(lastTold),
			keybox: keybox
				? {
						state: keybox.state,
						dueAt: keybox.dueAt,
						outcomeAt: keybox.outcomeAt,
						reason: keybox.reason,
						snapshotKeyboxCode: keybox.code
					}
				: null,
			refusals
		};
	});
}

/** Live bookings starting in [from, to), in start order (the admin day view). */
export function getAdminBookings(from: Instant, to: Instant, db: Db = getDb()): AdminBooking[] {
	return adminBookings(and(gte(booking.startAt, from), lt(booking.startAt, to)), db);
}

/** One live booking by row id, or null for an unknown or deleted one. */
export function getAdminBooking(id: number, db: Db = getDb()): AdminBooking | null {
	return adminBookings(eq(booking.id, id), db)[0] ?? null;
}

/** The local day [00:00, next 00:00) of `date`. */
const dayRange = (date: LocalDate) => ({ from: toInstant(date, 0), to: toInstant(addDays(date, 1), 0) });

/**
 * True when the admin day view has something to show for `date` (a valid date): it lies in a season
 * row (past ones too), a live booking starts or a block runs on it, or a deleted booking starting
 * on it has an open reply reminder. Other deleted bookings do not count.
 */
export function adminDayAccepted(date: LocalDate, db: Db = getDb()): boolean {
	const inSeason = db
		.select({ id: season.id })
		.from(season)
		.where(and(lte(season.startDate, date), gte(season.endDate, date)))
		.get();
	if (inSeason) return true;
	const { from, to } = dayRange(date);
	const live = db
		.select({ id: booking.id })
		.from(booking)
		.where(and(isNull(booking.deletedAt), gte(booking.startAt, from), lt(booking.startAt, to)))
		.get();
	if (live) return true;
	// A deleted booking whose guest still waits for a reply (Story 3.4): its day shows the reminder.
	const reminder = db
		.select({ id: booking.id })
		.from(booking)
		.where(and(openReplyReminder(), gte(booking.startAt, from), lt(booking.startAt, to)))
		.get();
	if (reminder) return true;
	const blocked = db
		.select({ id: block.id })
		.from(block)
		.where(and(lt(block.startAt, to), gt(block.endAt, from)))
		.get();
	return blocked !== undefined;
}

/** Every local date that [from, to) overlaps: from the day of `from` to the day of `to` − 1 s. */
function localDaysOf(from: Instant, to: Instant): LocalDate[] {
	const days: LocalDate[] = [];
	// The day of `to` − 1 s: `to` at local midnight ends on the day before. Instants carry whole seconds.
	const endDay = localDate(to);
	const last = toInstant(endDay, 0) === to ? addDays(endDay, -1) : endDay;
	for (let day = localDate(from); day <= last; day = addDays(day, 1)) days.push(day);
	return days;
}

/**
 * Every future local date that a live booking or a block overlaps: from max(start, `now`) to the day
 * of its end − 1 s, so a booking or block across midnight adds each day. Sorted, without repeats.
 * The admin strip adds them to the season's days, so nothing ahead is out of reach.
 */
export function getAdminStripExtraDates(now: Instant, db: Db = getDb()): LocalDate[] {
	const later = (a: Instant) => (a > now ? a : now);
	const bookings = db
		.select({ start: booking.startAt, durationMin: booking.durationMin })
		.from(booking)
		.where(and(isNull(booking.deletedAt), gt(booking.startAt, now)))
		.all()
		.map((r) => ({ start: r.start, end: addMinutes(r.start, r.durationMin) }));
	const blocks = db
		.select({ start: block.startAt, end: block.endAt })
		.from(block)
		.where(gt(block.endAt, now))
		.all();
	const days = [...bookings, ...blocks].flatMap((r) => localDaysOf(later(r.start), r.end));
	return [...new Set(days)].sort();
}

/** A live booking that has not started, for the admin home's flags. */
export type FlagCandidate = {
	id: number;
	start: Instant;
	durationMin: number;
	name: string | null;
	/** True when it has an unresolved refused non-urgent email (see `AdminRefusal`). */
	refused: boolean;
};

/** Every live booking that has not started at `now`, in start order, with whether it has a refused non-urgent email. */
export function getFutureFlagCandidates(now: Instant, db: Db = getDb()): FlagCandidate[] {
	const rows = db
		.select({ id: booking.id, start: booking.startAt, durationMin: booking.durationMin, name: booking.name })
		.from(booking)
		.where(and(isNull(booking.deletedAt), gt(booking.startAt, now)))
		.orderBy(asc(booking.startAt), asc(booking.id))
		.all();
	const refused = new Set(
		db
			.select({ bookingId: outbox.bookingId })
			.from(outbox)
			.innerJoin(booking, eq(booking.id, outbox.bookingId))
			.where(
				and(
					isNull(booking.deletedAt),
					gt(booking.startAt, now),
					eq(outbox.state, 'refused'),
					isNull(outbox.resolvedAt),
					or(
						eq(outbox.kind, 'confirmation'),
						and(eq(outbox.kind, 'heat_change'), or(isNull(outbox.snapshotUrgent), eq(outbox.snapshotUrgent, false)))
					)
				)
			)
			.all()
			.map((r) => r.bookingId)
	);
	return rows.map((r) => ({ ...r, refused: refused.has(r.id) }));
}
