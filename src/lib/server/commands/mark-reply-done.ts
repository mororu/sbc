// markReplyDone (FR-31; Story 3.4): one BEGIN IMMEDIATE transaction, the only writer of
// `booking.reply_done_at`. It refuses, in this order and writing nothing: `not_found` (unknown id,
// or a booking that is not deleted: no reminder can exist for it) and `conflict` (the reply is
// already marked done, by another admin, or the email was erased or is blank: no one to answer).
// Otherwise it sets `reply_done_at = now`. Never throws for an expected outcome.
import { eq } from 'drizzle-orm';
import type { Instant } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { booking } from '../db/schema.ts';

export type MarkReplyDoneInput = { bookingId: number };

export type MarkReplyDoneResult = { ok: true } | { ok: false; code: 'not_found' | 'conflict' };

export function markReplyDone(input: MarkReplyDoneInput, options: { now?: Instant; db?: Db } = {}): MarkReplyDoneResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	if (!Number.isSafeInteger(input.bookingId) || input.bookingId < 1) return { ok: false, code: 'not_found' };
	const run = db.$client.transaction((): MarkReplyDoneResult => {
		const row = db
			.select({ deletedAt: booking.deletedAt, replyDoneAt: booking.replyDoneAt, email: booking.email })
			.from(booking)
			.where(eq(booking.id, input.bookingId))
			.get();
		if (!row || row.deletedAt === null) return { ok: false, code: 'not_found' };
		if (row.replyDoneAt !== null || !row.email?.trim()) return { ok: false, code: 'conflict' };
		db.update(booking).set({ replyDoneAt: now }).where(eq(booking.id, input.bookingId)).run();
		return { ok: true };
	});
	return run.immediate();
}
