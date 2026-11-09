---
title: 'Story 1.1: Project scaffold'
type: 'chore'
created: '2026-11-09'
status: 'done'
baseline_commit: '7f9b5f4447c1d8f94c1a6f5c27bd287aaef75c99'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has only planning artifacts; there is no app, no tooling and no enforced layering for the stories that follow.

**Approach:** Scaffold SvelteKit 3 with the pinned stack, the Structural Seed source tree, a fail-fast env module, a WAL SQLite connection with boot-time migrations, lint-enforced layer boundaries, and a translated placeholder page at `/`; record the four scaffold decisions in the README.

## Boundaries & Constraints

**Always:** Exact pinned versions (no `^`/`~`): kit 3.1.1, svelte 5.57.3, adapter-node 6.0.1, vite-plugin-svelte 7.3.1, vite 8.3.6, typescript 6.0.3, svelte-check 4.7.8, vitest 4.1.12, better-sqlite3 13.0.3, drizzle-orm 0.45.4, drizzle-kit 0.31.11, `@inlang/paraglide-js` 2.29.3, valibot latest 1.x. Node 26.13.0 in `.nvmrc` and `engines`; run all npm commands via `fnm exec --using=26.13.0`. Committed `package-lock.json`. `#lib/…` imports with explicit extensions, `$app/state`, hook types from `@sveltejs/kit/hooks`, `kit.paths.origin = 'https://sauna-luegisee.ch'`. Paraglide: locales `de` (base) + `en`, strategy cookie → preferredLanguage → baseLocale, no URL prefixes. Only `src/lib/server/env.ts` touches `process.env`.

**Ask First:** Any pinned version that fails to install or is incompatible with another pin; any deviation from the Structural Seed tree; adding a dependency not named here (besides ESLint/sv-generated tooling).

**Never:** No business tables (season/setting/booking/block come in Story 1.3) — the first migration may only be an empty baseline. No Dockerfile, compose, Caddyfile or backup script (Epic 5). No styling/tokens, header or footer (Story 1.2). No admin auth or `set-admin-password` (Story 3.1). No mail transport code beyond the env rule. No third-party scripts or fonts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev, minimal env | `.env` copied from `.env.example`, no SMTP | env loads; mail transport = local sink | N/A |
| Dev, SMTP set | dev with `SMTP_*` values | still local sink | N/A |
| Prod, all set | `NODE_ENV=production`, all 7 vars | env loads | N/A |
| Prod, var missing | production without e.g. `GUEST_KEY_SECRET` | startup fails | throws naming every missing variable |
| Any, no DB path | `DATABASE_PATH` unset | startup fails | throws naming `DATABASE_PATH` |
| Boot | fresh or existing SQLite file | migrations applied, `journal_mode=wal`, busy timeout set, then serve | migration error aborts boot |

</frozen-after-approval>

## Code Map

Greenfield: repo root holds only `_bmad/`, `_bmad-output/`, `.claude/`, `.gitignore`. `sv` CLI is 1.3.0. Root is non-empty, so scaffold into a scratch dir and move files in (never overwrite `_bmad*`, `.claude`, `.gitignore` — merge `.gitignore` entries instead).

- `src/lib/{domain,time,schemas,server/commands,server/worker,server/mail,server/db/queries}` -- empty layers; keep with a short `README.md` or `index.ts` each so the tree is committed.
- `src/lib/paraglide/` -- generated, git-ignored.
- `src/routes/(guest)/+page.svelte` -- placeholder for `/`; `src/routes/admin/` -- empty seed dir.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `.nvmrc` -- scaffold via `sv create` (minimal, TypeScript) + `sv add paraglide`, then pin all versions exactly, adapter-node, `imports` map for `#lib/*`, scripts `dev`, `build`, `check`, `lint`, `test`, `db:generate` -- pinned base.
- [x] `project.inlang/settings.json`, `messages/de.json`, `messages/en.json`, `src/hooks.server.ts`, `src/hooks.ts` -- Paraglide config (cookie → preferredLanguage → baseLocale, no URL rewrites beyond what sv generates), placeholder page strings in DE and EN -- i18n from day one.
- [x] `src/lib/server/env.ts` -- parse/validate the 7 vars per the matrix; export typed config and `mailTransport: 'sink' | 'smtp'` -- single env gate.
- [x] `src/lib/server/env.test.ts` -- unit tests for every matrix row (env passed in as a parameter object, not global) -- prove fail-fast rule.
- [x] `src/lib/server/db/index.ts`, `src/lib/server/db/schema.ts`, `src/lib/server/db/migrate.ts`, `drizzle.config.ts`, `src/lib/server/db/migrations/` -- better-sqlite3 at `DATABASE_PATH`, WAL + `busy_timeout`, drizzle instance, empty schema, baseline migration via `drizzle-kit generate --custom`, `migrate()` run from `hooks.server.ts` `init` before serving -- migration workflow.
- [x] `eslint.config.js` -- flat config (typescript-eslint, eslint-plugin-svelte) plus layer rules: `no-restricted-imports` per directory for the AD-1/AD-2 table; `no-restricted-syntax`/`no-restricted-globals` banning `Date.now`, `new Date()`, `process.env` in `src/lib/domain` and `src/lib/time` -- enforced boundaries. Verify once with a temporary violating import in `src/lib/domain` (lint fails), then delete it.
- [x] `src/routes/(guest)/+page.svelte` -- one `h1` + line from `messages/` via `m.*` -- smoke page.
- [x] `.env.example` -- all 7 vars, `DATABASE_PATH=./data/dev.sqlite`, dev-only `GUEST_KEY_SECRET` marked never-for-production, no SMTP values -- dev onboarding.
- [x] `.gitignore` -- add `node_modules`, `.svelte-kit`, `build`, `.env`, `data/`, `src/lib/paraglide` -- hygiene.
- [x] `README.md` -- setup (fnm, `cp .env.example .env`, scripts) and "Scaffold decisions": (1) UTC ISO 8601 text with seconds and `Z`; (2) Valibot; (3) admin password via `npm run set-admin-password` CLI built in 3.1; (4) drizzle-kit generate → committed SQL in `src/lib/server/db/migrations`, applied at boot; plus the env production/development rule -- recorded decisions.

**Acceptance Criteria:**
- Given a fresh clone with `.env` from `.env.example`, when `npm run dev` starts and `/` is opened, then migrations are applied to `./data/dev.sqlite` and a page with text from `messages/` is served, German by default and English with an `en` cookie or browser preference.
- Given the project, when `npm test`, `npm run check` and `npm run lint` run, then all pass with at least one passing test.
- Given a file in `src/lib/domain` importing from `src/lib/server/db` or calling `Date.now()`, when `npm run lint` runs, then it fails.
- Given a route file importing `#lib/server/db/index.ts`, when lint runs, then it fails; importing from `db/queries` or `commands` passes.

## Design Notes

Make `env.ts` export a pure `parseEnv(source, nodeEnv)` plus a module-level `env = parseEnv(process.env, process.env.NODE_ENV)` so tests never mutate globals. Lint boundaries are file-pattern overrides in the flat config, e.g. `files: ['src/lib/domain/**']` → restrict patterns `['#lib/server/*', '#lib/schemas/*', '$app/*', '$env/*', 'better-sqlite3', 'drizzle-orm*']`; routes get a restriction on `#lib/server/db/index.ts` and `#lib/server/db/schema.ts`. Cover both `#lib/…` and relative/`$lib` paths in patterns.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm ci` -- expected: installs from lockfile, no version drift
- `fnm exec --using=26.13.0 npm test` -- expected: env tests pass
- `fnm exec --using=26.13.0 npm run check` -- expected: 0 errors
- `fnm exec --using=26.13.0 npm run lint` -- expected: clean; fails with the temporary violation
- `fnm exec --using=26.13.0 npm run build` -- expected: adapter-node build succeeds

**Manual checks:**
- `npm run dev`, open `/` in the browser pane: DE text; with `PARAGLIDE_LOCALE=en` cookie: EN text; `sqlite3 data/dev.sqlite 'pragma journal_mode'` → `wal`.

## Suggested Review Order

**Layer boundaries**

- Entry point: the AD-1/AD-2 rules every later story relies on.
  [`eslint.config.js:21`](../../eslint.config.js#L21)

- The pure core may import only time; one factory per pure layer.
  [`eslint.config.js:157`](../../eslint.config.js#L157)

- Clock and env bans close the bypasses the review found.
  [`eslint.config.js:40`](../../eslint.config.js#L40)

- The single exception: the boot hook may import `db/migrate.ts`.
  [`eslint.config.js:137`](../../eslint.config.js#L137)

**Env**

- Pure parser: production requires everything and refuses the dev secret.
  [`env-parse.ts:37`](../../src/lib/server/env-parse.ts#L37)

- Lazy reader: the mode is fixed before `.env` loads, and builds need no env.
  [`env.ts:13`](../../src/lib/server/env.ts#L13)

**Database and boot**

- WAL is checked rather than assumed; busy timeout and foreign keys are on.
  [`index.ts:16`](../../src/lib/server/db/index.ts#L16)

- Migrations run from a cwd-relative folder and fail clearly when it is missing.
  [`migrate.ts:13`](../../src/lib/server/db/migrate.ts#L13)

- Migrations run in `init`, before the first request.
  [`hooks.server.ts:7`](../../src/hooks.server.ts#L7)

**Framework config and page**

- Paraglide strategy; origin set only for builds so dev CSRF works.
  [`vite.config.ts:18`](../../vite.config.ts#L18)

- Placeholder page with all text from `messages/`.
  [`+page.svelte:10`](../../src/routes/(guest)/+page.svelte#L10)

- The four scaffold decisions and the env rule.
  [`README.md:42`](../../README.md#L42)

**Tests**

- One snippet per boundary rule, so a broken rule fails `npm test`.
  [`eslint-boundaries.test.ts:67`](../../src/eslint-boundaries.test.ts#L67)

- Pragmas, a fresh migration, and the abort paths.
  [`db.test.ts:18`](../../src/lib/server/db/db.test.ts#L18)

- Every row of the env matrix, plus the port and secret checks.
  [`env-parse.test.ts:19`](../../src/lib/server/env-parse.test.ts#L19)
