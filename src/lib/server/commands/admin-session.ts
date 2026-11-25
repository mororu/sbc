// Admin sign-in, sessions and the password (AD-10, AD-11; FR-15; Story 3.1). Each write is one
// BEGIN IMMEDIATE transaction and returns `{ ok, code }`; nothing throws for an expected outcome.
// - signIn: the rate-limit gate, then argon2 verify outside any transaction (it is slow), then, in
//   the transaction, the hash re-read (a password set or reset meanwhile wins) and the session insert.
// - touchSession: a valid session (now < expires_at) moves to now + 30 days; an ended one is deleted.
// - signOut: deletes the session row.
// - setAdminPassword: stores a new argon2id hash; refused when one exists unless `reset`, which
//   also deletes every session (the recovery path for the CLI).
// - changeAdminPassword: the settings card (Story 3.7) replaces the hash and deletes every session
//   except the admin's own, so the other admins have to sign in again. If the own session is gone
//   meanwhile (another admin's change deleted it), it is `not_found` and writes nothing.
// The password is never logged, stored or returned. Logs name no guest.
import { eq, lte, ne } from 'drizzle-orm';
import { addMinutes, compareInstants, minutesBetween, type Instant } from '#lib/time/index.ts';
import {
	pruneSignInRecords,
	recordSignInFailure,
	signInGate,
	type SignInRecord
} from '#lib/domain/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getAdminPasswordHash } from '../db/queries/index.ts';
import { adminSession, setting } from '../db/schema.ts';
import { isRandomId, randomId } from '../ids.ts';
import { ARGON2ID_PREFIX, verifyPassword } from '../password.ts';

type Options = { now?: Instant; db?: Db };

/** A session lives this long after its last use. */
export const SESSION_TTL_MIN = 30 * 24 * 60;

function resolve(options: Options) {
	return { db: options.db ?? getDb(), now: options.now ?? clockNow() };
}

/**
 * The failed sign-ins per client address (FR-15). In memory: one app instance, and a restart
 * resets the counters (accepted in the story).
 */
const attempts = new Map<string, SignInRecord>();

/** At most this many records are kept: past it, expired ones go first, then the oldest. */
export const SIGN_IN_MAX_RECORDS = 10_000;

/** Stores `record` as the newest entry (Map order is recency) and keeps the map within its cap. */
function remember(address: string, record: SignInRecord, now: Instant): void {
	attempts.delete(address);
	attempts.set(address, record);
	if (attempts.size <= SIGN_IN_MAX_RECORDS) return;
	pruneNow(now);
	for (const oldest of attempts.keys()) {
		if (attempts.size <= SIGN_IN_MAX_RECORDS) break;
		attempts.delete(oldest);
	}
}

/** Puts back the record as it was before a try (none: deleted). */
function restore(address: string, previous: SignInRecord | undefined): void {
	if (previous) attempts.set(address, previous);
	else attempts.delete(address);
}

/** When the whole map was last pruned: at most once a minute, so a sign-in never scans it each time. */
let lastPruneAt: Instant | null = null;

function pruneNow(now: Instant): void {
	pruneSignInRecords(attempts, now);
	lastPruneAt = now;
}

/** Tests only: forget every recorded failure. */
export function resetSignInAttempts(): void {
	attempts.clear();
	lastPruneAt = null;
}

/** Tests only: the record of `address`, and how many records are kept. */
export function peekSignInAttempts(address: string): { record: SignInRecord | undefined; size: number } {
	return { record: attempts.get(address), size: attempts.size };
}

export type SignInResult =
	| { ok: true; code: 'signed_in'; sessionId: string; expiresAt: Instant }
	| { ok: false; code: 'invalid' }
	| { ok: false; code: 'rate_limited'; retryAt: Instant };

/**
 * Signs in with the shared password from client `address`. A wrong password, or none set yet, is
 * `invalid`; a try inside the wait after 5 failures is `rate_limited` and the password is not checked.
 */
export async function signIn(
	input: { password: string; address: string },
	options: Options = {}
): Promise<SignInResult> {
	const { db, now } = resolve(options);
	// An expired record never counts (signInGate); this only frees memory.
	if (lastPruneAt === null || Math.abs(minutesBetween(lastPruneAt, now)) >= 1) pruneNow(now);
	const gate = signInGate(attempts.get(input.address), now);
	if (!gate.allowed) return { ok: false, code: 'rate_limited', retryAt: gate.retryAt };
	// Counted before the slow verify, so tries sent in parallel cannot slip past the gate; a correct
	// password deletes the record again.
	const previous = attempts.get(input.address);
	remember(input.address, recordSignInFailure(previous, now), now);

	const digest = getAdminPasswordHash(db);
	if (digest === null) {
		console.warn('[admin] sign-in refused: no admin password is set. Run `npm run set-admin-password`.');
		return { ok: false, code: 'invalid' };
	}
	if (!(await verifyPassword(digest, input.password))) return { ok: false, code: 'invalid' };

	const run = db.$client.transaction((): SignInResult => {
		// The password was set or reset while verifying: the old one no longer signs in.
		if (getAdminPasswordHash(db) !== digest) return { ok: false, code: 'invalid' };
		// Ended sessions nobody came back with are cleared here, so the table does not grow.
		db.delete(adminSession).where(lte(adminSession.expiresAt, now)).run();
		const sessionId = randomId();
		const expiresAt = addMinutes(now, SESSION_TTL_MIN);
		db.insert(adminSession).values({ id: sessionId, createdAt: now, expiresAt }).run();
		return { ok: true, code: 'signed_in', sessionId, expiresAt };
	});
	let result: SignInResult;
	try {
		result = run.immediate();
	} catch (error) {
		// Nothing was decided (e.g. a lock timeout): the try does not count as a failure.
		restore(input.address, previous);
		throw error;
	}
	if (result.ok) attempts.delete(input.address);
	return result;
}

export type TouchSessionResult =
	| { ok: true; code: 'touched'; expiresAt: Instant }
	| { ok: false; code: 'not_found' };

/** Extends a valid session to now + 30 days; an unknown or ended one is `not_found` (and deleted). */
export function touchSession(sessionId: string, options: Options = {}): TouchSessionResult {
	if (!isRandomId(sessionId)) return { ok: false, code: 'not_found' };
	const { db, now } = resolve(options);
	const run = db.$client.transaction((): TouchSessionResult => {
		const row = db
			.select({ expiresAt: adminSession.expiresAt })
			.from(adminSession)
			.where(eq(adminSession.id, sessionId))
			.get();
		if (!row) return { ok: false, code: 'not_found' };
		if (compareInstants(now, row.expiresAt) >= 0) {
			db.delete(adminSession).where(eq(adminSession.id, sessionId)).run();
			return { ok: false, code: 'not_found' };
		}
		const expiresAt = addMinutes(now, SESSION_TTL_MIN);
		db.update(adminSession).set({ expiresAt }).where(eq(adminSession.id, sessionId)).run();
		return { ok: true, code: 'touched', expiresAt };
	});
	return run.immediate();
}

/** Ends a session. Signing out of an unknown session is fine too. */
export function signOut(sessionId: string, options: Options = {}): { ok: true; code: 'signed_out' } {
	const { db } = resolve(options);
	const run = db.$client.transaction(() => {
		db.delete(adminSession).where(eq(adminSession.id, sessionId)).run();
	});
	run.immediate();
	return { ok: true, code: 'signed_out' };
}

export type SetAdminPasswordResult =
	/** `replaced`: a hash existed before (only possible with `reset`). */
	| { ok: true; code: 'set'; replaced: boolean; sessionsDeleted: number }
	| { ok: false; code: 'conflict' | 'invalid' };

/**
 * Stores `hash` (an argon2id PHC string, never a password) as the admin password. `conflict` when a
 * hash exists and `reset` is false; `reset` also deletes every session.
 */
export function setAdminPassword(
	input: { hash: string; reset: boolean },
	options: Options = {}
): SetAdminPasswordResult {
	if (!input.hash.startsWith(ARGON2ID_PREFIX)) return { ok: false, code: 'invalid' };
	const { db } = resolve(options);
	const run = db.$client.transaction((): SetAdminPasswordResult => {
		const replaced = getAdminPasswordHash(db) !== null;
		if (replaced && !input.reset) return { ok: false, code: 'conflict' };
		const updated = db.update(setting).set({ adminPasswordHash: input.hash }).where(eq(setting.id, 1)).run();
		if (updated.changes !== 1) throw new Error('The setting row is missing');
		const sessionsDeleted = input.reset ? db.delete(adminSession).run().changes : 0;
		return { ok: true, code: 'set', replaced, sessionsDeleted };
	});
	return run.immediate();
}

export type ChangeAdminPasswordResult = { ok: true; sessionsDeleted: number } | { ok: false; code: 'invalid' | 'not_found' };

/**
 * The password card (FR-15; Story 3.7): stores `hash` (an argon2id PHC string, hashed by the caller
 * outside the transaction, never a password) and deletes every admin session except
 * `keepSessionId`, the admin's own. A hash that is not argon2id is `invalid`; an own session that
 * no longer exists (another admin changed the password first) is `not_found`. Both change nothing.
 */
export function changeAdminPassword(
	input: { hash: string; keepSessionId: string },
	options: Options = {}
): ChangeAdminPasswordResult {
	if (typeof input.hash !== 'string' || !input.hash.startsWith(ARGON2ID_PREFIX)) return { ok: false, code: 'invalid' };
	const { db } = resolve(options);
	const run = db.$client.transaction((): ChangeAdminPasswordResult => {
		const own = db.select({ id: adminSession.id }).from(adminSession).where(eq(adminSession.id, input.keepSessionId)).get();
		if (!own) return { ok: false, code: 'not_found' };
		const updated = db.update(setting).set({ adminPasswordHash: input.hash }).where(eq(setting.id, 1)).run();
		if (updated.changes !== 1) throw new Error('The setting row is missing');
		const sessionsDeleted = db.delete(adminSession).where(ne(adminSession.id, input.keepSessionId)).run().changes;
		return { ok: true, sessionsDeleted };
	});
	return run.immediate();
}
