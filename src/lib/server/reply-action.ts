// The `replyDone` form action (Story 3.4), shared by the admin home and the admin day view: posts
// the reminder's booking id to `markReplyDone`, the only writer of `reply_done_at`.
// - done: `{ done: true }` (the page reloads its data: list and badges);
// - `conflict` (done by another admin, email purged) or `not_found` (unknown or live id):
//   `fail(409, { code: 'already_done', bookingId })`: either way nothing is left to answer ("Schon erledigt.");
// - a missing or malformed id: an admin 404, as in the delete action;
// - a lock timeout: `fail(503, { code: 'failed', bookingId })`, nothing written ("Das hat nicht geklappt …").
// `bookingId` tells a page without JavaScript which reminder the failure concerns.
import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { isAdminBookingId } from '#lib/server/admin-day-view.ts';
import { now } from '#lib/server/clock.ts';
import { isLockTimeout, markReplyDone, type MarkReplyDoneResult } from '#lib/server/commands/index.ts';

/** What the page gets back after fail(). */
export type ReplyDoneFailure = { code: 'already_done' | 'failed'; bookingId: number };

export async function replyDoneAction(request: Request): Promise<{ done: true } | ActionFailure<ReplyDoneFailure>> {
	const data = await request.formData();
	const raw = data.get('bookingId');
	if (typeof raw !== 'string' || !isAdminBookingId(raw)) error(404);
	const bookingId = Number(raw);
	let result: MarkReplyDoneResult;
	try {
		result = markReplyDone({ bookingId }, { now: now() });
	} catch (e) {
		// Another writer held the lock too long: nothing was written; the admin may try again.
		if (isLockTimeout(e)) return fail(503, { code: 'failed', bookingId } satisfies ReplyDoneFailure);
		throw e;
	}
	if (result.ok) return { done: true };
	return fail(409, { code: 'already_done', bookingId } satisfies ReplyDoneFailure);
}
