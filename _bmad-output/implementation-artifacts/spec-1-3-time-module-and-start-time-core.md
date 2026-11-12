---
title: 'Story 1.3: Time module and start-time core'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '9cef3ca06516ffc0a9bbe1b9504bd6e72483b202'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing yet knows which start times a day offers, with which durations, or whether they are hot or cold start, and there are no tables for seasons, settings, bookings or blocks.

**Approach:** Add a pure Europe/Zurich time module (Temporal) and a pure core that computes a day's offered start times (all three kinds, with fitting durations and heat state) plus the heat state of existing bookings, both taking `now` and all data as parameters. Add the migration for `season`, `setting`, `booking` (read columns only) and `block` with idempotent seeded defaults, and a dev-only fixture script.

## Boundaries & Constraints

**Always:** Instants are UTC ISO 8601 strings with seconds and `Z` (`2027-01-12T17:00:00Z`) in and out of the core. `src/lib/time` alone converts between instants and Zurich wall-clock; `src/lib/domain` imports only `src/lib/time`; neither reads the clock. Durations are whole minutes from {60, 90, 120, 150, 180}. A new booking must be at least one **current** changeover from every booking on both sides; no changeover next to a block. Two existing bookings are back to back when the gap equals the changeover **recorded on the later-made** one (`created_at`, then row id). A free start time is hot when it is exactly one current changeover after a booking's end. Deleted bookings are ignored. Every exported function of `domain` and `time` is unit-tested with explicit `now`, no DB.

**Ask First:** Any rule reading that the examples below do not settle; any new runtime dependency (Temporal is built into Node 26).

**Never:** No notice or arrival-time computation (Story 1.6). No guest page or query changes (Story 1.4). No booking contact, party-size, locale or public-id columns (Story 1.7). No settings UI.

## I/O & Edge-Case Matrix

Changeover 15, operating hours 10:00–22:00, pre-heat window 30–40, horizon 14, season 9 Jan–30 Apr 2027, `now` before the day unless stated.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One booking | 17:00–18:00 | 18:00 not offered; 18:15 hot; 18:30, 19:00 cold; 16:00, 16:30 not offered; 15:30 → [60]; 15:45 → [60]; 15:15 → [90] | N/A |
| Booking at 19:00 only | 19:00–20:00 | 17:45 → [60]; 17:15 → [90]; 17:30 → [60]; 17:00 → [60, 90]; booking 17:45 or 17:15 makes 19:00 hot | N/A |
| Two bookings | 17:00–18:00, 19:00–20:00 | the 19:00 booking is a cold start | N/A |
| After a block | block (any reason) ending 17:00 | 17:00 offered, cold start; a booking at 17:00 is a cold start | N/A |
| Changeover raised | 17:00–18:00 and 18:15–19:15 made at 15, changeover now 30 | 18:15 booking stays hot; 19:30 not offered; 19:45 offered and hot | N/A |
| Day end | no bookings | 21:00 → [60]; 21:30 not offered (60 would end 22:30) | N/A |
| Past | `now` 17:00 on the day | start times ≤ 17:00 not offered | N/A |
| Outside | day before season, after season, beyond horizon, before today | no start times | N/A |
| DST | Sun 28 Mar 2027 | 10:00 = `2027-03-28T08:00:00Z`; day has 23 h; grid 10:00–21:00 unchanged in wall-clock | N/A |
| Horizon | today 26 Dec 2026, horizon 14 | last bookable day 9 Jan 2027 | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/time/index.ts`, `src/lib/domain/index.ts` -- empty barrels from Story 1.1; lint forbids anything but `#lib/time` in domain and any app import in time (`src/eslint-boundaries.test.ts`).
- `src/lib/server/db/schema.ts` -- empty; `drizzle.config.ts` uses `casing: 'snake_case'`; `npm run db:generate` writes to `src/lib/server/db/migrations` (baseline `0000_baseline`); `applyMigrations` runs at boot.
- `tsconfig.json` -- extends `$app/tsconfig`; add `"lib": ["ESNext", "DOM", "DOM.Iterable"]` if `Temporal` is not typed.
- Story 1.4 will call the offer function from a route; client code never imports `src/lib/time` (it must not ship Temporal to the browser).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/time/zurich.ts` -- `type Instant = string`; `toInstant(date 'yyyy-mm-dd', minuteOfDay)`, `localDate(instant)`, `localMinuteOfDay(instant)`, `addMinutes(instant, n)`, `minutesBetween(a, b)`, `addDays(date, n)`, `today(now)`, `lastBookableDay(now, horizonDays)`, `hoursInDay(date)`, `formatDateLong(date, locale)` ("Dienstag, 12. Januar" / "Tuesday, 12 January"), `formatDateShort` ("Di 12. Januar" / "Tue 12 January"), `formatTime(instant)` ("18:15"); `isValidDate` -- the only Zurich conversion point.
- [x] `src/lib/domain/start-times.ts` -- types `Booking {id, start, durationMin, changeoverMin, createdAt}`, `Block {start, end}`, `Settings {changeoverMin, openMinute, closeMinute, horizonDays}`, `Season {startDate, endDate}`; `offeredStartTimes({date, bookings, blocks, settings, seasons, now})` → sorted `{start, kinds: (1|2|3)[], durations: number[], heat: 'hot'|'cold'}[]`; `freeHeat(start, bookings, blocks, changeoverMin)`; `bookingHeat(booking, bookings, blocks)`; `isBookableDay(date, seasons, settings, now)` -- the shared offer function.
- [x] `src/lib/domain/index.ts`, `src/lib/time/index.ts` -- re-export.
- [x] `src/lib/time/zurich.test.ts`, `src/lib/domain/start-times.test.ts` -- every matrix row plus each exported function -- AD-19.
- [x] `src/lib/server/db/schema.ts` + generated migration `0001_*` -- `season(id, start_date, end_date)`, `setting(id = 1, changeover_min, preheat_min_min, preheat_max_min, horizon_days, open_minute, close_minute)`, `booking(id, start_at, duration_min, changeover_min, created_at, season_id → season, deleted_at null)`, `block(id, start_at, end_at, reason in cleaning|maintenance|private_use)`; append `INSERT OR IGNORE` seeds: setting id 1 = 15 / 30 / 40 / 14 / 600 / 1320, season id 1 = 2027-01-09 – 2027-04-30 -- schema + idempotent seed.
- [x] `src/lib/server/db/db.test.ts` -- migrated DB has exactly one setting and one season row after migrating twice -- seed idempotence.
- [x] `scripts/dev-fixtures.ts`, `package.json` (`db:fixtures`) -- refuses when `NODE_ENV=production`; inserts sample bookings and blocks for a given date (default: first season day) -- manual testing.
- [x] `README.md` -- seeded placeholders (operating hours, season dates: admins confirm), fixture script usage, the heat rule decisions below.

**Acceptance Criteria:**
- Given `npm run lint`, when the new modules are linted, then `domain` imports only `#lib/time`, neither calls `Date.now`/`new Date()`/`Temporal.Now`, and lint passes.
- Given a fresh database, when the app boots, then the four tables exist with the seeded setting and season, and booting again changes nothing.

## Design Notes

**Free start time heat (decision, confirmed by the user 2026-11-11):** look at the latest-ending booking or block that ends at or before the start. Hot only if that item is a booking and `start = its end + current changeover`; a block ending in between (or exactly at the start) makes it a cold start. Existing bookings use the same rule with the later-made booking's recorded changeover.

**Kind 3:** for each existing booking B and each duration d, `B.start − currentChangeover − d`; if that time is not also kind 1 or 2, it offers only the durations that end exactly one changeover before some booking. Every candidate still passes all checks (hours, season, horizon, `now`, blocks, changeover to both neighbours).

**Formatting** builds strings from `Intl.DateTimeFormat#formatToParts` (`de-CH`, `en-GB`) because plain Intl gives "Di., 12. Januar" and "Tuesday 12 January".

## Verification

**Commands:**
- `npm test` -- expected: time, core, schema and earlier tests pass
- `npm run check`, `npm run lint`, `npm run build` -- expected: clean

**Manual checks:**
- `rm -rf data && npm run dev` then `sqlite3 data/dev.sqlite '.tables'` and the seeded rows; `npm run db:fixtures` inserts rows.

## Suggested Review Order

**Start-time core**

- Entry point: candidates of all three kinds, then one filter for hours, `now`, changeover and blocks.
  [`start-times.ts:174`](../../src/lib/domain/start-times.ts#L174)

- One current changeover to every booking on both sides; none next to a block.
  [`start-times.ts:145`](../../src/lib/domain/start-times.ts#L145)

- The confirmed block rule: the last booking or block before a time decides heat.
  [`start-times.ts:81`](../../src/lib/domain/start-times.ts#L81)

- Existing bookings: back to back by the later-made booking's recorded changeover.
  [`start-times.ts:137`](../../src/lib/domain/start-times.ts#L137)

- Today, horizon and season checks; invalid dates offer nothing.
  [`start-times.ts:63`](../../src/lib/domain/start-times.ts#L63)

**Time module**

- The single wall-clock → instant conversion, DST-safe.
  [`zurich.ts:41`](../../src/lib/time/zurich.ts#L41)

- Horizon in calendar days.
  [`zurich.ts:88`](../../src/lib/time/zurich.ts#L88)

- Display strings built from Intl parts to match the UX copy exactly.
  [`zurich.ts:99`](../../src/lib/time/zurich.ts#L99)

**Persistence**

- Tables with value and ISO-format checks; booking keeps its recorded changeover.
  [`schema.ts:49`](../../src/lib/server/db/schema.ts#L49)

- Hand-added idempotent seed below the generated DDL.
  [`0001_core_tables.sql:53`](../../src/lib/server/db/migrations/0001_core_tables.sql#L53)

- Dev fixtures: refuse production, other seasons, and days that already have data.
  [`dev-fixtures.ts:43`](../../scripts/dev-fixtures.ts#L43)

**Tests and docs**

- Story examples (FR-2, FR-4) with explicit `now`.
  [`start-times.test.ts:56`](../../src/lib/domain/start-times.test.ts#L56)

- Day bounds: midnight neighbours, DST both ways, seasons with gaps, changeover 0.
  [`start-times.test.ts:180`](../../src/lib/domain/start-times.test.ts#L180)

- Every offered duration re-checked as a valid booking.
  [`start-times.test.ts:295`](../../src/lib/domain/start-times.test.ts#L295)

- DST and horizon in the time module.
  [`zurich.test.ts:64`](../../src/lib/time/zurich.test.ts#L64)

- Seed idempotence and every constraint.
  [`db.test.ts:41`](../../src/lib/server/db/db.test.ts#L41)

- Seeded placeholders and the heat rule for operators.
  [`README.md:79`](../../README.md#L79)
