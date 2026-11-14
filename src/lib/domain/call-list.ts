// Send problems (Story 2.4; AD-21): which bookings' guests must be phoned because an email that
// counts did not reach them, and which other sends were refused. Epic 3's call list (3.6) shows
// them and sets `resolved_at` when an admin marks a guest called.
// Pure: `now` is always a parameter.
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';
import { keyboxDueAt } from './keybox.ts';
import {
	KEYBOX_OVERDUE_BEFORE_START_MIN,
	KEYBOX_OVERDUE_MIN,
	type OutboxKind,
	type OutboxState
} from './outbox.ts';

/** One outbox row of a booking, as the send-problem core reads it. */
export type SendProblemRow = {
	id: number;
	kind: OutboxKind;
	state: OutboxState;
	/** `snapshot_urgent`, frozen at claim: null for a row never claimed and for non-heat kinds. */
	urgent: boolean | null;
	/** Set once an admin marked the guest called: the row never raises an entry again. */
	resolvedAt: Instant | null;
};

/** One booking's input: its immutable start and booking time, and its outbox rows. */
export type SendProblemEntry = { start: Instant; createdAt: Instant; rows: SendProblemRow[] };

export type CallReason = 'keybox_refused' | 'keybox_expired' | 'keybox_overdue' | 'warning_refused' | 'warning_expired';

export type SendProblems = {
	/** The rows that make the booking call required, with the reason, by row id. */
	callRequired: { rowId: number; reason: CallReason }[];
	/** Every other unresolved refused row, by row id: shown with the booking, no call needed. */
	refusals: { rowId: number; kind: OutboxKind }[];
};

/** States in which a keybox row has not gone out yet but still may (a held row stays `pending`). */
const KEYBOX_OPEN: readonly OutboxState[] = ['pending', 'in_flight', 'transient_failure'];

const latest = (rows: SendProblemRow[]) => rows.reduce<SendProblemRow | null>((a, r) => (a && a.id > r.id ? a : r), null);
const later = (a: Instant, b: Instant) => (compareInstants(a, b) >= 0 ? a : b);
const earlier = (a: Instant, b: Instant) => (compareInstants(a, b) <= 0 ? a : b);

/**
 * When an open keybox row becomes overdue: 15 minutes after its original due time,
 * `keyboxDueAt(start, createdAt)` (a retry moves `due_at`, so it is never read), but no later than
 * 5 minutes before the start and never before the due time. The clamp keeps a booking made shortly
 * before its start visible: rows expire only at the start, and the feed drops the booking then.
 */
export function keyboxOverdueAt(start: Instant, createdAt: Instant): Instant {
	const due = keyboxDueAt(start, createdAt);
	return later(due, earlier(addMinutes(due, KEYBOX_OVERDUE_MIN), addMinutes(start, -KEYBOX_OVERDUE_BEFORE_START_MIN)));
}

/**
 * The send problems of one booking at `now`. Call required, each only while the row is unresolved:
 * - the latest keybox row is `refused` or `expired`;
 * - the latest keybox row is still open at `keyboxOverdueAt` (held rows included: the admin must call);
 * - the latest urgent heat-change row is `refused` or `expired`.
 * "Latest" is the highest id; a resolved latest row gives no entry and no older row stands in.
 * The expired reasons are a safety net: rows expire at the start, when the feed drops the booking.
 */
export function sendProblems(entry: SendProblemEntry, now: Instant): SendProblems {
	const { start, createdAt, rows } = entry;
	const callRequired: SendProblems['callRequired'] = [];

	const keybox = latest(rows.filter((r) => r.kind === 'keybox'));
	if (keybox && keybox.resolvedAt === null) {
		if (keybox.state === 'refused') callRequired.push({ rowId: keybox.id, reason: 'keybox_refused' });
		else if (keybox.state === 'expired') callRequired.push({ rowId: keybox.id, reason: 'keybox_expired' });
		else if (KEYBOX_OPEN.includes(keybox.state) && compareInstants(now, keyboxOverdueAt(start, createdAt)) >= 0) {
			callRequired.push({ rowId: keybox.id, reason: 'keybox_overdue' });
		}
	}

	const warning = latest(rows.filter((r) => r.kind === 'heat_change' && r.urgent === true));
	if (warning && warning.resolvedAt === null) {
		if (warning.state === 'refused') callRequired.push({ rowId: warning.id, reason: 'warning_refused' });
		else if (warning.state === 'expired') callRequired.push({ rowId: warning.id, reason: 'warning_expired' });
	}
	callRequired.sort((a, b) => a.rowId - b.rowId);

	const calling = new Set(callRequired.map((c) => c.rowId));
	const refusals = rows
		.filter((r) => r.state === 'refused' && r.resolvedAt === null && !calling.has(r.id))
		.sort((a, b) => a.id - b.id)
		.map((r) => ({ rowId: r.id, kind: r.kind }));
	return { callRequired, refusals };
}

/** One booking with at least one send problem. */
export type CallListEntry = SendProblems & { bookingId: number; start: Instant };

/**
 * The bookings of `feed` (by booking id) that have a send problem at `now`, ordered by start, then
 * booking id. Bookings without one are left out.
 */
export function callList(feed: ReadonlyMap<number, SendProblemEntry>, now: Instant): CallListEntry[] {
	const list: CallListEntry[] = [];
	for (const [bookingId, entry] of feed) {
		const problems = sendProblems(entry, now);
		if (problems.callRequired.length > 0 || problems.refusals.length > 0) {
			list.push({ bookingId, start: entry.start, ...problems });
		}
	}
	return list.sort((a, b) => compareInstants(a.start, b.start) || a.bookingId - b.bookingId);
}
