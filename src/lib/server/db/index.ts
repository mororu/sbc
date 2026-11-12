// The SQLite connection. Importable only by src/lib/server/commands and src/lib/server/db/queries
// (AD-2); the boot-time migration in hooks.server.ts is the one other user.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getEnv } from '../env.ts';
import * as schema from './schema.ts';

/** How long a writer waits for the lock before SQLITE_BUSY (AD-18). */
export const BUSY_TIMEOUT_MS = 5000;

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens a SQLite file in WAL mode with a busy timeout and foreign keys on. */
export function openDatabase(path: string): Database.Database {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	const mode = sqlite.pragma('journal_mode = WAL', { simple: true });
	if (path !== ':memory:' && mode !== 'wal') {
		sqlite.close();
		throw new Error(`SQLite at ${path} could not switch to WAL mode (got "${mode}").`);
	}
	sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

export function createDb(sqlite: Database.Database): Db {
	// Same casing as drizzle.config.ts: camelCase keys in schema.ts map to snake_case columns.
	return drizzle(sqlite, { schema, casing: 'snake_case' });
}

let cached: Db | undefined;

/** The app's database, opened on first use at DATABASE_PATH. */
export function getDb(): Db {
	cached ??= createDb(openDatabase(getEnv().databasePath));
	return cached;
}
