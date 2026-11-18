// Outbox timings (AD-23), owned by the worker: the drain order, the in-flight timeout and the retry
// backoff. Pure: `now` is always a parameter.
import { addMinutes, minutesBetween, type Instant } from '#lib/time/index.ts';

/** Drain order within one due time: the confirmation before the keybox email before a heat change. */
export const KIND_ORDER = ['confirmation', 'keybox', 'heat_change'] as const;
export type OutboxKind = (typeof KIND_ORDER)[number];

/** The outbox row states (AD-23): the schema's `OUTBOX_STATES` must match. */
export const OUTBOX_STATE_LIST = [
	'pending',
	'in_flight',
	'accepted',
	'refused',
	'transient_failure',
	'expired',
	'cancelled'
] as const;
export type OutboxState = (typeof OUTBOX_STATE_LIST)[number];

/** A heat-change row is due this many minutes after the last change, so a burst of changes settles into one email. */
export const SETTLE_DELAY_MIN = 10;

/** A keybox row still not accepted this many minutes after its original due time makes the booking call required (Story 2.4). */
export const KEYBOX_OVERDUE_MIN = 15;

/**
 * A keybox row is overdue at the latest this many minutes before the start (never before it was
 * due), so a booking made shortly before its start is on the call list before it drops off at the start.
 */
export const KEYBOX_OVERDUE_BEFORE_START_MIN = 5;

/**
 * An urgent heat-change row still not sent this many minutes before the earliest possible arrival
 * (the start minus the pre-heat maximum) makes the booking call required (Story 2.5): 60 minutes
 * before the start with the default 30–40 minute pre-heat window.
 */
export const WARNING_OVERDUE_MARGIN_MIN = 20;

/** An `in_flight` row claimed this many minutes ago or longer is stale: boot returns it to `pending`. */
export const IN_FLIGHT_TIMEOUT_MIN = 10;

/** Minutes to wait after the 1st, 2nd, 3rd and 4th failed attempt; every later one waits the last step. */
export const RETRY_BACKOFF_MIN = [1, 2, 5, 10] as const;
export const RETRY_BACKOFF_MAX_MIN = 15;

/** When a row that failed transiently is due again, after `attempts` claims (1 for the first send). */
export function retryAt(attempts: number, now: Instant): Instant {
	const step = RETRY_BACKOFF_MIN[Math.max(attempts, 1) - 1] ?? RETRY_BACKOFF_MAX_MIN;
	return addMinutes(now, step);
}

/** True when a claim made at `claimedAt` is at least the in-flight timeout old at `now`. */
export function isStale(claimedAt: Instant, now: Instant): boolean {
	return minutesBetween(claimedAt, now) >= IN_FLIGHT_TIMEOUT_MIN;
}
