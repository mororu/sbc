// Send problems (Story 2.4; AD-21): which bookings' guests must be phoned because an email that
// counts did not reach them, and which other sends were refused. Epic 3's call list (3.6) shows
// them and sets `resolved_at` when an admin marks a guest called.
// The call list (Story 3.1; AD-21) adds trigger (a): once the keybox email has finished, a heat
// change can no longer be emailed, so it must be phoned (urgent) or may be (good news).
// Pure: `now` is always a parameter.
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';
import { classifyHeatChange, type HeatChangeClass } from './heat-change.ts';
import { isKeyboxPhase, keyboxOverdueAt } from './keybox.ts';
import type { Notice } from './notice.ts';
import { WARNING_OVERDUE_MARGIN_MIN, type OutboxKind, type OutboxState } from './outbox.ts';

/** One outbox row of a booking, as the send-problem core reads it. */
export type SendProblemRow = {
	id: number;
	kind: OutboxKind;
	state: OutboxState;
	/**
	 * `snapshot_urgent`: for a heat-change row, set when it is upserted and re-frozen at claim (Story
	 * 2.5). Null for other kinds and for a heat-change row written before 2.5 and never claimed.
	 */
	urgent: boolean | null;
	/** Set once an admin marked the guest called: the row never raises an entry again. */
	resolvedAt: Instant | null;
};

/**
 * One booking's input: its immutable start and booking time, its outbox rows, and the pre-heat
 * maximum setting (minutes) that places the urgent-warning window.
 */
export type SendProblemEntry = { start: Instant; createdAt: Instant; preheatMaxMin: number; rows: SendProblemRow[] };

export type CallReason =
	| 'keybox_refused'
	| 'keybox_expired'
	| 'keybox_overdue'
	| 'warning_refused'
	| 'warning_expired'
	| 'warning_overdue';

export type SendProblems = {
	/** The rows that make the booking call required, with the reason, by row id. */
	callRequired: { rowId: number; reason: CallReason }[];
	/** Every other unresolved refused row, by row id: shown with the booking, no call needed. */
	refusals: { rowId: number; kind: OutboxKind }[];
};

/** States in which a row has not gone out yet but still may (a held keybox row stays `pending`). */
const NOT_SENT_YET: readonly OutboxState[] = ['pending', 'in_flight', 'transient_failure'];

const latest = (rows: SendProblemRow[]) => rows.reduce<SendProblemRow | null>((a, r) => (a && a.id > r.id ? a : r), null);

/**
 * When an urgent heat-change row still not sent becomes overdue: 20 minutes before the earliest
 * possible arrival, `start − (preheatMaxMin + 20)` (60 minutes before the start with the defaults).
 */
export function warningOverdueAt(start: Instant, preheatMaxMin: number): Instant {
	return addMinutes(start, -(preheatMaxMin + WARNING_OVERDUE_MARGIN_MIN));
}

/**
 * The send problems of one booking at `now`. Call required, each only while the row is unresolved:
 * - the latest keybox row is `refused` or `expired`;
 * - the latest keybox row is still open at `keyboxOverdueAt` (held rows included: the admin must call);
 * - the latest heat-change row, of any urgency, is urgent and `refused` or `expired`, or urgent and
 *   still not sent (`pending`, `in_flight`, `transient_failure`) at `warningOverdueAt`. An urgent
 *   change enqueued inside the window is call required at once, before its settle delay ends: a
 *   late urgent change must be phoned. An `in_flight` urgent row past the window counts as overdue
 *   until its send outcome is recorded.
 * "Latest" is the highest id; a resolved latest row gives no entry and no older row stands in. A newer
 * heat-change row that is not urgent (good news, or a change taken back) supersedes an older urgent
 * one: no call, and an older refused row is listed under `refusals` only.
 * The expired reasons are a safety net: rows expire at the start, when the feed drops the booking.
 */
export function sendProblems(entry: SendProblemEntry, now: Instant): SendProblems {
	const { start, createdAt, preheatMaxMin, rows } = entry;
	const callRequired: SendProblems['callRequired'] = [];

	const keybox = latest(rows.filter((r) => r.kind === 'keybox'));
	if (keybox && keybox.resolvedAt === null) {
		if (keybox.state === 'refused') callRequired.push({ rowId: keybox.id, reason: 'keybox_refused' });
		else if (keybox.state === 'expired') callRequired.push({ rowId: keybox.id, reason: 'keybox_expired' });
		else if (NOT_SENT_YET.includes(keybox.state) && compareInstants(now, keyboxOverdueAt(start, createdAt)) >= 0) {
			callRequired.push({ rowId: keybox.id, reason: 'keybox_overdue' });
		}
	}

	const warning = latest(rows.filter((r) => r.kind === 'heat_change'));
	if (warning && warning.urgent === true && warning.resolvedAt === null) {
		if (warning.state === 'refused') callRequired.push({ rowId: warning.id, reason: 'warning_refused' });
		else if (warning.state === 'expired') callRequired.push({ rowId: warning.id, reason: 'warning_expired' });
		else if (NOT_SENT_YET.includes(warning.state) && compareInstants(now, warningOverdueAt(start, preheatMaxMin)) >= 0) {
			callRequired.push({ rowId: warning.id, reason: 'warning_overdue' });
		}
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

/**
 * One booking's call-list input: its send-problem entry plus the notice the guest was last told and
 * the notice it has now (AD-24). Either is null when unknown (a booking made before notices were
 * stored, or an unreadable value): trigger (a) then gives nothing.
 */
export type CallFeedEntry = SendProblemEntry & { lastTold: Notice | null; current: Notice | null };

/** `call_required` is *Anruf nötig*; `optional` is good news the admin may phone. */
export type CallMarker = 'call_required' | 'optional';

/** One call-list entry: one per booking. */
export type CallEntry = {
	bookingId: number;
	start: Instant;
	marker: CallMarker;
	/** The send-problem reasons (trigger b), by row id; empty for an entry from trigger (a) alone. */
	reasons: CallReason[];
	/** `classifyHeatChange(lastTold, current)` while in the keybox phase, else `none`. */
	heatChange: HeatChangeClass;
};

/**
 * Trigger (a): the heat change that must or may be phoned, or `none`. Only once the latest keybox
 * row is in the keybox phase (`accepted`, `refused`, `expired`): before that the change still goes
 * out by email (a heat-change row, or the keybox email with the current notice).
 */
export function keyboxPhaseHeatChange(entry: CallFeedEntry): HeatChangeClass {
	const keybox = latest(entry.rows.filter((r) => r.kind === 'keybox'));
	if (!keybox || !isKeyboxPhase(keybox.state) || !entry.lastTold || !entry.current) return 'none';
	return classifyHeatChange(entry.lastTold, entry.current);
}

/**
 * The call list at `now` (AD-21), derived from `feed` (by booking id), never stored:
 * - a booking whose start is at or before `now` is dropped;
 * - trigger (a), `keyboxPhaseHeatChange`: urgent is `call_required`, good news `optional`;
 * - trigger (b), `sendProblems(…).callRequired`: `call_required`, with the reasons;
 * - one entry per booking: `call_required` wins, and keeps both the reasons and the heat change.
 * Ordered `call_required` first, then by start, then booking id.
 */
export function deriveCallList(feed: ReadonlyMap<number, CallFeedEntry>, now: Instant): CallEntry[] {
	const list: CallEntry[] = [];
	for (const [bookingId, entry] of feed) {
		if (compareInstants(entry.start, now) <= 0) continue;
		const heatChange = keyboxPhaseHeatChange(entry);
		const reasons = sendProblems(entry, now).callRequired.map((c) => c.reason);
		if (reasons.length === 0 && heatChange === 'none') continue;
		const marker: CallMarker = reasons.length > 0 || heatChange === 'urgent' ? 'call_required' : 'optional';
		list.push({ bookingId, start: entry.start, marker, reasons, heatChange });
	}
	const rank = (marker: CallMarker) => (marker === 'call_required' ? 0 : 1);
	return list.sort(
		(a, b) => rank(a.marker) - rank(b.marker) || compareInstants(a.start, b.start) || a.bookingId - b.bookingId
	);
}
