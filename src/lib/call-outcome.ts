// The call list's client logic (Story 3.6), pure and client-safe: what a `called` action result
// means, which native-POST results belong to the call list (the home's `form` is shared with
// `replyDone`; the call action marks its own with `action: 'called'`), and where focus goes once
// an entry has left the list.

/**
 * `called`: marked called; `already_done`: the entry is gone (another admin, deleted, started);
 * `stale`: the notice changed, the entry shows the new one; `failed`: nothing written; `redirect`:
 * apply it (e.g. an ended session).
 */
export type CallOutcome = 'called' | 'already_done' | 'stale' | 'failed' | 'redirect';

/** The `called` action's data as the page's `form` prop carries it after a native POST. */
export type CallFormResult =
	| {
			action?: 'called';
			called?: true;
			code?: 'already_done' | 'stale' | 'failed';
			bookingId?: number | null;
			firstName?: string | null;
	  }
	| null
	| undefined;

/** An enhanced action result, reduced to what the mapping reads. */
export type CallActionResult = { type: 'success' | 'failure' | 'redirect' | 'error'; data?: unknown };

/** Maps an action result: success → called, 409 `already_done`/`stale` → the same, redirect → redirect, anything else → failed. */
export function callOutcome(result: CallActionResult): CallOutcome {
	if (result.type === 'success') return 'called';
	if (result.type === 'redirect') return 'redirect';
	const code = (result.data as { code?: unknown } | undefined)?.code;
	if (result.type === 'failure' && (code === 'already_done' || code === 'stale')) return code;
	return 'failed';
}

/** True for a native-POST result of the `called` action: every payload carries `action: 'called'`. */
export function isCallForm(form: unknown): form is NonNullable<CallFormResult> {
	return typeof form === 'object' && form !== null && (form as { action?: unknown }).action === 'called';
}

/** Where focus goes after entry `calledId` left the list. */
export type CallFocusTarget = { kind: 'entry'; id: number } | { kind: 'section' };

/**
 * Where focus goes after "Angerufen" (or a stale refusal whose entry left): `calledId` itself while
 * it is still listed in `after`; else the next entry after it (in the order `before`) still listed;
 * when `calledId` was not in `before`, the first entry of `after`; else the section heading.
 */
export function nextCallFocus(before: readonly number[], calledId: number, after: readonly number[]): CallFocusTarget {
	if (after.includes(calledId)) return { kind: 'entry', id: calledId };
	const index = before.indexOf(calledId);
	const next = index < 0 ? after[0] : after.find((id) => before.indexOf(id) > index);
	return next !== undefined ? { kind: 'entry', id: next } : { kind: 'section' };
}

/** The one line an entry shows: the stale or the failure line, never both. */
export type EntryLine = 'stale' | 'failed' | null;

/**
 * Which line an entry shows: before any enhanced result, the native POST's (`failed`, else
 * `stale`); once an enhanced result came (`dismissed`), only the line it left (`line`), so a
 * failure replaces a stale line and a success clears both.
 */
export function entryLine(state: { dismissed: boolean; line: EntryLine; failed: boolean; stale: boolean }): EntryLine {
	if (state.dismissed) return state.line;
	return state.failed ? 'failed' : state.stale ? 'stale' : null;
}

