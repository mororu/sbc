// Story 3.1 matrix, CLI rows: `npm run set-admin-password` as a child process on a temp database,
// the password piped on stdin.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, openDatabase } from '#lib/server/db/index.ts';
import { applyMigrations } from '#lib/server/db/migrate.ts';

const PASSWORD = 'correct horse battery';
let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-cli-'));
	path = join(dir, 'app.sqlite');
	// The app has run once: the database exists and is migrated.
	const sqlite = openDatabase(path);
	applyMigrations(createDb(sqlite));
	sqlite.close();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const cli = (input: string, args: string[] = []) => {
	const result = spawnSync(process.execPath, ['scripts/set-admin-password.ts', ...args], {
		input,
		encoding: 'utf8',
		env: { ...process.env, NODE_ENV: 'development', DATABASE_PATH: path, GUEST_KEY_SECRET: 'dev-only-test' }
	});
	return { status: result.status, out: result.stdout + result.stderr, stdout: result.stdout };
};

const query = <T>(sql: string): T => {
	const db = new Database(path, { readonly: true });
	try {
		return db.prepare(sql).get() as T;
	} finally {
		db.close();
	}
};
const storedHash = () => query<{ h: string | null }>('select admin_password_hash as h from setting').h;
const sessionCount = () => query<{ n: number }>('select count(*) as n from admin_session').n;

describe('set-admin-password', { timeout: 20_000 }, () => {
	it('stores only an argon2id hash and confirms without the password', () => {
		const result = cli(`${PASSWORD}\n`);
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('Admin password set.\n');
		expect(result.out).not.toContain(PASSWORD);
		expect(storedHash()).toMatch(/^\$argon2id\$/);
		expect(storedHash()).not.toContain(PASSWORD);
	});

	it.each([
		['an empty password', ''],
		['11 characters', 'a'.repeat(11)]
	])('refuses %s, storing nothing', (_label, input) => {
		const result = cli(`${input}\n`);
		expect(result.status).toBe(1);
		expect(result.out).toContain('at least 12 characters');
		expect(storedHash()).toBeNull();
	});

	it('refuses to replace a password without --reset', () => {
		cli(PASSWORD);
		const before = storedHash();
		const result = cli('another long password');
		expect(result.status).toBe(1);
		expect(result.out).toContain('--reset');
		expect(result.out).not.toContain('another long password');
		expect(storedHash()).toBe(before);
	});

	it('replaces it with --reset and deletes every session', () => {
		cli(PASSWORD);
		const before = storedHash();
		const db = new Database(path);
		db.prepare("insert into admin_session values ('a', '2027-01-12T09:00:00Z', '2027-02-11T09:00:00Z'), ('b', '2027-01-12T09:00:00Z', '2027-02-11T09:00:00Z')").run();
		db.close();
		const result = cli('another long password\n', ['--reset']);
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('Admin password replaced. Signed out sessions: 2.\n');
		expect(storedHash()).toMatch(/^\$argon2id\$/);
		expect(storedHash()).not.toBe(before);
		expect(sessionCount()).toBe(0);
	});

	it('migrates a database the app has not created yet', () => {
		rmSync(path);
		expect(cli(PASSWORD).status).toBe(0);
		expect(storedHash()).toMatch(/^\$argon2id\$/);
	});

	it('refuses a password passed as an argument, storing nothing', () => {
		const result = cli('', [PASSWORD]);
		expect(result.status).toBe(1);
		expect(result.out).not.toContain(PASSWORD);
		expect(storedHash()).toBeNull();
	});

	it.each([
		['a line break inside', `${PASSWORD}\n${PASSWORD}`],
		['a bell character', `${PASSWORD}\u0007`],
		['a carriage return inside', `${PASSWORD}\rx`],
		['a C1 control', `${PASSWORD}\u0085x`]
	])('refuses a password with %s, storing nothing', (_label, input) => {
		const result = cli(`${input}\n`);
		expect(result.status).toBe(1);
		expect(result.out).toContain('control character');
		expect(storedHash()).toBeNull();
	});

	it('drops one trailing Windows line ending, like a plain one', () => {
		expect(cli(`${PASSWORD}\r\n`).status).toBe(0);
	});

	it('says set, not replaced, for --reset on a database without a password', () => {
		const result = cli(PASSWORD, ['--reset']);
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('Admin password set.\n');
	});

	it('prints a short line, no stack trace, when the database cannot be written', () => {
		const db = new Database(path);
		db.exec('drop table setting');
		db.close();
		const result = cli(PASSWORD);
		expect(result.status).toBe(1);
		expect(result.out).toBe('The password could not be stored.\nNothing was stored.\n');
	});
});
