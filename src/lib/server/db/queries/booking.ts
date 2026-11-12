// Booking read queries (AD-2). The confirmation selects only what the guest page shows: never
// contact columns, row ids or the submit token.
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Instant, LocalDate } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, season } from '../schema.ts';

export type Confirmation = { start: Instant; durationMin: number; partySize: number };

/** The minimal confirmation of a live booking, or null for an unknown or deleted one. */
export function getConfirmation(publicId: string, db: Db = getDb()): Confirmation | null {
	const row = db
		.select({
			start: booking.startAt,
			durationMin: booking.durationMin,
			partySize: booking.partySize,
			deletedAt: booking.deletedAt
		})
		.from(booking)
		.where(eq(booking.publicId, publicId))
		.get();
	if (!row || row.deletedAt) return null;
	return { start: row.start, durationMin: row.durationMin, partySize: row.partySize };
}

/** The booking a submit token made, or null. Used by the book command. */
export function bookingByToken(
	submitToken: string,
	db: Db = getDb()
): { publicId: string; deleted: boolean } | null {
	const row = db
		.select({ publicId: booking.publicId, deletedAt: booking.deletedAt })
		.from(booking)
		.where(eq(booking.submitToken, submitToken))
		.get();
	return row ? { publicId: row.publicId, deleted: row.deletedAt !== null } : null;
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
