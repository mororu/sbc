import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

// ---------------------------------------------------------------------------
// Layer boundaries (architecture AD-1, AD-2). Import specifiers are matched as
// regexes so `#lib/…`, `$lib/…` and relative paths are all caught.
// ESLint replaces (does not merge) a rule set by a later block, so each layer
// block repeats the rules it inherits.
// ---------------------------------------------------------------------------

/**
 * The db layer: connection, schema, migrations and anything else directly in
 * src/lib/server/db, except db/queries. Only commands and db/queries may import it.
 */
const dbConnection = {
	regex: '(^|/)db(/(?!queries(/|$))[^/]+)?$|^(better-sqlite3|drizzle-orm)(/|$)',
	message:
		'The db layer is importable only by src/lib/server/commands and src/lib/server/db/queries. Write via commands, read via db/queries (AD-2).'
};

/** hooks.server.ts may import db/migrate.ts to apply migrations at boot, nothing else from db. */
const dbConnectionExceptMigrate = {
	...dbConnection,
	regex: '(^|/)db(/(?!queries(/|$)|migrate(\\.(ts|js))?$)[^/]+)?$|^(better-sqlite3|drizzle-orm)(/|$)'
};

/** SvelteKit env modules: app env is read only in src/lib/server/env.ts. */
const svelteKitEnv = {
	regex: '^\\$env/',
	message: 'Read app env only through #lib/server/env.ts (conventions: Config).'
};

const envMessage = 'Env is read only in src/lib/server/env.ts (conventions: Config).';
const processEnv = [
	"MemberExpression[object.name='process'][property.name='env']",
	"MemberExpression[object.name='process'][property.value='env']",
	"MemberExpression[object.property.name='process'][property.name='env']",
	"VariableDeclarator[init.name='process'] > ObjectPattern",
	"MemberExpression[object.type='MetaProperty'][property.name='env']"
].map((selector) => ({ selector, message: envMessage }));

const clockMessage = 'The pure core never reads the clock: take `now` as a parameter (AD-1, AD-9).';
const clockReads = [
	"MemberExpression[object.name='Date'][property.name='now']",
	"MemberExpression[object.property.name='Date'][property.name='now']",
	"NewExpression[callee.name='Date']",
	"NewExpression[callee.property.name='Date']",
	"CallExpression[callee.name='Date']",
	"MemberExpression[object.name='performance'][property.name='now']",
	"MemberExpression[object.name='Temporal'][property.name='Now']"
].map((selector) => ({ selector, message: clockMessage }));

const dynamicLoads = [
	{ selector: 'ImportExpression', message: 'Pure layers use static imports only (AD-1).' },
	{ selector: "CallExpression[callee.name='require']", message: 'Pure layers use static imports only (AD-1).' }
];

/** Anything outside the pure layers: server code, framework, I/O libraries. */
const impureModules = {
	regex: '^(\\$app|\\$env|\\$service-worker)(/|$)|^node:|^(better-sqlite3|drizzle-orm|drizzle-kit|nodemailer|argon2)(/|$)',
	message: 'Pure layers do no I/O and do not use the framework (AD-1).'
};

/** `time/../server/db` and the like: climbing back out after naming a folder hides the target. */
const pathTraversal = {
	regex: '[^/.][^/]*/\\.\\.(/|$)',
	message: 'Do not climb back out of a folder in an import path; name the target directly.'
};

/**
 * @param {{ files: string[], forbidden: string }} allowedAppDirs
 * @param {string} message
 * @returns {import('eslint').Linter.Config}
 */
const pureLayer = (allowedAppDirs, message) => ({
	files: allowedAppDirs.files,
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: [
					impureModules,
					pathTraversal,
					{
						// Any app module outside the allowed directories, by alias or by relative path.
						regex: allowedAppDirs.forbidden,
						message
					}
				]
			}
		],
		'no-restricted-syntax': ['error', ...processEnv, ...clockReads, ...dynamicLoads]
	}
});

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},

	// Everywhere in src: no direct db access, no env access outside env.ts.
	{
		files: ['src/**/*.{ts,mts,cts,js,mjs,cjs,svelte}'],
		ignores: ['src/lib/server/commands/**', 'src/lib/server/db/**'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [dbConnection, svelteKitEnv] }],
			'no-restricted-syntax': ['error', ...processEnv]
		}
	},
	{
		files: ['src/hooks.server.ts'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [dbConnectionExceptMigrate, svelteKitEnv] }]
		}
	},
	{
		// commands and db/queries may use the db, but still not env directly.
		files: ['src/lib/server/commands/**', 'src/lib/server/db/**'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [svelteKitEnv] }],
			'no-restricted-syntax': ['error', ...processEnv]
		}
	},
	{
		// The one place that reads process.env.
		files: ['src/lib/server/env.ts'],
		rules: { 'no-restricted-syntax': 'off' }
	},

	// Pure core: imports only src/lib/time.
	pureLayer(
		{
			files: ['src/lib/domain/**'],
			forbidden: '^(#lib|\\$lib)(/(?!time(/|$)).*)?$|^\\.\\./(?!time(/|$))'
		},
		'src/lib/domain may import only src/lib/time (AD-1).'
	),
	// Time and shared schemas: import nothing from the app.
	pureLayer(
		{ files: ['src/lib/time/**'], forbidden: '^(#lib|\\$lib)(/|$)|^\\.\\./' },
		'src/lib/time imports nothing from the app (AD-1, AD-9).'
	),
	pureLayer(
		{ files: ['src/lib/schemas/**'], forbidden: '^(#lib|\\$lib)(/|$)|^\\.\\./' },
		'src/lib/schemas imports nothing from the app (AD-16).'
	)
);
