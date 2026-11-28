// The reply reminder's client logic (Story 3.4), pure and client-safe: what a `replyDone` action
// result means, and where focus goes once a reminder has left the list.

/** `done`: marked done; `already_done`: nothing left to answer; `failed`: nothing written; `redirect`: apply it (e.g. an ended session). */
export type ReplyOutcome = 'done' | 'already_done' | 'failed' | 'redirect';

/** The `replyDone` action's data as the page's `form` prop carries it after a native POST. */
export type ReplyFormResult = { done?: true; code?: 'already_done' | 'failed'; bookingId?: number | null } | null | undefined;

/** An enhanced action result, reduced to what the mapping reads. */
export type ReplyActionResult = { type: 'success' | 'failure' | 'redirect' | 'error'; data?: unknown };

/** Maps an action result: success → done, 409 `already_done` → already_done, redirect → redirect, anything else → failed. */
export function replyOutcome(result: ReplyActionResult): ReplyOutcome {
	if (result.type === 'success') return 'done';
	if (result.type === 'redirect') return 'redirect';
	if (result.type === 'failure' && (result.data as { code?: unknown } | undefined)?.code === 'already_done') return 'already_done';
	return 'failed';
}

/** Where focus goes after reminder `doneId` left the list. */
export type ReplyFocusTarget = { kind: 'reminder'; id: number } | { kind: 'section' } | { kind: 'page' };

/**
 * The next reminder after `doneId` (in the order `before`) that is still listed in `after`, else the
 * section heading while the section is shown, else the page `h1` (the day view with none left).
 */
export function nextReplyFocus(
	before: readonly number[],
	doneId: number,
	after: readonly number[],
	sectionShown: boolean
): ReplyFocusTarget {
	const index = before.indexOf(doneId);
	const next = after.find((id) => id !== doneId && before.indexOf(id) > index);
	if (next !== undefined) return { kind: 'reminder', id: next };
	return sectionShown ? { kind: 'section' } : { kind: 'page' };
}
