// Booking read queries (AD-2). The confirmation selects only what the guest page needs: never
// the guest's contact columns, row ids or the submit token.
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Instant, LocalDate } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, season } from '../schema.ts';
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
