// Outbox read queries for the worker only. Unlike the guest queries, `getSendData` selects the
// guest's email address: it is read at send time and never stored on the outbox row.
import { eq } from 'drizzle-orm';
import type { Instant } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, outbox } from '../schema.ts';
import { getAdminContact } from './setting.ts';

/** The immutable booking facts and the address a row's email needs, read at send time. */
export type SendData = {
	/** Null once the contact data has been erased. */
	email: string | null;
	start: Instant;
	durationMin: number;
	partySize: number;
	createdAt: Instant;
	/** Set once the booking was deleted: the worker then sends nothing. */
	deletedAt: Instant | null;
	/** The admin contact address, or null when none is set. */
	adminContact: string | null;
};

/** The send data for outbox row `rowId`, or null for an unknown row. */
export function getSendData(rowId: number, db: Db = getDb()): SendData | null {
	const row = db
		.select({
			email: booking.email,
			start: booking.startAt,
			durationMin: booking.durationMin,
			partySize: booking.partySize,
			createdAt: booking.createdAt,
			deletedAt: booking.deletedAt
		})
		.from(outbox)
		.innerJoin(booking, eq(booking.id, outbox.bookingId))
		.where(eq(outbox.id, rowId))
		.get();
	return row ? { ...row, adminContact: getAdminContact(db) } : null;
}
