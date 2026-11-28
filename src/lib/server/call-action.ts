// The `called` form action (FR-21; Story 3.6) on the admin home: posts the entry's booking id and
// the notice token it showed to `markCalled`, the only writer of `last_told_notice` and `resolved_at`
// (besides the worker).
// - called: `{ called: true, bookingId, firstName }` (the page reloads its data: list and badges;
//   the first name is for the status "Tom angerufen. Anrufliste: n.");
// - `conflict` (called by another admin, or the notice went back), `not_found` (deleted or unknown)
//   or `past` (started): `fail(409, { action: 'called', code: 'already_done' })`: the entry is gone ("Schon erledigt.");
// - `stale`: `fail(409, { action: 'called', code: 'stale', bookingId })`: the entry shows the new notice and the stale line;
// - a missing or malformed id: an admin 404, as in the other actions;
// - a lock timeout: `fail(503, { action: 'called', code: 'failed', bookingId })`, nothing written ("Das hat nicht geklappt …").
// Every payload carries `action: 'called'`: the home's `form` is shared with `replyDone`, and the
// page hands only these results to the call list (`isCallForm`).
import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { isAdminBookingId } from '#lib/server/admin-day-view.ts';
import { now } from '#lib/server/clock.ts';
import { isLockTimeout, markCalled, type MarkCalledResult } from '#lib/server/commands/index.ts';
import { firstName, getCallContacts } from '#lib/server/db/queries/index.ts';

/** What the page gets back after fail(). */
export type CalledFailure =
	| { action: 'called'; code: 'already_done' }
	| { action: 'called'; code: 'stale' | 'failed'; bookingId: number };

export type CalledSuccess = { action: 'called'; called: true; bookingId: number; firstName: string | null };

export async function calledAction(request: Request): Promise<CalledSuccess | ActionFailure<CalledFailure>> {
	const data = await request.formData();
	const raw = data.get('bookingId');
	if (typeof raw !== 'string' || !isAdminBookingId(raw)) error(404);
	const bookingId = Number(raw);
	const token = data.get('notice');
	const notice = typeof token === 'string' ? token : '';
	let result: MarkCalledResult;
	try {
		result = markCalled({ bookingId, notice }, { now: now() });
	} catch (e) {
		// Another writer held the lock too long: nothing was written; the admin may try again.
		if (isLockTimeout(e)) return fail(503, { action: 'called', code: 'failed', bookingId } satisfies CalledFailure);
		throw e;
	}
	if (result.ok) {
		const name = getCallContacts([bookingId]).get(bookingId)?.name ?? null;
		return { action: 'called', called: true, bookingId, firstName: firstName(name) };
	}
	if (result.code === 'stale') return fail(409, { action: 'called', code: 'stale', bookingId } satisfies CalledFailure);
	return fail(409, { action: 'called', code: 'already_done' } satisfies CalledFailure);
}
