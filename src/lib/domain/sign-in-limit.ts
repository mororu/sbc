// Sign-in rate limit (FR-15; Story 3.1): per client address, from the 5th wrong password on, the
// next try is allowed only 60 seconds after the last failure, until a correct password deletes the
// record. Records are dropped 15 minutes after their last failure. The map itself lives in the
// sign-in command (in memory, one app instance; a restart resets it). Pure: `now` is a parameter.
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';

/** Wrong passwords allowed back to back before the wait starts. */
export const SIGN_IN_FREE_FAILURES = 5;

/** From the 5th failure on: minutes between the last failure and the next allowed try. */
export const SIGN_IN_WAIT_MIN = 1;

/** A record is dropped this many minutes after its last failure. */
export const SIGN_IN_RECORD_TTL_MIN = 15;

/** One client address's failures in a row and the time of the last one. */
export type SignInRecord = { failures: number; lastFailureAt: Instant };

export type SignInGate = { allowed: true } | { allowed: false; retryAt: Instant };

/** True once `record` is older than the TTL: it no longer counts and may be dropped. */
export function isRecordExpired(record: SignInRecord, now: Instant): boolean {
	return compareInstants(now, addMinutes(record.lastFailureAt, SIGN_IN_RECORD_TTL_MIN)) >= 0;
}

/**
 * Whether a try at `now` may check the password. Refused (with the time it is allowed again) once
 * the record has 5 or more failures and the last one is less than 60 seconds ago.
 */
export function signInGate(record: SignInRecord | undefined, now: Instant): SignInGate {
	if (!record || isRecordExpired(record, now) || record.failures < SIGN_IN_FREE_FAILURES) return { allowed: true };
	const retryAt = addMinutes(record.lastFailureAt, SIGN_IN_WAIT_MIN);
	return compareInstants(now, retryAt) >= 0 ? { allowed: true } : { allowed: false, retryAt };
}

/** The record after a failure at `now`: an expired record starts again from one. */
export function recordSignInFailure(record: SignInRecord | undefined, now: Instant): SignInRecord {
	const failures = record && !isRecordExpired(record, now) ? record.failures + 1 : 1;
	return { failures, lastFailureAt: now };
}

/** Deletes every expired record from `records`. */
export function pruneSignInRecords(records: Map<string, SignInRecord>, now: Instant): void {
	for (const [address, record] of records) {
		if (isRecordExpired(record, now)) records.delete(address);
	}
}
