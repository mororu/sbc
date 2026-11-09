// The only module that reads process.env (AD-1, conventions: Config).
import { existsSync } from 'node:fs';
import { parseEnv, type Env } from './env-parse.ts';

export type { Env, Smtp } from './env-parse.ts';

let cached: Env | undefined;

/**
 * The parsed app env, read on first use (not at import, so builds and tests can import
 * server modules without a full env).
 */
export function getEnv(): Env {
	if (cached) return cached;
	// Decide the mode before reading .env, so a NODE_ENV inside the file cannot flip it.
	const nodeEnv = process.env.NODE_ENV;
	// Vite does not put .env into process.env. Outside production, load it here; values already
	// set in the environment win. Production gets its env from compose, never from a file.
	if (nodeEnv !== 'production' && existsSync('.env')) {
		process.loadEnvFile('.env');
	}
	cached = parseEnv(process.env, nodeEnv);
	return cached;
}
