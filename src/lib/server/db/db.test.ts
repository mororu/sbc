import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUSY_TIMEOUT_MS, createDb, openDatabase } from './index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from './migrate.ts';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-db-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
	it('creates the parent folder and sets WAL, busy timeout and foreign keys', () => {
		const sqlite = openDatabase(join(dir, 'nested', 'app.sqlite'));
		expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
		sqlite.close();
	});
});

describe('applyMigrations', () => {
	it('applies the committed migrations to a fresh database, and again without change', () => {
		const sqlite = openDatabase(join(dir, 'app.sqlite'));
		const db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		applyMigrations(db, MIGRATIONS_FOLDER);
		const rows = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as {
			n: number;
		};
		expect(rows.n).toBeGreaterThanOrEqual(1);
		sqlite.close();
	});

	it('fails with a clear message when the migrations folder is missing', () => {
		const db = createDb(openDatabase(':memory:'));
		expect(() => applyMigrations(db, join(dir, 'nowhere'))).toThrow(/No migrations found/);
	});

	it('throws when a migration fails, so boot aborts', () => {
		const folder = join(dir, 'migrations');
		cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
		writeFileSync(join(folder, '0000_baseline.sql'), 'THIS IS NOT SQL;');
		const db = createDb(openDatabase(':memory:'));
		expect(() => applyMigrations(db, folder)).toThrow();
	});
});
