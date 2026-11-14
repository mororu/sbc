// Outbox commands (AD-23), each one BEGIN IMMEDIATE transaction, run by the worker only. They move a
// row through its lifecycle: claim (`pending`/`transient_failure` → `in_flight`, freezing the
// snapshot), outcome (`in_flight` → `accepted`/`refused`/`transient_failure`), expiry at the start
// time, cancellation for a deleted booking, and the per-tick release of stale claims.
// Only an accepted keybox row of a live booking writes `last_told_notice`, from its snapshot; an
// accepted confirmation leaves it unchanged (AD-24).
import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { isStale, KIND_ORDER, missingKeyboxSetting, retryAt, type OutboxKind } from '#lib/domain/index.ts';
import type { Instant, Locale } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { currentNotice, getKeyboxSettings } from '../db/queries/index.ts';
import { booking, outbox, workerHeartbeat } from '../db/schema.ts';

type Options = { now?: Instant; db?: Db };

/** The kinds the worker sends so far; Story 2.3 adds `heat_change` here. */
export const SENDABLE_KINDS: readonly OutboxKind[] = ['confirmation', 'keybox'];

const OPEN_STATES = ['pending', 'transient_failure'] as const;

/** A claimed row: what the worker needs to render and send it. */
export type ClaimedRow = {
	id: number;
	bookingId: number;
	kind: OutboxKind;
	claimedAt: Instant;
	attempts: number;
	/**
	 * Canonical Notice JSON frozen at claim: the notice at booking for a confirmation, the current
	 * notice for a keybox row. Null for a booking made before notices were stored.
	 */
	snapshotNotice: string | null;
	/** The trimmed keybox code frozen at claim: the record of what was sent. Null for other kinds. */
	snapshotKeyboxCode: string | null;
	snapshotLocale: Locale;
};

export type ClaimResult = { ok: true; code: 'claimed'; row: ClaimedRow } | { ok: false; code: 'none' };

export type SendOutcome = 'accepted' | 'refused' | 'transient_failure';

export type OutcomeResult =
	/** `dueAt`: the next attempt, for a transient failure. */
	| { ok: true; code: SendOutcome; dueAt?: Instant }
	| { ok: false; code: 'not_in_flight' };

function resolve(options: Options) {
	return { db: options.db ?? getDb(), now: options.now ?? clockNow() };
}

/**
 * Every tick: `in_flight` rows claimed at least the in-flight timeout ago go back to `pending`.
 * Delivery is at-least-once (AD-23): a released row may be resent even though the server had
 * already accepted it, e.g. when the process died between the send and the outcome.
 */
export function releaseStaleClaims(options: Options = {}): { ok: true; code: 'released'; count: number } {
	const { db, now } = resolve(options);
	const run = db.$client.transaction(() => {
		const stale = db
			.select({ id: outbox.id, claimedAt: outbox.claimedAt })
			.from(outbox)
			.where(eq(outbox.state, 'in_flight'))
			.all()
			.filter((row) => row.claimedAt !== null && isStale(row.claimedAt, now))
			.map((row) => row.id);
		if (stale.length > 0) {
			db.update(outbox).set({ state: 'pending', claimedAt: null }).where(inArray(outbox.id, stale)).run();
		}
		return { ok: true as const, code: 'released' as const, count: stale.length };
	});
	return run.immediate();
}

/**
 * In one transaction: open rows of deleted bookings are cancelled, open rows of bookings whose
 * start has come expire, then the first due open row of a sendable kind is claimed, by due time,
 * kind and id. A keybox row whose code or instructions in the booking's locale are unset is held:
 * skipped, left `pending`, and the next due row is claimed instead (the worker logs held rows). A
 * keybox row also waits while its booking's confirmation is open or in flight. The claim freezes the snapshot: for a confirmation the notice at booking and the
 * locale; for a keybox row the current notice (or the notice at booking when there is none), the
 * trimmed code and the locale.
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

		const kindRank = sql.join(
			[sql`CASE ${outbox.kind}`, ...KIND_ORDER.map((k, i) => sql`WHEN ${k} THEN ${i}`), sql`END`],
			sql` `
		);
		const keybox = getKeyboxSettings(db);
		// The confirmation goes first: a keybox row waits while its booking's confirmation is still
		// open or in flight, even when a retry moved the confirmation's due time past the keybox row's.
		const awaitingConfirmation = new Set(
			db
				.select({ bookingId: outbox.bookingId })
				.from(outbox)
				.where(and(eq(outbox.kind, 'confirmation'), inArray(outbox.state, [...OPEN_STATES, 'in_flight'])))
				.all()
				.map((row) => row.bookingId)
		);
		const due = db
			.select({
				id: outbox.id,
				bookingId: outbox.bookingId,
				kind: outbox.kind,
				attempts: outbox.attempts,
				noticeAtBooking: booking.noticeAtBooking,
				locale: booking.locale
			})
			.from(outbox)
			.innerJoin(booking, eq(booking.id, outbox.bookingId))
			.where(and(open, lte(outbox.dueAt, now), inArray(outbox.kind, [...SENDABLE_KINDS])))
			.orderBy(outbox.dueAt, kindRank, outbox.id)
			.all()
			.find(
				(row) =>
					row.kind !== 'keybox' ||
					(!awaitingConfirmation.has(row.bookingId) && missingKeyboxSetting(keybox, row.locale) === null)
			);
		if (!due) return { ok: false, code: 'none' };

		const isKeybox = due.kind === 'keybox';
		const snapshot = {
			// The keybox notice is the current one; without one, the notice at booking stands in.
			snapshotNotice: isKeybox ? (currentNotice(due.bookingId, db) ?? due.noticeAtBooking) : due.noticeAtBooking,
			snapshotKeyboxCode: isKeybox ? keybox.code : null,
			snapshotLocale: due.locale
		};
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
	});
	return run.immediate();
}

/**
 * Records a send's outcome on an `in_flight` row. A transient failure is due again after the
 * backoff. `reason` is `smtp <code>` or an error code, never the server's text. An accepted keybox
 * row of a live booking also writes the booking's `last_told_notice` from its snapshot, in the
 * same transaction. Any other state: nothing is written.
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
		if (outcome === 'accepted' && row.kind === 'keybox' && row.deletedAt === null && row.snapshotNotice !== null) {
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
 * The attempt count stays. Any other row is left alone.
 */
export function releaseHeldKeybox(
	id: number,
	options: Options = {}
): { ok: true; code: 'held' } | { ok: false; code: 'not_in_flight' } {
	const { db } = resolve(options);
	const run = db.$client.transaction(() => {
		const row = db.select({ state: outbox.state, kind: outbox.kind }).from(outbox).where(eq(outbox.id, id)).get();
		if (!row || row.state !== 'in_flight' || row.kind !== 'keybox') {
			return { ok: false as const, code: 'not_in_flight' as const };
		}
		db.update(outbox).set({ state: 'pending', claimedAt: null }).where(eq(outbox.id, id)).run();
		return { ok: true as const, code: 'held' as const };
	});
	return run.immediate();
}

/** The worker's heartbeat: the one row's `beat_at` becomes `now`. */
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
