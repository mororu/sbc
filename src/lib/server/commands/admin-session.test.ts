// Story 3.1 matrix, command rows: no hash, sign in, wrong, limit, expiry, sign out, password set and
// reset; Story 3.7 matrix "Password": the password card's change. A temp-file database; `now` is explicit (Tue 12 Jan 2027, 10:00 Zurich).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMinutes } from '#lib/time/index.ts';
import { createDb, openDatabase, type Db } from '../db/index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../db/migrate.ts';
import { hashPassword } from '../password.ts';
import {
	changeAdminPassword,
	peekSignInAttempts,
	resetSignInAttempts,
	SESSION_TTL_MIN,
	SIGN_IN_MAX_RECORDS,
	setAdminPassword,
	signIn,
	signOut,
	touchSession
} from './admin-session.ts';

const NOW = '2027-01-12T09:00:00Z';
const PASSWORD = 'correct horse battery';
let HASH: string;
let OTHER_HASH: string;

let dir: string;
let sqlite: Database.Database;
let db: Db;

beforeAll(async () => {
	HASH = await hashPassword(PASSWORD);
	OTHER_HASH = await hashPassword('another long password');
});

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-admin-'));
	sqlite = openDatabase(join(dir, 'app.sqlite'));
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	resetSignInAttempts();
});

afterEach(() => {
	vi.restoreAllMocks();
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
});

const sessions = () => sqlite.prepare('select id, created_at, expires_at from admin_session order by created_at').all();
const storedHash = () => (sqlite.prepare('select admin_password_hash as h from setting').get() as { h: string | null }).h;
const attempt = (password: string, at: string, address = '10.0.0.1') => signIn({ password, address }, { now: at, db });
const at = (hhmmss: string) => `2027-01-12T09:${hhmmss}Z`;

describe('setAdminPassword', () => {
	it('stores a hash when none is set', () => {
		expect(setAdminPassword({ hash: HASH, reset: false }, { db })).toEqual({ ok: true, code: 'set', replaced: false, sessionsDeleted: 0 });
		expect(storedHash()).toBe(HASH);
		expect(HASH.startsWith('$argon2id$')).toBe(true);
	});

	it('refuses to replace a hash without reset, storing nothing', () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		expect(setAdminPassword({ hash: OTHER_HASH, reset: false }, { db })).toEqual({ ok: false, code: 'conflict' });
		expect(storedHash()).toBe(HASH);
	});

	it('replaces the hash on reset and deletes every session', async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		await attempt(PASSWORD, NOW, 'a');
		await attempt(PASSWORD, NOW, 'b');
		expect(sessions()).toHaveLength(2);
		expect(setAdminPassword({ hash: OTHER_HASH, reset: true }, { db })).toEqual({ ok: true, code: 'set', replaced: true, sessionsDeleted: 2 });
		expect(storedHash()).toBe(OTHER_HASH);
		expect(sessions()).toEqual([]);
	});

	it('says a reset on a fresh database set, not replaced, a password', () => {
		expect(setAdminPassword({ hash: HASH, reset: true }, { db })).toEqual({ ok: true, code: 'set', replaced: false, sessionsDeleted: 0 });
	});

	it('refuses anything that is not an argon2id hash', () => {
		expect(setAdminPassword({ hash: PASSWORD, reset: false }, { db })).toEqual({ ok: false, code: 'invalid' });
		expect(storedHash()).toBeNull();
	});
});

describe('signIn', () => {
	beforeEach(() => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
	});

	it('creates a session for the correct password, expiring 30 days later', async () => {
		const result = await attempt(PASSWORD, NOW);
		expect(result).toMatchObject({ ok: true, code: 'signed_in', expiresAt: '2027-02-11T09:00:00Z' });
		if (!result.ok) throw new Error('not signed in');
		expect(result.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(sessions()).toEqual([{ id: result.sessionId, created_at: NOW, expires_at: '2027-02-11T09:00:00Z' }]);
	});

	it('refuses a wrong password without a session or the password in the result', async () => {
		const result = await attempt('wrong password!!', NOW);
		expect(result).toEqual({ ok: false, code: 'invalid' });
		expect(sessions()).toEqual([]);
	});

	it('refuses after the password was reset during the verify', async () => {
		const pending = attempt(PASSWORD, NOW);
		setAdminPassword({ hash: OTHER_HASH, reset: true }, { db });
		expect(await pending).toEqual({ ok: false, code: 'invalid' });
		expect(sessions()).toEqual([]);
	});

	it('refuses the 6th try inside the minute without checking it, then allows one per minute', async () => {
		for (const t of ['00:00', '00:05', '00:10', '00:15', '00:20']) {
			expect(await attempt('wrong password!!', at(t))).toEqual({ ok: false, code: 'invalid' });
		}
		// Even the correct password is refused: it is not checked.
		expect(await attempt(PASSWORD, at('00:30'))).toEqual({ ok: false, code: 'rate_limited', retryAt: at('01:20') });
		expect(sessions()).toEqual([]);
		// Another address is not affected.
		expect(await attempt(PASSWORD, at('00:30'), '10.0.0.2')).toMatchObject({ ok: true });
		// At 10:01:20 the try is checked again.
		expect(await attempt('wrong password!!', at('01:20'))).toEqual({ ok: false, code: 'invalid' });
		expect(await attempt(PASSWORD, at('01:50'))).toEqual({ ok: false, code: 'rate_limited', retryAt: at('02:20') });
		expect(await attempt(PASSWORD, at('02:20'))).toMatchObject({ ok: true });
		// The correct password reset the counter: a wrong one right after does not lock again.
		expect(await attempt('wrong password!!', at('02:21'))).toEqual({ ok: false, code: 'invalid' });
		expect(await attempt(PASSWORD, at('02:22'))).toMatchObject({ ok: true });
	});

	it('counts parallel tries before verifying, so they cannot slip past the gate', async () => {
		const results = await Promise.all(Array.from({ length: 7 }, () => attempt('wrong password!!', NOW)));
		expect(results.filter((r) => r.code === 'rate_limited')).toHaveLength(2);
	});

	it('deletes ended sessions when someone signs in', async () => {
		sqlite.prepare("insert into admin_session values ('old', '2026-12-01T09:00:00Z', '2027-01-12T09:00:00Z'), ('live', '2026-12-20T09:00:00Z', '2027-01-19T09:00:00Z')").run();
		await attempt(PASSWORD, NOW);
		expect((sessions() as { id: string }[]).map((r) => r.id).sort()).toEqual(expect.arrayContaining(['live']));
		expect((sessions() as { id: string }[]).some((r) => r.id === 'old')).toBe(false);
		expect(sessions()).toHaveLength(2);
	});

	it('puts the failure record back when the session insert throws', async () => {
		await attempt('wrong password!!', at('00:00'));
		await attempt('wrong password!!', at('00:05'));
		const before = peekSignInAttempts('10.0.0.1').record;
		expect(before).toEqual({ failures: 2, lastFailureAt: at('00:05') });
		sqlite.exec('drop table admin_session');
		await expect(attempt(PASSWORD, at('00:10'))).rejects.toThrow(/admin_session/);
		expect(peekSignInAttempts('10.0.0.1').record).toEqual(before);
		// No record before: none after.
		await expect(attempt(PASSWORD, at('00:10'), 'fresh')).rejects.toThrow();
		expect(peekSignInAttempts('fresh').record).toBeUndefined();
	});

	it('forgets failures 15 minutes after the last one', async () => {
		for (const t of ['00:00', '00:05', '00:10', '00:15', '00:20']) await attempt('wrong password!!', at(t));
		expect(await attempt(PASSWORD, at('00:30'))).toMatchObject({ code: 'rate_limited' });
		expect(await attempt(PASSWORD, at('15:20'))).toMatchObject({ ok: true });
	});
});

describe('signIn without a password set', () => {
	it('fails as a wrong password and logs one line naming the CLI, never the password', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		expect(await attempt(PASSWORD, NOW)).toEqual({ ok: false, code: 'invalid' });
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0][0])).toContain('npm run set-admin-password');
		const logged = [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls].flat().join(' ');
		expect(logged).not.toContain(PASSWORD);
		expect(sessions()).toEqual([]);
	});
});

describe('the attempt map cap', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('evicts the oldest records past the cap', async () => {
		for (let i = 0; i <= SIGN_IN_MAX_RECORDS; i++) await attempt('x', NOW, `a${i}`);
		expect(peekSignInAttempts('a0')).toEqual({ record: undefined, size: SIGN_IN_MAX_RECORDS });
		expect(peekSignInAttempts('a1').record).toBeDefined();
		expect(peekSignInAttempts(`a${SIGN_IN_MAX_RECORDS}`).record).toBeDefined();
	});

	it('prunes expired records before evicting live ones', async () => {
		await attempt('x', NOW, 'expired');
		const later = '2027-01-12T09:20:00Z';
		for (let i = 0; i < SIGN_IN_MAX_RECORDS; i++) await attempt('x', later, `a${i}`);
		expect(peekSignInAttempts('expired')).toEqual({ record: undefined, size: SIGN_IN_MAX_RECORDS });
		expect(peekSignInAttempts('a0').record).toBeDefined();
	});
});

describe('touchSession', () => {
	let id: string;

	beforeEach(async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		const result = await attempt(PASSWORD, NOW);
		if (!result.ok) throw new Error('not signed in');
		id = result.sessionId;
	});

	it('keeps a session last used 30 days minus 1 second ago and extends it', () => {
		const almost = '2027-02-11T08:59:59Z';
		expect(touchSession(id, { now: almost, db })).toEqual({
			ok: true,
			code: 'touched',
			expiresAt: addMinutes(almost, SESSION_TTL_MIN)
		});
		expect(sessions()).toEqual([{ id, created_at: NOW, expires_at: '2027-03-13T08:59:59Z' }]);
	});

	it('ends a session last used 30 days ago and deletes it', () => {
		expect(touchSession(id, { now: '2027-02-11T09:00:00Z', db })).toEqual({ ok: false, code: 'not_found' });
		expect(sessions()).toEqual([]);
	});

	it('refuses an unknown or malformed id', () => {
		expect(touchSession('A'.repeat(22), { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(touchSession("x' or 1=1 --", { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(sessions()).toHaveLength(1);
	});
});

describe('signOut', () => {
	it('deletes the session row, and is fine for an unknown one', async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		const result = await attempt(PASSWORD, NOW);
		if (!result.ok) throw new Error('not signed in');
		expect(signOut(result.sessionId, { db })).toEqual({ ok: true, code: 'signed_out' });
		expect(sessions()).toEqual([]);
		expect(touchSession(result.sessionId, { now: NOW, db })).toEqual({ ok: false, code: 'not_found' });
		expect(signOut('unknown', { db })).toEqual({ ok: true, code: 'signed_out' });
	});
});

describe('changeAdminPassword (Story 3.7)', () => {
	const signedIn = async (at: string) => {
		const result = await signIn({ password: PASSWORD, address: '10.0.0.9' }, { now: at, db });
		if (!result.ok) throw new Error(result.code);
		return result.sessionId;
	};

	it('replaces the hash and deletes every other session, keeping the own one', async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		const own = await signedIn(NOW);
		const other = await signedIn(at('01:00'));
		const third = await signedIn(at('02:00'));
		expect(changeAdminPassword({ hash: OTHER_HASH, keepSessionId: own }, { db })).toEqual({ ok: true, sessionsDeleted: 2 });
		expect(storedHash()).toBe(OTHER_HASH);
		expect(sessions()).toEqual([expect.objectContaining({ id: own })]);
		// The others end: the guard sends them to sign in again ("Bitte melde dich wieder an.").
		expect(touchSession(other, { now: at('03:00'), db })).toEqual({ ok: false, code: 'not_found' });
		expect(touchSession(third, { now: at('03:00'), db })).toEqual({ ok: false, code: 'not_found' });
		expect(touchSession(own, { now: at('03:00'), db })).toMatchObject({ ok: true });
		// The new password signs in, the old one no longer does.
		expect(await attempt('another long password', at('04:00'))).toMatchObject({ ok: true });
		expect(await attempt(PASSWORD, at('05:00'))).toEqual({ ok: false, code: 'invalid' });
	});

	it('is not_found and writes nothing when the own session is already gone (another admin changed it first)', async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		const first = await signedIn(NOW);
		const second = await signedIn(at('01:00'));
		expect(changeAdminPassword({ hash: OTHER_HASH, keepSessionId: first }, { db })).toEqual({ ok: true, sessionsDeleted: 1 });
		const third = await signedIn(at('02:00')).catch(() => null);
		expect(third).toBeNull();
		expect(changeAdminPassword({ hash: HASH, keepSessionId: second }, { db })).toEqual({ ok: false, code: 'not_found' });
		expect(storedHash()).toBe(OTHER_HASH);
		expect(sessions()).toEqual([expect.objectContaining({ id: first })]);
	});

	it('refuses a hash that is not argon2id and changes nothing', async () => {
		setAdminPassword({ hash: HASH, reset: false }, { db });
		const own = await signedIn(NOW);
		await signedIn(at('01:00'));
		expect(changeAdminPassword({ hash: 'correct horse battery', keepSessionId: own }, { db })).toEqual({ ok: false, code: 'invalid' });
		expect(storedHash()).toBe(HASH);
		expect(sessions()).toHaveLength(2);
	});
});
