// Booking read queries (AD-2). The confirmation selects only what the guest page needs: never
// the guest's contact columns, row ids or the submit token.
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { bookingNotice, parseNotice, serializeNotice, type Notice, type OutboxState } from '#lib/domain/index.ts';
import { localDate, type Instant, type LocalDate } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, outbox, season } from '../schema.ts';
import { getDayData } from './calendar.ts';
import { getAdminContact } from './setting.ts';

export type Confirmation = {
	start: Instant;
	durationMin: number;
	partySize: number;
	/** When the booking was made: the badge shows the notice as it stood then. */
	createdAt: Instant;
	/** The notice at booking as stored (canonical JSON), or null for a row made before Story 1.8. */
	noticeAtBooking: string | null;
	/** The admin contact address guests write to, or null when none is set. */
	adminContact: string | null;
};

/** The confirmation of a live booking, or null for an unknown or deleted one. */
export function getConfirmation(publicId: string, db: Db = getDb()): Confirmation | null {
	const row = db
		.select({
			start: booking.startAt,
			durationMin: booking.durationMin,
			partySize: booking.partySize,
			createdAt: booking.createdAt,
			noticeAtBooking: booking.noticeAtBooking,
			deletedAt: booking.deletedAt
		})
		.from(booking)
		.where(eq(booking.publicId, publicId))
		.get();
	if (!row || row.deletedAt) return null;
	return {
		start: row.start,
		durationMin: row.durationMin,
		partySize: row.partySize,
		createdAt: row.createdAt,
		noticeAtBooking: row.noticeAtBooking,
		// Read like the footer: trimmed, the one settings row, blank as none.
		adminContact: getAdminContact(db)
	};
}

/** The booking a submit token made, or null. Used by the book command. */
export function bookingByToken(
	submitToken: string,
	db: Db = getDb()
): { publicId: string; deleted: boolean; noticeAtBooking: string | null } | null {
	const row = db
		.select({ publicId: booking.publicId, deletedAt: booking.deletedAt, noticeAtBooking: booking.noticeAtBooking })
		.from(booking)
		.where(eq(booking.submitToken, submitToken))
		.get();
	return row
		? { publicId: row.publicId, deleted: row.deletedAt !== null, noticeAtBooking: row.noticeAtBooking }
		: null;
}

/** The id of the season that contains `date`, or null. Seasons never overlap. */
export function seasonIdFor(date: LocalDate, db: Db = getDb()): number | null {
	const row = db
		.select({ id: season.id })
		.from(season)
		.where(and(lte(season.startDate, date), gte(season.endDate, date)))
		.get();
	return row?.id ?? null;
}

/**
 * The notice a live booking has now (AD-24), as canonical JSON: `bookingNotice` over the day's live
 * bookings and blocks, with the recorded changeovers and the current pre-heat window. Null for an
 * unknown or deleted booking.
 */
export function currentNotice(bookingId: number, db: Db = getDb()): string | null {
	const row = db
		.select({ start: booking.startAt, deletedAt: booking.deletedAt })
		.from(booking)
		.where(eq(booking.id, bookingId))
		.get();
	if (!row || row.deletedAt) return null;
	const { settings, bookings, blocks } = getDayData(localDate(row.start), db);
	const self = bookings.find((b) => b.id === bookingId);
	if (!self) return null;
	const preheat = { minMin: settings.preheatMinMin, maxMin: settings.preheatMaxMin };
	return serializeNotice(bookingNotice(self, bookings, blocks, preheat));
}

/** A stored notice, or null when it is missing or not a valid notice. */
function parsedOrNull(json: string | null): Notice | null {
	if (json === null) return null;
	try {
		return parseNotice(json);
	} catch {
		return null;
	}
}

/**
 * What the guest of a booking has been, or is about to be, told (Stories 2.3, 3.3): the snapshot of
 * its in-flight heat-change email, else its last-told notice. Null when that is missing or not a
 * valid notice, or for an unknown booking. The heat-change helper and the impact preview both use it.
 */
export function toldNotice(bookingId: number, db: Db = getDb()): Notice | null {
	// An in-flight heat-change email is what the guest is about to be told: compare against it, so a
	// change back to the last-told notice during the send still gets its own email.
	const inFlight = db
		.select({ notice: outbox.snapshotNotice })
		.from(outbox)
		.where(and(eq(outbox.bookingId, bookingId), eq(outbox.kind, 'heat_change'), eq(outbox.state, 'in_flight')))
		.orderBy(desc(outbox.id))
		.get();
	if (inFlight) return parsedOrNull(inFlight.notice);
	const row = db.select({ lastTold: booking.lastToldNotice }).from(booking).where(eq(booking.id, bookingId)).get();
	return parsedOrNull(row?.lastTold ?? null);
}

/** The state of a booking's keybox row, or null when it has none. */
export function keyboxStateOf(bookingId: number, db: Db = getDb()): OutboxState | null {
	const row = db
		.select({ state: outbox.state })
		.from(outbox)
		.where(and(eq(outbox.bookingId, bookingId), eq(outbox.kind, 'keybox')))
		.get();
	return row?.state ?? null;
}
