// Outbox commands (AD-23), each one BEGIN IMMEDIATE transaction, run by the worker only. They move a
// row through its lifecycle: claim (`pending`/`transient_failure` → `in_flight`, freezing the
// snapshot), outcome (`in_flight` → `accepted`/`refused`/`transient_failure`), expiry at the start
// time, cancellation for a deleted booking, and the per-tick release of stale claims.
// Only an accepted keybox or heat-change row of a live booking writes `last_told_notice`, from its
// snapshot; an accepted confirmation leaves it unchanged (AD-24). Each outcome also keeps the
// heartbeat's `failing_since` (Story 2.5): set by a transient failure, cleared by an accepted send.
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
	classifyHeatChange,
	endsHeatChangeMail,
	isStale,
	KIND_ORDER,
	missingKeyboxSetting,
	OUTBOX_STATE_LIST,
	parseNotice,
	retryAt,
	type OutboxKind
} from '#lib/domain/index.ts';
import type { Instant, Locale } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { currentNotice, getKeyboxSettings } from '../db/queries/index.ts';
import { booking, outbox, workerHeartbeat } from '../db/schema.ts';
import {
	cancelOpenHeatChanges,
	enqueueHeatChanges,
	OPEN_STATES,
	openHeatChangesOf,
	type HeatChangeAction
} from './heat-change.ts';

type Options = { now?: Instant; db?: Db };

/** The kinds the worker sends. */
export const SENDABLE_KINDS: readonly OutboxKind[] = ['confirmation', 'keybox', 'heat_change'];

/** The keybox row states that end heat-change mail for the booking. */
const HEAT_MAIL_ENDED_STATES = OUTBOX_STATE_LIST.filter(endsHeatChangeMail);

/** A claimed row: what the worker needs to render and send it. */
export type ClaimedRow = {
	id: number;
	bookingId: number;
	kind: OutboxKind;
	claimedAt: Instant;
	attempts: number;
	/**
	 * Canonical Notice JSON frozen at claim: the notice at booking for a confirmation, the current
	 * notice for a keybox or heat-change row. Null for a booking made before notices were stored.
	 */
	snapshotNotice: string | null;
	/** The trimmed keybox code frozen at claim: the record of what was sent. Null for other kinds. */
	snapshotKeyboxCode: string | null;
	snapshotLocale: Locale;
	/** Heat change: the last-told notice frozen at claim (canonical JSON). Null for other kinds. */
	snapshotLastTold: string | null;
	/** Heat change: true for an urgent change, false for good news. Null for other kinds. */
	snapshotUrgent: boolean | null;
};

export type ClaimResult = { ok: true; code: 'claimed'; row: ClaimedRow } | { ok: false; code: 'none' };

export type SendOutcome = 'accepted' | 'refused' | 'transient_failure';

export type OutcomeResult =
	/** `dueAt`: the next attempt, for a transient failure. */
	| { ok: true; code: SendOutcome; dueAt?: Instant }
	/**
	 * A heat-change row failed transiently while a newer change already has its own open row: it is
	 * cancelled (the reason kept), and the newer row is rechecked and sent instead.
	 */
	| { ok: true; code: 'superseded' }
	| { ok: false; code: 'not_in_flight' };

function resolve(options: Options) {
	return { db: options.db ?? getDb(), now: options.now ?? clockNow() };
}

/**
 * True when the booking has an open heat-change row other than `exceptId`. While a heat-change row is
 * in flight, a newer change gets its own open row; at most one may be open per booking.
 */
function hasOtherOpenHeatChange(bookingId: number, exceptId: number, db: Db): boolean {
	return db
		.select({ id: outbox.id })
		.from(outbox)
		.where(openHeatChangesOf(bookingId))
		.all()
		.some((row) => row.id !== exceptId);
}

export type ReleaseResult = {
	ok: true;
	code: 'released';
	/** Stale rows returned to `pending`. */
	released: number;
	/** Stale heat-change rows cancelled because a newer heat-change row of the booking takes over. */
	superseded: number;
};

/**
 * Every tick: `in_flight` rows claimed at least the in-flight timeout ago go back to `pending`.
 * Delivery is at-least-once (AD-23): a released row may be resent even though the server had
 * already accepted it, e.g. when the process died between the send and the outcome. For a
 * heat-change row that crash-after-accept case means the guest can get the same heat-change email
 * twice, and the last-told notice is written only by the resend's outcome.
 * At most one open heat-change row may exist per booking, so stale heat-change rows are released
 * only when the booking has no open one: then the newest stale row goes back to `pending`. Every
 * other stale heat-change row of the booking is cancelled as superseded; the open (or released) row
 * is rechecked at its claim and carries the latest change.
 */
export function releaseStaleClaims(options: Options = {}): ReleaseResult {
	const { db, now } = resolve(options);
	const run = db.$client.transaction((): ReleaseResult => {
		const stale = db
			.select({ id: outbox.id, claimedAt: outbox.claimedAt, kind: outbox.kind, bookingId: outbox.bookingId })
			.from(outbox)
			.where(eq(outbox.state, 'in_flight'))
			.orderBy(desc(outbox.id))
			.all()
			.filter((row) => row.claimedAt !== null && isStale(row.claimedAt, now));
		const released: number[] = [];
		const superseded: number[] = [];
		// Bookings that already have, or are given, an open heat-change row.
		const heatOpen = new Set<number>();
		for (const row of stale) {
			if (row.kind !== 'heat_change') {
				released.push(row.id);
				continue;
			}
			// Newest first: the first stale row of a booking without an open row is released.
			if (heatOpen.has(row.bookingId) || hasOtherOpenHeatChange(row.bookingId, row.id, db)) {
				superseded.push(row.id);
			} else {
				released.push(row.id);
			}
			heatOpen.add(row.bookingId);
		}
		if (superseded.length > 0) {
			db.update(outbox).set({ state: 'cancelled', outcomeAt: now }).where(inArray(outbox.id, superseded)).run();
		}
		if (released.length > 0) {
			db.update(outbox).set({ state: 'pending', claimedAt: null }).where(inArray(outbox.id, released)).run();
		}
		return { ok: true, code: 'released', released: released.length, superseded: superseded.length };
	});
	return run.immediate();
}

/**
 * Claims the next row to send, in one transaction:
 * 1. Sweep: open rows of deleted bookings are cancelled; open rows of bookings whose start has come
 *    expire; open heat-change rows whose keybox row is in flight, retrying or finished are cancelled.
 * 2. Pick: due open rows of a sendable kind, by due time, kind and id. Skipped (left as they are):
 *    a keybox or heat-change row while its booking's confirmation is open or in flight, and a held
 *    keybox row whose code or instructions in the booking's locale are unset (the worker logs it);
 *    a held row that was retrying goes back to `pending` and the heat changes are enqueued again.
 * 3. Recheck a heat-change row against the last-told notice: `none` (or a missing notice) cancels
 *    it, a notice that cannot be compared cancels it with reason `invalid_notice`; either way the
 *    next candidate is tried.
 * 4. Claim: `in_flight`, freezing the snapshot. A confirmation: the notice at booking and the
 *    locale. A keybox row: the current notice (or the notice at booking), the trimmed code and the
 *    locale; the booking's open heat-change rows are cancelled. A heat-change row: the current
 *    notice, the last-told notice, the locale and the urgent flag.
 */
export function claimDueRow(options: Options = {}): ClaimResult {
	const { db, now } = resolve(options);
	const run = db.$client.transaction((): ClaimResult => {
		const open = inArray(outbox.state, [...OPEN_STATES]);
		// Cancel first: a deleted booking whose start has come is recorded as cancelled, not expired.
		const deleted = db.select({ id: booking.id }).from(booking).where(isNotNull(booking.deletedAt));
		db.update(outbox)
			.set({ state: 'cancelled', outcomeAt: now })
			.where(and(open, inArray(outbox.bookingId, deleted)))
			.run();

		const started = db
			.select({ id: booking.id })
			.from(booking)
			.where(lte(booking.startAt, now));
		db.update(outbox)
			.set({ state: 'expired', outcomeAt: now })
			.where(and(open, inArray(outbox.bookingId, started)))
			.run();

		// Once the keybox row is in flight, retrying or finished, no heat-change email goes out.
		const keyboxDone = db
			.select({ id: outbox.bookingId })
			.from(outbox)
			.where(and(eq(outbox.kind, 'keybox'), inArray(outbox.state, HEAT_MAIL_ENDED_STATES)));
		db.update(outbox)
			.set({ state: 'cancelled', outcomeAt: now })
			.where(and(open, eq(outbox.kind, 'heat_change'), inArray(outbox.bookingId, keyboxDone)))
			.run();

		const kindRank = sql.join(
			[sql`CASE ${outbox.kind}`, ...KIND_ORDER.map((k, i) => sql`WHEN ${k} THEN ${i}`), sql`END`],
			sql` `
		);
		const keybox = getKeyboxSettings(db);
		// The confirmation goes first: a keybox or heat-change row waits while its booking's
		// confirmation is still open or in flight, even when a retry moved the confirmation's due time
		// past the row's.
		const awaitingConfirmation = new Set(
			db
				.select({ bookingId: outbox.bookingId })
				.from(outbox)
				.where(and(eq(outbox.kind, 'confirmation'), inArray(outbox.state, [...OPEN_STATES, 'in_flight'])))
				.all()
				.map((row) => row.bookingId)
		);
		const candidates = db
			.select({
				id: outbox.id,
				bookingId: outbox.bookingId,
				kind: outbox.kind,
				state: outbox.state,
				attempts: outbox.attempts,
				noticeAtBooking: booking.noticeAtBooking,
				lastToldNotice: booking.lastToldNotice,
				locale: booking.locale
			})
			.from(outbox)
			.innerJoin(booking, eq(booking.id, outbox.bookingId))
			.where(and(open, lte(outbox.dueAt, now), inArray(outbox.kind, [...SENDABLE_KINDS])))
			.orderBy(outbox.dueAt, kindRank, outbox.id)
			.all();

		for (const due of candidates) {
			if (due.kind !== 'confirmation' && awaitingConfirmation.has(due.bookingId)) continue;
			if (due.kind === 'keybox' && missingKeyboxSetting(keybox, due.locale) !== null) {
				// A retrying row is held like a fresh one: back to `pending`, so heat changes go through again.
				if (due.state === 'transient_failure') holdKeyboxRow(due.id, due.bookingId, now, db);
				continue;
			}

			let snapshot: Omit<ClaimedRow, 'id' | 'bookingId' | 'kind' | 'claimedAt' | 'attempts'>;
			if (due.kind === 'heat_change') {
				// The recheck (AD-6): only a change still worth an email against the last-told notice is sent.
				const current = currentNotice(due.bookingId, db);
				let classification: ReturnType<typeof classifyHeatChange>;
				try {
					classification =
						due.lastToldNotice === null || current === null
							? 'none'
							: classifyHeatChange(parseNotice(due.lastToldNotice), parseNotice(current));
				} catch {
					// A broken stored notice must not stall the drain: this row is dropped, the rest go on.
					db.update(outbox)
						.set({ state: 'cancelled', reason: 'invalid_notice', outcomeAt: now })
						.where(eq(outbox.id, due.id))
						.run();
					continue;
				}
				if (classification === 'none') {
					db.update(outbox).set({ state: 'cancelled', outcomeAt: now }).where(eq(outbox.id, due.id)).run();
					continue;
				}
				snapshot = {
					snapshotNotice: current,
					snapshotKeyboxCode: null,
					snapshotLocale: due.locale,
					snapshotLastTold: due.lastToldNotice,
					snapshotUrgent: classification === 'urgent'
				};
			} else {
				const isKeybox = due.kind === 'keybox';
				snapshot = {
					// The keybox notice is the current one; without one, the notice at booking stands in.
					snapshotNotice: isKeybox ? (currentNotice(due.bookingId, db) ?? due.noticeAtBooking) : due.noticeAtBooking,
					snapshotKeyboxCode: isKeybox ? keybox.code : null,
					snapshotLocale: due.locale,
					snapshotLastTold: null,
					snapshotUrgent: null
				};
				// From the keybox claim on, the keybox email is what counts.
				if (isKeybox) cancelOpenHeatChanges(due.bookingId, now, db);
			}
			const attempts = due.attempts + 1;
			db.update(outbox)
				.set({ state: 'in_flight', claimedAt: now, attempts, ...snapshot })
				.where(eq(outbox.id, due.id))
				.run();
			return {
				ok: true,
				code: 'claimed',
				row: { id: due.id, bookingId: due.bookingId, kind: due.kind, claimedAt: now, attempts, ...snapshot }
			};
		}
		// The end of the drain: a failure whose retries ended otherwise must not stick.
		clearRecoveredSendFailure(db);
		return { ok: false, code: 'none' };
	});
	return run.immediate();
}

/**
 * The send side of the heartbeat (Story 2.5), inside the outcome's transaction: a transient failure
 * starts `failing_since` unless it is already set; an accepted send clears it. A refusal leaves it
 * alone: a refused recipient is not an outage. Without a heartbeat row (the worker has not beaten
 * yet) nothing is written: no row already reads `stale`. The drain's last claim also clears it once
 * no row is left retrying (`clearRecoveredSendFailure`).
 */
function recordSendHealth(outcome: SendOutcome, now: Instant, db: Db): void {
	if (outcome === 'transient_failure') {
		db.update(workerHeartbeat)
			.set({ failingSince: now })
			.where(and(eq(workerHeartbeat.id, 1), isNull(workerHeartbeat.failingSince)))
			.run();
	} else if (outcome === 'accepted') {
		db.update(workerHeartbeat).set({ failingSince: null }).where(eq(workerHeartbeat.id, 1)).run();
	}
}

/**
 * Clears `failing_since` when no outbox row is left in `transient_failure`: the retries ended
 * otherwise (expired, cancelled, superseded, refused, held), so the failure must not stick.
 */
function clearRecoveredSendFailure(db: Db): void {
	const retrying = db.select({ id: outbox.id }).from(outbox).where(eq(outbox.state, 'transient_failure')).limit(1).get();
	if (!retrying) {
		db.update(workerHeartbeat).set({ failingSince: null }).where(isNotNull(workerHeartbeat.failingSince)).run();
	}
}

/**
 * Returns a keybox row to `pending`, held, and enqueues the booking's heat changes again against the
 * last-told notice (Story 2.5): its claim cancelled the open heat-change rows, and a retrying keybox
 * row blocked them. A held (`pending`) keybox row lets heat changes through. Inside the caller's
 * transaction; returns what the heat-change helper did.
 */
function holdKeyboxRow(id: number, bookingId: number, now: Instant, db: Db): HeatChangeAction {
	db.update(outbox).set({ state: 'pending', claimedAt: null }).where(eq(outbox.id, id)).run();
	return enqueueHeatChanges([bookingId], { now, db })[0].action;
}

/**
 * Records a send's outcome on an `in_flight` row. A transient failure is due again after the
 * backoff. `reason` is `smtp <code>` or an error code, never the server's text. An accepted keybox
 * or heat-change row of a live booking also writes the booking's `last_told_notice` from its snapshot, in the
 * same transaction, and the outcome updates the heartbeat's `failing_since` (`recordSendHealth`).
 * Any other state: nothing is written.
 */
export function recordSendOutcome(
	id: number,
	outcome: SendOutcome,
	reason: string | null,
	options: Options = {}
): OutcomeResult {
	const { db, now } = resolve(options);
	const run = db.$client.transaction((): OutcomeResult => {
		const row = db
			.select({
				state: outbox.state,
				attempts: outbox.attempts,
				kind: outbox.kind,
				bookingId: outbox.bookingId,
				snapshotNotice: outbox.snapshotNotice,
				deletedAt: booking.deletedAt
			})
			.from(outbox)
			.innerJoin(booking, eq(booking.id, outbox.bookingId))
			.where(eq(outbox.id, id))
			.get();
		if (!row || row.state !== 'in_flight') return { ok: false, code: 'not_in_flight' };
		recordSendHealth(outcome, now, db);
		if (outcome === 'transient_failure' && row.kind === 'heat_change' && hasOtherOpenHeatChange(row.bookingId, id, db)) {
			db.update(outbox).set({ state: 'cancelled', reason, outcomeAt: now }).where(eq(outbox.id, id)).run();
			return { ok: true, code: 'superseded' };
		}
		const dueAt = outcome === 'transient_failure' ? retryAt(row.attempts, now) : undefined;
		db.update(outbox)
			.set({
				state: outcome,
				reason: outcome === 'accepted' ? null : reason,
				outcomeAt: now,
				...(dueAt ? { dueAt } : {})
			})
			.where(eq(outbox.id, id))
			.run();
		// A deleted booking's outcome writes the row only.
		const tells = row.kind === 'keybox' || row.kind === 'heat_change';
		if (outcome === 'accepted' && tells && row.deletedAt === null && row.snapshotNotice !== null) {
			db.update(booking).set({ lastToldNotice: row.snapshotNotice }).where(eq(booking.id, row.bookingId)).run();
		}
		return dueAt ? { ok: true, code: outcome, dueAt } : { ok: true, code: outcome };
	});
	return run.immediate();
}

/**
 * Cancels an `in_flight` row whose booking was deleted after the claim: the worker found the
 * deletion at send time and sent nothing. A row of a live booking, or one not in flight, is left alone.
 */
export function cancelInFlightOfDeleted(
	id: number,
	options: Options = {}
): { ok: true; code: 'cancelled' } | { ok: false; code: 'not_in_flight' | 'not_deleted' } {
	const { db, now } = resolve(options);
	const run = db.$client.transaction(() => {
		const row = db
			.select({ state: outbox.state, deletedAt: booking.deletedAt })
			.from(outbox)
			.innerJoin(booking, eq(booking.id, outbox.bookingId))
			.where(eq(outbox.id, id))
			.get();
		if (!row || row.state !== 'in_flight') return { ok: false as const, code: 'not_in_flight' as const };
		if (row.deletedAt === null) return { ok: false as const, code: 'not_deleted' as const };
		db.update(outbox).set({ state: 'cancelled', outcomeAt: now }).where(eq(outbox.id, id)).run();
		return { ok: true as const, code: 'cancelled' as const };
	});
	return run.immediate();
}

/**
 * Returns an `in_flight` keybox row to `pending` when a setting it needs was unset between the claim
 * and the send: it is held again and goes out once the setting is fixed (or expires at the start).
 * The attempt count stays. The keybox claim cancelled the booking's open heat-change rows, so heat
 * changes are enqueued again (`holdKeyboxRow`, Story 2.5); `heatChange` says what that did. Any
 * other row is left alone.
 */
export function releaseHeldKeybox(
	id: number,
	options: Options = {}
): { ok: true; code: 'held'; heatChange: HeatChangeAction } | { ok: false; code: 'not_in_flight' } {
	const { db, now } = resolve(options);
	const run = db.$client.transaction(() => {
		const row = db
			.select({ state: outbox.state, kind: outbox.kind, bookingId: outbox.bookingId })
			.from(outbox)
			.where(eq(outbox.id, id))
			.get();
		if (!row || row.state !== 'in_flight' || row.kind !== 'keybox') {
			return { ok: false as const, code: 'not_in_flight' as const };
		}
		const heatChange = holdKeyboxRow(id, row.bookingId, now, db);
		return { ok: true as const, code: 'held' as const, heatChange };
	});
	return run.immediate();
}

/** The worker's heartbeat: the one row's `beat_at` becomes `now` (the worker ran a tick); `failing_since` is kept. */
export function recordHeartbeat(options: Options = {}): { ok: true; code: 'recorded' } {
	const { db, now } = resolve(options);
	const run = db.$client.transaction(() => {
		db.insert(workerHeartbeat)
			.values({ id: 1, beatAt: now })
			.onConflictDoUpdate({ target: workerHeartbeat.id, set: { beatAt: now } })
			.run();
		return { ok: true as const, code: 'recorded' as const };
	});
	return run.immediate();
}
