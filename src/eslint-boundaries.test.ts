// Keeps the layer rules in eslint.config.js honest (AD-1, AD-2): each row lints a snippet as if it
// lived at `file` and checks whether a boundary rule fires.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

const BOUNDARY_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax']);

async function boundaryErrors(file: string, code: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath: file });
	return result.messages
		.filter((m) => m.ruleId !== null && BOUNDARY_RULES.has(m.ruleId))
		.map((m) => m.message);
}

const blocked: [string, string, string][] = [
	// Pure core imports only time.
	['domain → db by alias', 'src/lib/domain/x.ts', "import '#lib/server/db/index.ts';"],
	['domain → db by relative path', 'src/lib/domain/x.ts', "import '../server/db/index.ts';"],
	['domain → schemas', 'src/lib/domain/x.ts', "import '../schemas/index.ts';"],
	['domain → $lib env', 'src/lib/domain/x.ts', "import '$lib/server/env.ts';"],
	['domain → node:fs', 'src/lib/domain/x.ts', "import 'node:fs';"],
	['domain → $app', 'src/lib/domain/x.ts', "import '$app/state';"],
	['domain → time then out again', 'src/lib/domain/x.ts', "import '#lib/time/../server/db/index.ts';"],
	['domain dynamic import', 'src/lib/domain/x.ts', "export const f = () => import('node:fs');"],
	['domain Date.now()', 'src/lib/domain/x.ts', 'export const t = Date.now();'],
	['domain globalThis.Date.now()', 'src/lib/domain/x.ts', 'export const t = globalThis.Date.now();'],
	['domain new Date()', 'src/lib/domain/x.ts', 'export const t = new Date();'],
	['domain Date()', 'src/lib/domain/x.ts', 'export const t = Date();'],
	['domain performance.now()', 'src/lib/domain/x.ts', 'export const t = performance.now();'],
	['domain Temporal.Now', 'src/lib/domain/x.ts', 'export const t = Temporal.Now.instant();'],
	// Time and schemas import nothing from the app.
	['time → domain', 'src/lib/time/x.ts', "import '#lib/domain/index.ts';"],
	['time Date.now()', 'src/lib/time/x.ts', 'export const t = Date.now();'],
	['schemas → time', 'src/lib/schemas/x.ts', "import '../time/index.ts';"],
	// The db layer is reachable only from commands and db/queries.
	['route → db index', 'src/routes/x/+page.server.ts', "import '#lib/server/db/index.ts';"],
	['route → db schema', 'src/routes/x/+page.server.ts', "import '$lib/server/db/schema.ts';"],
	['route → db folder', 'src/routes/x/+page.ts', "import '../../lib/server/db';"],
	['route → db migrate', 'src/routes/x/+page.server.ts', "import '#lib/server/db/migrate.ts';"],
	['route → better-sqlite3', 'src/routes/x/+page.server.ts', "import 'better-sqlite3';"],
	['mail → db', 'src/lib/server/mail/x.ts', "import '../db/index.ts';"],
	['hooks → db index', 'src/hooks.server.ts', "import '#lib/server/db/index.ts';"],
	// Env is read only in env.ts.
	['route $env', 'src/routes/x/+page.server.ts', "import '$env/dynamic/private';"],
	['route process.env', 'src/routes/x/+page.server.ts', 'export const v = process.env.X;'],
	['route process["env"]', 'src/routes/x/+page.server.ts', "export const v = process['env'];"],
	['route destructured env', 'src/routes/x/+page.server.ts', 'const { env } = process; export { env };'],
	['route globalThis.process.env', 'src/routes/x/+page.server.ts', 'export const v = globalThis.process.env;'],
	['route import.meta.env', 'src/routes/x/+page.ts', 'export const v = import.meta.env;'],
	['command process.env', 'src/lib/server/commands/x.ts', 'export const v = process.env.X;']
];

const allowed: [string, string, string][] = [
	['domain → time', 'src/lib/domain/x.ts', "import '#lib/time/index.ts';"],
	['domain → sibling', 'src/lib/domain/x.ts', "import './y.ts';"],
	['schemas → valibot', 'src/lib/schemas/x.ts', "import 'valibot';"],
	['route → db/queries', 'src/routes/x/+page.server.ts', "import '#lib/server/db/queries/index.ts';"],
	['route → commands', 'src/routes/x/+page.server.ts', "import '#lib/server/commands/index.ts';"],
	['hooks → db migrate', 'src/hooks.server.ts', "import '#lib/server/db/migrate.ts';"],
	['command → db', 'src/lib/server/commands/x.ts', "import '../db/index.ts';"],
	['query → db', 'src/lib/server/db/queries/x.ts', "import '../index.ts';"],
	['env.ts process.env', 'src/lib/server/env.ts', 'export const v = process.env.X;']
];

describe('layer boundaries', () => {
	it.each(blocked)('blocks %s', async (_label, file, code) => {
		expect(await boundaryErrors(file, code)).not.toEqual([]);
	});

	it.each(allowed)('allows %s', async (_label, file, code) => {
		expect(await boundaryErrors(file, code)).toEqual([]);
	});
});
