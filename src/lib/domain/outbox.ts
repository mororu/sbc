// Outbox timings (AD-23), owned by the worker: the drain order, the in-flight timeout and the retry
// backoff. Pure: `now` is always a parameter.
import { addMinutes, minutesBetween, type Instant } from '#lib/time/index.ts';

/** Drain order within one due time: the confirmation before the keybox email before a heat change. */
export const KIND_ORDER = ['confirmation', 'keybox', 'heat_change'] as const;
export type OutboxKind = (typeof KIND_ORDER)[number];

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
