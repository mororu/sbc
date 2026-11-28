// deleteBooking (FR-18; AD-2, AD-6, AD-23; Story 3.3): one BEGIN IMMEDIATE transaction. It recomputes
// the impact the dialog showed (`getDeletionImpact`, the same query and core as the preview) and
// refuses, in this order: `not_found` (unknown or already deleted), `past` (the start has come) and
// `stale` (the posted impact token differs from the recomputed one: a booking, block or pre-heat
// change since the dialog opened). Otherwise it soft-deletes (`deleted_at = now`, nothing removed),
// cancels the booking's own open outbox rows of every kind, and lets the heat-change helper upsert
// or cancel the affected booking's heat-change row. The deleted guest is never emailed: the reply
// reminder (Story 3.4) is how the admins answer them. Never throws for an expected outcome.
import { and, eq, inArray } from 'drizzle-orm';
import { impactToken } from '#lib/domain/index.ts';
import type { Instant, LocalDate } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getDeletionImpact } from '../db/queries/index.ts';
import { booking, outbox } from '../db/schema.ts';
import { enqueueHeatChanges, OPEN_STATES } from './heat-change.ts';

export type DeleteBookingInput = {
	bookingId: number;
	/** The impact token the dialog showed (`impactToken`). */
	impactToken: string;
};

export type DeleteBookingResult =
	/** `date`: the local date of the deleted booking, for the way back to its day. */
	| { ok: true; date: LocalDate }
	| { ok: false; code: 'not_found' | 'past' | 'stale' };

export function deleteBooking(
	input: DeleteBookingInput,
	options: { now?: Instant; db?: Db } = {}
): DeleteBookingResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	if (!Number.isSafeInteger(input.bookingId) || input.bookingId < 1) return { ok: false, code: 'not_found' };
	const run = db.$client.transaction((): DeleteBookingResult => {
		const deletion = getDeletionImpact(input.bookingId, now, db);
		if (!deletion) return { ok: false, code: 'not_found' };
		if (deletion.started) return { ok: false, code: 'past' };
		if (impactToken(deletion.impact) !== input.impactToken) return { ok: false, code: 'stale' };

		db.update(booking).set({ deletedAt: now }).where(eq(booking.id, input.bookingId)).run();
		// Its own emails that have not gone out never will. An in-flight row is the worker's: it
		// finds the deletion at send time (`cancelInFlightOfDeleted`). Finished rows stay as they are.
		db.update(outbox)
			.set({ state: 'cancelled', outcomeAt: now })
			.where(and(eq(outbox.bookingId, input.bookingId), inArray(outbox.state, [...OPEN_STATES])))
			.run();
		// After the soft delete, so the helper's notice no longer sees the deleted booking.
		const affected = deletion.impact.affected;
		if (affected) enqueueHeatChanges([affected.id], { now, db });
		return { ok: true, date: deletion.date };
	});
	return run.immediate();
}
