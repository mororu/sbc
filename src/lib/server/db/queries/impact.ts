// Impact read queries (Story 3.3; AD-6). The delete-booking preview and the delete-booking command
// both compute the impact here, so the dialog shows exactly what the command rechecks on confirm.
// Admin only: it selects the affected guest's first name for the mini row.
import { eq } from 'drizzle-orm';
import { affectedBooking, impactOn, type Impact } from '#lib/domain/index.ts';
import { addMinutes, compareInstants, localDate, type Instant, type LocalDate } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking } from '../schema.ts';
import { keyboxStateOf, toldNotice } from './booking.ts';
import { getDayData } from './calendar.ts';

/** What deleting a live booking does to the booking behind it. */
export type DeletionImpact = {
	bookingId: number;
	start: Instant;
	durationMin: number;
	/** The local date of the deleted booking's start. */
	date: LocalDate;
	/** True once its start has come (at or before `now`): it can no longer be deleted. */
	started: boolean;
	impact: Impact;
	/** The affected guest's first name, or null when erased or blank (or no affected booking). */
	affectedFirstName: string | null;
};

/** The first word of a stored name, or null for a missing or blank one. */
export const firstName = (name: string | null): string | null => {
	const first = name?.trim().split(/\s+/)[0];
	return first ? first : null;
};

/**
 * The impact of deleting booking `bookingId` (Story 3.3): the deleted booking's day data, the
 * affected booking (`affectedBooking` after its end), the affected booking's told notice and keybox
 * state, its guest's first name, and `impactOn` over the bookings without the deleted one. Null for
 * an unknown or deleted booking. A booking that has started still gets its impact; the command
 * refuses it with `past` (`started`: its start is at or before `now`).
 */
export function getDeletionImpact(bookingId: number, now: Instant, db: Db = getDb()): DeletionImpact | null {
	const row = db
		.select({ start: booking.startAt, durationMin: booking.durationMin, deletedAt: booking.deletedAt })
		.from(booking)
		.where(eq(booking.id, bookingId))
		.get();
	if (!row || row.deletedAt !== null) return null;
	const date = localDate(row.start);
	// The day data covers the affected window across midnight (see createBooking).
	const { settings, bookings, blocks } = getDayData(date, db);
	const end = addMinutes(row.start, row.durationMin);
	const affected = affectedBooking({ end, bookingId }, bookings, settings);
	const after = bookings.filter((b) => b.id !== bookingId);
	const impact = impactOn({
		affected,
		bookings: after,
		blocks,
		preheat: { minMin: settings.preheatMinMin, maxMin: settings.preheatMaxMin },
		told: affected ? toldNotice(affected.id, db) : null,
		keyboxState: affected ? keyboxStateOf(affected.id, db) : null
	});
	let affectedFirstName: string | null = null;
	if (affected) {
		const other = db.select({ name: booking.name }).from(booking).where(eq(booking.id, affected.id)).get();
		affectedFirstName = firstName(other?.name ?? null);
	}
	return {
		bookingId,
		start: row.start,
		durationMin: row.durationMin,
		date,
		started: compareInstants(row.start, now) <= 0,
		impact,
		affectedFirstName
	};
}

/** The local date of a deleted booking's start, or null for an unknown or live one (the "gone" detail). */
export function deletedBookingDate(bookingId: number, db: Db = getDb()): LocalDate | null {
	const row = db
		.select({ start: booking.startAt, deletedAt: booking.deletedAt })
		.from(booking)
		.where(eq(booking.id, bookingId))
		.get();
	return row && row.deletedAt !== null ? localDate(row.start) : null;
}
