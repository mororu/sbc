// The heat-change helper (Story 2.3; AD-6, AD-23, AD-24). Every command that can change a booking's
// notice calls it inside its own BEGIN IMMEDIATE transaction, after its write: createBooking now,
// the Epic 3 commands (deletion, blocks, the pre-heat window) later. It never opens a transaction.
// Not re-exported from `commands/index.ts`, so only commands call it.
// For each booking it recomputes the current notice and compares it with what the guest has been, or
// is about to be, told (`toldNotice`): the snapshot of an in-flight heat-change row, else the last-told notice.
// A change worth an email upserts the booking's one open heat-change row, due after the settle
// delay, with its urgency; a repeat change resets the due time and the urgency and clears
// `resolved_at`. Once the keybox row is in flight, retrying or finished, no heat-change mail goes
// out: open heat-change rows are cancelled instead. A retrying keybox email carries the new notice
// itself until it is overdue; from then on the call list asks for a call (`keybox_overdue`). A
// change that only widens the arrival range writes nothing; an open row is left for the claim to
// recheck.
import { and, eq, inArray } from 'drizzle-orm';
import { classifyHeatChange, endsHeatChangeMail, parseNotice, SETTLE_DELAY_MIN, type Notice } from '#lib/domain/index.ts';
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';
import type { Db } from '../db/index.ts';
import { currentNotice, keyboxStateOf, toldNotice } from '../db/queries/index.ts';
import { booking, outbox } from '../db/schema.ts';

/**
 * - `upserted`: the open heat-change row was updated or inserted.
 * - `cancelled`: the keybox row ends heat-change mail; open heat-change rows were cancelled.
 * - `none`: nothing worth an email changed (or there is no last-told notice); nothing written.
 * - `skipped`: unknown, deleted or already started booking; nothing written.
 */
export type HeatChangeAction = 'upserted' | 'cancelled' | 'none' | 'skipped';

/** The states a row can still be claimed from: the only ones cancellation applies to (AD-23). */
export const OPEN_STATES = ['pending', 'transient_failure'] as const;

/** A stored notice, or null when it is missing or not a valid notice. */
export function storedNotice(json: string | null): Notice | null {
	if (json === null) return null;
	try {
		return parseNotice(json);
	} catch {
		return null;
	}
}

/** The where-clause for the open (`pending` or `transient_failure`) heat-change rows of a booking. */
export function openHeatChangesOf(bookingId: number) {
	return and(eq(outbox.bookingId, bookingId), eq(outbox.kind, 'heat_change'), inArray(outbox.state, [...OPEN_STATES]));
}

/** Cancels the booking's open heat-change rows; `outcomeAt` is `now`. */
export function cancelOpenHeatChanges(bookingId: number, now: Instant, db: Db): void {
	db.update(outbox).set({ state: 'cancelled', outcomeAt: now }).where(openHeatChangesOf(bookingId)).run();
}

function enqueueOne(bookingId: number, now: Instant, db: Db): HeatChangeAction {
	const row = db
		.select({ start: booking.startAt, deletedAt: booking.deletedAt })
		.from(booking)
		.where(eq(booking.id, bookingId))
		.get();
	if (!row || row.deletedAt !== null || compareInstants(row.start, now) <= 0) return 'skipped';

	const keybox = keyboxStateOf(bookingId, db);
	if (keybox !== null && endsHeatChangeMail(keybox)) {
		cancelOpenHeatChanges(bookingId, now, db);
		return 'cancelled';
	}

	const told = toldNotice(bookingId, db);
	const current = storedNotice(currentNotice(bookingId, db));
	if (!told || !current) return 'none';
	const classification = classifyHeatChange(told, current);
	if (classification === 'none') return 'none';

	// Urgency is known from the upsert on, so the call list sees an urgent warning that never goes
	// out (Story 2.5); the claim re-freezes it against the last-told notice. A re-upsert is a new
	// change: it clears a `resolved_at` set by "Angerufen" for the change before (retro D2).
	const dueAt = addMinutes(now, SETTLE_DELAY_MIN);
	const snapshotUrgent = classification === 'urgent';
	const updated = db
		.update(outbox)
		.set({ state: 'pending', dueAt, reason: null, snapshotUrgent, resolvedAt: null })
		.where(openHeatChangesOf(bookingId))
		.run();
	if (updated.changes === 0) {
		db.insert(outbox).values({ bookingId, kind: 'heat_change', state: 'pending', dueAt, snapshotUrgent }).run();
	}
	return 'upserted';
}

/**
 * Upserts or cancels the heat-change rows of `bookingIds` (duplicates are handled once), inside the
 * caller's transaction. Throws when called outside one: the write must commit with the mutation.
 */
export function enqueueHeatChanges(
	bookingIds: readonly number[],
	options: { now: Instant; db: Db }
): { bookingId: number; action: HeatChangeAction }[] {
	const { now, db } = options;
	if (!db.$client.inTransaction) throw new Error('enqueueHeatChanges must run inside the caller’s transaction');
	return [...new Set(bookingIds)].map((bookingId) => ({ bookingId, action: enqueueOne(bookingId, now, db) }));
}
