// markCalled (FR-21; AD-7, AD-21; Story 3.6): one BEGIN IMMEDIATE transaction, the only command
// that writes `booking.last_told_notice` and `outbox.resolved_at` (besides the worker). It reads the
// booking's call-feed entry fresh (`getCallFeed` with the booking filter, the same feed as the list)
// and refuses, in this order and writing nothing:
// - `not_found`: unknown or deleted booking;
// - `past`: its start has come;
// - `conflict`: the booking is not on `deriveCallList` of its entry (called by another admin, or the
//   notice went back to the last-told one: nothing is left to call about);
// - `stale`: the posted token is not a notice, or not `noticeEquals` to the current notice; an empty
//   token (the list could not word a notice) is stale unless the current notice is still unknown.
// Otherwise it writes the posted notice as `last_told_notice` (canonical form; skipped for an empty
// token) and sets `resolved_at = now` on the booking's unresolved rows that are `refused` or
// `expired` or that `sendProblems` lists as call required: the overdue keybox row and an overdue
// urgent heat-change row (the AD-21 amendment). The worker then cancels that pending heat-change row
// at claim, its notice now being the last-told one. Never throws for an expected outcome.
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { deriveCallList, noticeEquals, parseNotice, sendProblems, serializeNotice, type Notice } from '#lib/domain/index.ts';
import { compareInstants, type Instant } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getCallFeed } from '../db/queries/index.ts';
import { booking, outbox } from '../db/schema.ts';

export type MarkCalledInput = {
	bookingId: number;
	/** The notice the entry showed, `serializeNotice(current)`, or "" when it had none. */
	notice: string;
};

export type MarkCalledResult = { ok: true } | { ok: false; code: 'not_found' | 'past' | 'conflict' | 'stale' };

/** The posted token as a notice: null for an empty one, undefined for one that is not a notice. */
function parseToken(token: string): Notice | null | undefined {
	if (token === '') return null;
	try {
		return parseNotice(token);
	} catch {
		return undefined;
	}
}

export function markCalled(input: MarkCalledInput, options: { now?: Instant; db?: Db } = {}): MarkCalledResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	if (!Number.isSafeInteger(input.bookingId) || input.bookingId < 1) return { ok: false, code: 'not_found' };
	const run = db.$client.transaction((): MarkCalledResult => {
		const row = db
			.select({ start: booking.startAt, deletedAt: booking.deletedAt })
			.from(booking)
			.where(eq(booking.id, input.bookingId))
			.get();
		if (!row || row.deletedAt !== null) return { ok: false, code: 'not_found' };
		if (compareInstants(row.start, now) <= 0) return { ok: false, code: 'past' };

		const feed = getCallFeed(now, db, { bookingId: input.bookingId });
		const entry = feed.get(input.bookingId);
		if (!entry || deriveCallList(feed, now).length === 0) return { ok: false, code: 'conflict' };

		const told = parseToken(input.notice);
		const stale =
			told === undefined ||
			(told === null ? entry.current !== null : entry.current === null || !noticeEquals(told, entry.current));
		if (stale) return { ok: false, code: 'stale' };

		if (told !== null) {
			db.update(booking).set({ lastToldNotice: serializeNotice(told) }).where(eq(booking.id, input.bookingId)).run();
		}
		const calling = sendProblems(entry, now).callRequired.map((c) => c.rowId);
		db.update(outbox)
			.set({ resolvedAt: now })
			.where(
				and(
					eq(outbox.bookingId, input.bookingId),
					isNull(outbox.resolvedAt),
					or(inArray(outbox.state, ['refused', 'expired']), calling.length > 0 ? inArray(outbox.id, calling) : undefined)
				)
			)
			.run();
		return { ok: true };
	});
	return run.immediate();
}
