---
title: "Story 1.4: Guest sees a day's start times with hot / cold start"
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'f115e974158f4c86a1e58393dc766eeab1f6b11a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The home page is a placeholder. Guests cannot see a day's free start times, their heat state or the taken times, and nothing handles the before-season and after-season states.

**Approach:** Server-render `/` (today) and `/day/{date}` from one view model. A route-only builder gets the day's data through guest read queries, calls `offeredStartTimes` from the Story 1.3 core, and pre-formats every string. A small pure function in `domain` derives the season state and the nearest selectable day. A build check keeps `src/lib/time` (Temporal) out of the client.

## Boundaries & Constraints

**Always:**
- Copy comes from `messages/` in DE and EN and matches EXPERIENCE.md exactly. A string the UX does not define is drafted under the voice rules and listed in the README for operator review.
- The page data is only the view model (AD-26): times, durations, heat, taken start/end, season state and display strings. It never contains row ids, `created_at`, names or block reasons. Guest queries select no block `reason` column.
- Only the shell reads the clock: `src/lib/server/clock.ts`.
- Rows follow DESIGN.md: grid `minmax(76px, max-content) 1fr auto`, padding 16/14, radius 3.
  - Hot: 2 px solid border, flame and the label.
  - Cold start: 2 px dashed border, snowflake and the label.
  - Taken: 1 px line border, lock, "BELEGT", the time struck through at 18/400, "bis 17:00", and a 12 px hatch only in the left band.
  - Icons are `aria-hidden`, and there is no fill behind heat-state rows.
- Tokens only; no new colours.

**Ask First:** Any change to the Story 1.3 core rules. Any new dependency.

**Never:**
- No date strip, arrows or loading line (Story 1.5). No arrival times on cold starts (Story 1.6).
- No booking link: free rows are not links and have no chevron until Story 1.7 adds the form.
- No client import of `src/lib/time`.

## I/O & Edge-Case Matrix

Seed settings (changeover 15, 10:00–22:00, horizon 14), season 9 Jan – 30 Apr 2027.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Day view | today 12 Jan, bookings 17:00–18:00 | `h1` "Heute, 12. Januar"; title "Di, 12. Januar · Sauna Luegisee"; a taken row "17:00 bis 18:00"; 18:15 hot with "Ofen läuft. Komm um 18:15."; 15:45 cold start with "Nur 60 Min." | N/A |
| Other day | `/day/2027-01-13` on 12 Jan | `h1` "Mittwoch, 13. Januar" | N/A |
| Limited durations | durations [60, 90] / [60] / all five | "Bis 90 Min. · …" / "Nur 60 Min. · …" / no prefix | N/A |
| Block | block 12:00–13:00 | a taken row identical to a booking's; no reason anywhere in the HTML or page data | N/A |
| Before booking opens | today 20 Dec 2026 | `/` shows "Die Saison beginnt am 9. Januar. Buchen kannst du ab dem 26. Dezember." and no rows | N/A |
| Booking open, season not begun | today 28 Dec 2026 | `/` shows 9 Jan with the note "Die Saison beginnt am 9. Januar. Hier sind die ersten Tage." above the day | N/A |
| After season / no season | today 1 May 2027 or no season row | "Die Saison ist vorbei. Danke fürs Kommen, bis nächsten Winter."; a later season switches to the before-season state | N/A |
| Bad URL date | past, beyond horizon, outside season, `2027-02-30`, `abc` | redirect (302) to `/day/{nearest selectable day}`; a malformed date goes to the first; with no selectable day, to `/` | never an error page |

</frozen-after-approval>

## Code Map

- `src/lib/domain/start-times.ts` -- `offeredStartTimes`, `isBookableDay`, `DURATIONS`, types. Callers pass the previous, current and next day's bookings and blocks.
- `src/lib/time/zurich.ts` -- `toInstant`, `today`, `lastBookableDay`, `addDays`, `compareDates`, `formatDateLong`, `formatTime`, and the `formatToParts` pattern for new formats. `Locale` is `'de' | 'en'`.
- `src/lib/server/db/index.ts` -- `getDb()` and `Db`. Queries take `db = getDb()` so tests can pass `createDb(openDatabase(':memory:'))` after `applyMigrations` (see `db.test.ts`).
- `src/lib/server/db/queries/index.ts` -- empty barrel; guest queries go here. `schema.ts` has `season`, `setting`, `booking`, `block`.
- `src/lib/server/env-parse.ts` / `env.ts` -- the only env readers.
- `src/routes/(guest)/+page.svelte` -- placeholder to replace. The layout provides `main#main`. `PageTitle.svelte` appends "· Sauna Luegisee". `Icon.svelte` has flame, snowflake and lock with `size="row"`.
- `src/lib/styles/tokens.css` -- `--type-slot-time-*`, `--type-slot-time-taken-*`, `--type-notice-*`, `--type-date-eyebrow-*`, `--hatch-band`, the colours `hot`, `cold-start`, `taken` and `line`.
- `src/lib/paraglide` via `m` and `getLocale()`. `messages/de.json`, `messages/en.json`.
- `eslint.config.js` -- the layer rules. Routes may import time for display only.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/time/zurich.ts` (+ tests) -- add `formatDayMonth` ("12. Januar" / "12 January"), `formatWeekday` ("Dienstag" / "Tuesday") and `formatDateTitle` ("Di, 12. Januar" / "Tue, 12 January") -- heading and title.
- [x] `src/lib/domain/calendar.ts` (+ tests, re-exported) -- `calendarState({seasons, settings, now})` returns one of:
  - `{kind:'open', firstDay, lastDay, seasonStartsOn?}`, where `seasonStartsOn` is set when today is in no season;
  - `{kind:'before', seasonStart, bookingOpens}`, where `bookingOpens` is `seasonStart − horizonDays`;
  - `{kind:'after'}`.

  Also `nearestSelectableDay(date, …)`: past → first day, beyond the horizon → last day, a tie → the earlier day. These are the season states and the redirect target.
- [x] `src/lib/server/env-parse.ts`, `.env.example`, tests -- optional `DEV_NOW` (an ISO instant), refused in production -- lets development try season states.
- [x] `src/lib/server/clock.ts` -- `now(): Instant`, using `DEV_NOW` or else `Temporal.Now` -- the one clock.
- [x] `src/lib/server/db/queries/calendar.ts` (+ test on a migrated in-memory DB) -- `getSettings`, `getSeasons`, and `getDayItems(from, to)`.
  - `getDayItems` returns live bookings starting in [from, to) and blocks overlapping [from, to).
  - It selects only the columns the core needs and never `reason`.
- [x] `src/lib/server/day-view.ts` (+ tests) -- `buildDayView(input)`, pure, returns the serialisable view model:
  - heading parts, title, optional note;
  - rows sorted by start, each either `free` (time, datetime, heat, label, notice, srText) or `taken` (clipped to operating hours; time, until, srText).

  `loadDayView(date)` adds the queries and the clock. This is the shared builder.
- [x] `src/routes/(guest)/+page.server.ts`, `day/[date]/+page.server.ts`, both `+page.svelte` -- `/` renders today, or `firstDay` when today is not selectable, or the season notice. `/day/[date]` redirects as in the matrix -- the routes.
- [x] `src/lib/components/DayView.svelte`, `StartTimeRow.svelte`, `SeasonNotice.svelte` -- markup and styles per DESIGN.md -- the UI.
- [x] `messages/de.json`, `messages/en.json` -- labels, notices, season copy, "Heute"/"Today", taken and screen-reader texts; remove `home_*` -- copy.
- [x] `vite.config.ts` + `scripts/` or a plugin test -- the client build fails if any client chunk contains a module from `src/lib/time` or the string `Europe/Zurich` -- the Temporal check, without matching devalue's own `Temporal` names.
- [x] `README.md` -- `DEV_NOW`, the client-time guard, and the drafted copy (EN titles and screen-reader texts, "Bis/Nur" wording, season notice heading).

**Acceptance Criteria:**
- Given `npm run build`, when it completes, then the Temporal check passed. A deliberate client import of `#lib/time` (tested once) fails the build.
- Given any guest day page, when its serialized data is inspected, then it holds no `id`, `createdAt`, `reason`, name, email or phone.
- Given a screen reader, when it reads a row, then it hears "18:15, schon heiss. Ofen läuft. Komm um 18:15." and "16:00 bis 17:00, belegt".
- Given 320 px with 200 % text, when the list renders, then there is no horizontal scroll.

## Design Notes

**Heading:**
- `<h1><span class="eyebrow">Heute</span><span class="visually-hidden">, </span><span>12. Januar</span></h1>`.
- The eyebrow is uppercased by CSS; the source stays in sentence case.

**Season notice:**
- The first sentence is the `h1` in date-heading type, for example "Die Saison beginnt am 9. Januar." The rest is the body, under a top hairline.
- This is how "heading with the dates" is read here, so the copy stays exactly as in EXPERIENCE.md.

**Limited durations:**
- Kind-3-only times always have exactly one duration, and every other time offers a prefix of 60…180.
- So: 1 duration → "Nur {d} Min."; fewer than 5 → "Bis {max} Min."; all 5 → no prefix.
- The parts are joined as `{limit} · {heat notice}`. Cold starts in this story have only the limit text, because Story 1.6 adds the arrival time.

**Taken rows:** one row per live booking or block that overlaps the day's operating hours, shown clipped to those hours.

## Verification

**Commands:**
- `npm test` -- expected: all tests, old and new, pass.
- `npm run check`, `npm run lint`, `npm run build` -- expected: clean, with the Temporal check passing.

**Manual checks:**
- `npm run db:fixtures -- 2027-01-12`, then `DEV_NOW=2027-01-12T09:00:00Z`: open `/`, `/day/2027-01-13` and `/day/2026-01-01`.
- Check DE/EN, light and dark, and 320 px. With `DEV_NOW` on 20 Dec, 28 Dec and 1 May, check the three season states.

## Suggested Review Order

**Day view model**

- Entry point: one loader for `/` and `/day/{date}`: day, season notice or redirect.
  [`day-view.ts:241`](../../src/lib/server/day-view.ts#L241)

- Pure builder: core offers become free rows with pre-formatted label, notice and screen-reader text.
  [`day-view.ts:109`](../../src/lib/server/day-view.ts#L109)

- Taken rows clipped to operating hours and merged where they overlap.
  [`day-view.ts:156`](../../src/lib/server/day-view.ts#L156)

- "Nur" / "Bis" wording for limited durations.
  [`day-view.ts:94`](../../src/lib/server/day-view.ts#L94)

**Season states and redirects**

- Open, before or after, derived from seasons, horizon and `now`.
  [`calendar.ts:44`](../../src/lib/domain/calendar.ts#L44)

- Nearest selectable day for bad URLs; earlier day on a tie.
  [`calendar.ts:72`](../../src/lib/domain/calendar.ts#L72)

- The route turns a redirect result into a 302.
  [`+page.server.ts:1`](../../src/routes/(guest)/day/[date]/+page.server.ts#L1)

**Data and privacy (AD-26)**

- Guest queries select only core columns, never a block's reason.
  [`calendar.ts:1`](../../src/lib/server/db/queries/calendar.ts#L1)

- Latent bug fixed: Drizzle needs `snake_case` casing like drizzle.config.ts.
  [`index.ts:29`](../../src/lib/server/db/index.ts#L29)

- The one clock, with `DEV_NOW` for trying season states in development.
  [`clock.ts:6`](../../src/lib/server/clock.ts#L6)

**UI**

- Heading with eyebrow and date in one `h1`; keyed row list.
  [`DayView.svelte:16`](../../src/lib/components/DayView.svelte#L16)

- Row grid, heat borders, hatch only in the left band; narrow-screen stacking.
  [`StartTimeRow.svelte:19`](../../src/lib/components/StartTimeRow.svelte#L19)

- Season notice: first sentence as `h1`, the rest below a hairline.
  [`SeasonNotice.svelte:15`](../../src/lib/components/SeasonNotice.svelte#L15)

**Client time guard**

- Fails the client build on any `src/lib/time` module or the zone name.
  [`client-time-guard.ts:15`](../../scripts/client-time-guard.ts#L15)

- Registered in the Vite config, pinned by a config test.
  [`vite.config.ts:33`](../../vite.config.ts#L33)

**Tests and docs**

- View model against the spec matrix, merge cases and DST day.
  [`day-view.test.ts:39`](../../src/lib/server/day-view.test.ts#L39)

- Route loads: 302 redirects and the rendered pages.
  [`server.test.ts:37`](../../src/routes/(guest)/day/[date]/server.test.ts#L37)

- New date formats for heading and title.
  [`zurich.ts:124`](../../src/lib/time/zurich.ts#L124)

- Day view, `DEV_NOW`, guard and drafted copy for operator review.
  [`README.md:96`](../../README.md#L96)
