# Epic 1 Context: Guests see the calendar and book

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Guests open sauna-luegisee.ch on a phone, see the coming days with hot / cold start and arrival times for every free start time, and book the whole wagon without an account, in German or English, in light or dark mode. The epic lays the foundation everything else rests on: the project scaffold with enforced layering, the page shell, the pure time module and pure core (start times, heat state, arrival time, notice), seeded default settings and a first season, the booking flow with its confirmation, and the info, privacy and Impressum pages. Emails follow in Epic 2.

## Stories

- Story 1.1: Project scaffold
- Story 1.2: Page shell with DE/EN and light/dark
- Story 1.3: Time module and start-time core
- Story 1.4: Guest sees a day's start times with hot / cold start
- Story 1.5: Guest browses days
- Story 1.6: Guest sees the arrival time on cold starts
- Story 1.7: Guest books a start time
- Story 1.8: Guest sees the confirmation with the notice at booking
- Story 1.9: So funktioniert's, privacy statement and Impressum pages

## Requirements & Constraints

- Guests browse every day from today to the end of the booking horizon (calendar days) inside a season; past start times are never offered; unavailable times reveal nothing about who or why.
- Start times are of three kinds (full/half hour grid; booking end + current changeover; times ending exactly one changeover before an existing booking, offered only with those durations), clipped to operating hours, season and horizon. Durations 60–180 min in 30-min steps, party size 1–6.
- Heat state: hot iff back to back with a booking before it; a block never heats. Cold starts show an arrival time as clock times, never durations.
- No double booking: of two simultaneous conflicting attempts exactly one wins; the loser keeps their contact details.
- All guest text in German (default, informal *du*, Swiss spelling) and English; plain neighbourly voice.
- Mobile first: 360 px one-handed, 44 px targets, WCAG 2.2 AA, reflow at 320 px.
- Privacy: no trackers or third-party scripts/fonts; exactly two cookies (language, admin session); no guest data in URLs.
- All times Europe/Zurich wall-clock, correct across the 28 March 2027 DST switch.

## Technical Decisions

- **Stack (pinned):** Node 26.13.0, SvelteKit 3.1.1, Svelte 5.57.3, adapter-node 6.0.1, vite-plugin-svelte 7.3.1, Vite 8.3.6, TypeScript 6.0.3, svelte-check 4.7.8, Vitest 4.1.12, better-sqlite3 13.0.3, drizzle-orm 0.45.4, drizzle-kit 0.31.11, `@inlang/paraglide-js` 2.29.3 (later: nodemailer 10.4.0, argon2 0.45.2).
- **SvelteKit 3 idioms:** `#lib/…` imports with explicit extensions, `$app/state` (never `$app/stores`), hook types from `@sveltejs/kit/hooks`, `kit.paths.origin = 'https://sauna-luegisee.ch'`.
- **Layering (lint-enforced):** `domain` imports only `time`; `time` and `schemas` import nothing; db connection/schema only from `server/commands` and `server/db/queries`; routes write via commands and read via queries. `Date.now`, `new Date()` and `process.env` banned in `domain` and `time`; `now` is always a parameter.
- **Env:** only `src/lib/server/env.ts` reads `DATABASE_PATH`, `SMTP_*`, `MAIL_FROM`, `GUEST_KEY_SECRET`; production (`NODE_ENV=production`) requires all; dev makes SMTP/MAIL_FROM optional and always uses a local mail sink.
- **DB:** SQLite in WAL mode with busy timeout; tables snake_case singular; integer row ids admin-only; public ids/tokens random URL-safe ≥ 128 bits; drizzle-kit generated SQL migrations committed under `src/lib/server/db/migrations`, applied at boot.
- **Instants:** UTC ISO 8601 text with seconds and `Z`, everywhere including notice JSON. URL dates `yyyy-mm-dd`, times `hhmm`.
- **Validation:** Valibot schemas in `src/lib/schemas`, shared client/server, error messages are i18n keys.
- **Commands:** every write is a verb-first command in one `BEGIN IMMEDIATE` transaction, returning `{ ok: true, … }` / `{ ok: false, code }` (`conflict`, `stale`, `not_found`, `past`, `invalid`); never throws for expected outcomes.
- **i18n:** Paraglide, locales `de` (base) + `en`, strategy cookie → preferredLanguage → base, no URL prefixes; `de` maps to `de-CH`.
- **Time:** `src/lib/time` alone converts instants ↔ Europe/Zurich (Temporal on the server); client code never imports it — view models carry pre-formatted strings.
- **Notice:** one canonical value `{ heat: 'hot'|'cold', earliest, latest }` with one JSON serialization; `noticeEquals` is the only comparison.
- **Testing:** every exported function of `domain` and `time` unit-tested with explicit `now`; no DB or mail mocks.

## UX & Interaction Patterns

- Lärche colour tokens (light + dark) as CSS custom properties only; system font stack; radius 3 px, no shadows or pills; hot = solid border + flame, cold start = dashed border + snowflake, taken = hatched, struck through.
- Header: brand left, "DE | EN" then theme switch right; theme stored in `localStorage`, applied before first paint; skip link first.
- Server-rendered pages that work without JavaScript; form input never lost on errors.

## Cross-Story Dependencies

- 1.1 is the base for all stories (tooling, lint boundaries, env, db connection, migration workflow, placeholder page).
- 1.2 builds the shell and stub footer pages that 1.9 fills; 1.3 creates `season`/`setting`/`booking`/`block` and the core that 1.4–1.8 consume; 1.7 extends `booking`, 1.8 adds notices and the admin contact setting used by 1.9.
- Epic 2 (outbox, worker, mail) and Epic 3 (admin, `set-admin-password` CLI in 3.1) build on the command layer and schema started here; Epic 5 adds Dockerfile/compose/Caddy/backup.
