// Applies the committed SQL migrations. Called once from hooks.server.ts `init`, before any request.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, type Db } from './index.ts';

/**
 * Relative to the app's working directory (the repo root in development). The production
 * image must ship this folder at the same path relative to where it starts the server.
 */
export const MIGRATIONS_FOLDER = 'src/lib/server/db/migrations';

export function applyMigrations(db: Db = getDb(), folder: string = MIGRATIONS_FOLDER): void {
	if (!existsSync(join(folder, 'meta', '_journal.json'))) {
		throw new Error(`No migrations found at ${resolve(folder)}. Start the app from its root folder.`);
	}
	migrate(db, { migrationsFolder: folder });
}
