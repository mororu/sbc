// Outbox read queries for the worker only. Unlike the guest queries, `getSendData` selects the
// guest's email address and the keybox instructions: they are read at send time and never stored
// on the outbox row. `getSendProblemRows` selects neither.
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { missingKeyboxSetting, type KeyboxSettingName, type SendProblemEntry } from '#lib/domain/index.ts';
import type { Instant } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { booking, outbox, setting } from '../schema.ts';
import { getAdminContact, getKeyboxSettings } from './setting.ts';

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
	/** For a keybox row: the instructions in the booking's locale, trimmed, or null when unset. Null for other kinds. */
	keyboxInstructions: string | null;
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
			deletedAt: booking.deletedAt,
			locale: booking.locale,
			kind: outbox.kind
		})
		.from(outbox)
		.innerJoin(booking, eq(booking.id, outbox.bookingId))
		.where(eq(outbox.id, rowId))
		.get();
	if (!row) return null;
	const { locale, kind, ...facts } = row;
	return {
		...facts,
		adminContact: getAdminContact(db),
		// Only a keybox email reads the keybox settings.
		keyboxInstructions: kind === 'keybox' ? getKeyboxSettings(db).instructions[locale] : null
	};
}

/** A keybox row the claim skips because a setting it needs is unset. */
export type HeldKeyboxRow = { id: number; missing: KeyboxSettingName };

/**
 * The due, open keybox rows of live bookings that have not started, which cannot be claimed
 * because a keybox setting is missing, by id. The worker logs one line per row per tick.
 */
export function getHeldKeyboxRows(now: Instant, db: Db = getDb()): HeldKeyboxRow[] {
	const settings = getKeyboxSettings(db);
	return db
		.select({ id: outbox.id, locale: booking.locale })
		.from(outbox)
		.innerJoin(booking, eq(booking.id, outbox.bookingId))
		.where(
			and(
				eq(outbox.kind, 'keybox'),
				inArray(outbox.state, ['pending', 'transient_failure']),
				lte(outbox.dueAt, now),
				isNull(booking.deletedAt),
				gt(booking.startAt, now)
			)
		)
		.orderBy(outbox.id)
		.all()
		.flatMap((row) => {
			const missing = missingKeyboxSetting(settings, row.locale);
			return missing ? [{ id: row.id, missing }] : [];
		});
}

/**
 * The outbox rows of every live booking that has not started at `now` (AD-21), by booking id, with
 * the current pre-heat maximum, for `callList`/`sendProblems`. A booking drops off once it starts. Selects no contact
 * data and no keybox code.
 */
export function getSendProblemRows(now: Instant, db: Db = getDb()): Map<number, SendProblemEntry> {
	const rows = db
		.select({
			bookingId: booking.id,
			start: booking.startAt,
			createdAt: booking.createdAt,
			id: outbox.id,
			kind: outbox.kind,
			state: outbox.state,
			urgent: outbox.snapshotUrgent,
			resolvedAt: outbox.resolvedAt
		})
		.from(outbox)
		.innerJoin(booking, eq(booking.id, outbox.bookingId))
		.where(and(isNull(booking.deletedAt), gt(booking.startAt, now)))
		.orderBy(booking.startAt, booking.id, outbox.id)
		.all();
	const settings = db.select({ preheatMaxMin: setting.preheatMaxMin }).from(setting).where(eq(setting.id, 1)).get();
	if (!settings) throw new Error('The setting row is missing');
	const { preheatMaxMin } = settings;
	const byBooking = new Map<number, SendProblemEntry>();
	for (const { bookingId, start, createdAt, ...row } of rows) {
		let entry = byBooking.get(bookingId);
		if (!entry) byBooking.set(bookingId, (entry = { start, createdAt, preheatMaxMin, rows: [] }));
		entry.rows.push(row);
	}
	return byBooking;
}
