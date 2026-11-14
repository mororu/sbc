---
title: 'A7: Keybox cutoff in the core, shared day data, day-view split'
type: 'refactor'
created: '2026-11-14'
status: 'done'
baseline_commit: '7bb0bc080c67bc7a835860a1a449057bb75d7a83'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 1 retro (A7) found three structural problems that Epic 2 would make worse:
- The 24-hour keybox cutoff lives in `booked-view.ts` (AD-1 says the core owns every Glossary rule, and AD-9 defines the cutoff). Epic 2's outbox needs the same value.
- The day-data window and loading are copied three times.
- `day-view.ts` (460 lines) mixes about nine concerns, and four modules import from it.

**Approach:** A pure refactor in three parts, with no behavior change:
- Move the cutoff into `src/lib/domain`.
- Fold the day-data loading into one query helper whose window comes from the core.
- Split `day-view.ts` into URL helpers, notice copy and the view model with its loader.

## Boundaries & Constraints

**Always:**
- **Behavior is identical:** existing tests keep their expectations. Only their imports may change.
- **The lint layer table holds** (`domain` imports only `time`). `#lib/…` imports use explicit `.ts` extensions.
- **Every new export of `src/lib/domain` gets unit tests with an explicit `now`** (AD-20).
- **Components keep importing view-model types from `#lib/server/day-view.ts`.**

**Ask First:** any change to rendered output, messages, routes or the schema.

**Never:**
- Outbox or keybox-email code (Epic 2).
- Moving `unavailableNote` (accepted in the retro).
- New dependencies.
- Re-export shims that keep the old import paths alive.

</frozen-after-approval>

## Code Map

- `src/lib/server/booked-view.ts:24-25,82-96` -- `KEYBOX_LEAD_MIN = 24 * 60` and `keyboxText(start, createdAt, now, locale)`. The code is "sent" when `createdAt >= start − 24 h` or `now >= start − 24 h`.
- `src/lib/domain/index.ts` -- the barrel: `start-times`, `calendar`, `notice`. Its header already lists "keybox phase".
- `src/lib/time/index.ts` -- `addMinutes`, `addDays`, `toInstant(date, minute)`, `compareInstants`.
- The day-data window `[day−1 00:00, day+2 00:00)` and the settings/seasons/items loading are copied in three places:
  - `src/lib/server/day-view.ts:446` (inline, after `getSettings`/`getSeasons` at 422-423);
  - `src/lib/server/book-view.ts:237-248` (`DayData`, `loadDay`);
  - `src/lib/server/commands/create-booking.ts:126-129` (inside the transaction, with `db`).
- `src/lib/server/db/queries/calendar.ts` -- `getSettings`, `getSeasons`, `getDayItems(from, to, db)`. It already imports domain types.
- `src/lib/server/day-view.ts` -- concerns by line:
  - URL helpers 133-175: `HOME_HREF`, `dayHref`, `bookHref`, `parseHhmm`, `isDayErrorQuery`, `DAY_ERRORS`/`DayError` and `dayError`.
  - Notice copy 177-219: `durationLimit`, `sentence`, `coldNoticeText` and `offerNoticeText`.
  - Types at 46-131.
  - `buildDayView` 221, `buildSeasonView` 386, `loadDayView` 412.
- `src/lib/server/book-view.ts:98-108` -- `dayErrorHref` and `bookedHref`, which are URL helpers too.
- The importers of `day-view.ts`:
  - `booked-view.ts:21` (`coldNoticeText`);
  - `book-view.ts:36` (`offerNoticeText`, `parseHhmm`, `DayError`);
  - `book/[date]/[time]/+page.server.ts` (`dayErrorHref`, `bookedHref` from book-view);
  - `booked/+server.ts` (`bookedHref`);
  - components (types only);
  - routes (`loadDayView`);
  - `day-view.test.ts` and `book-view.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/keybox.ts` (new) + `keybox.test.ts` -- Export `KEYBOX_LEAD_MIN`, `keyboxCutoff(start): Instant` (start − 24 h of real time) and `isPastKeyboxCutoff(start, at): boolean` (`at >= cutoff`). Re-export from `index.ts`. Test the boundary (one second before, exactly at the cutoff, after) and a start on 28 March 2027 just after the DST switch, where the cutoff is 24 real hours earlier (wall clock 25 h apart in local time).
- [x] `src/lib/server/booked-view.ts` -- `keyboxText` uses `keyboxCutoff` and `isPastKeyboxCutoff`. The local constant goes.
- [x] `src/lib/domain/start-times.ts` (or `calendar.ts`) + test -- `dayItemsWindow(date): { from: Instant; to: Instant }`: the bookings and blocks that can affect a day's start times, `[day−1 00:00, day+2 00:00)` local time. Write a comment on why the neighbours matter: changeover and heat across midnight.
- [x] `src/lib/server/db/queries/calendar.ts` + test -- `getDayData(date, db)` → `{ settings, seasons, bookings, blocks }` built from `dayItemsWindow`. Replace the three copies: `day-view.ts` loader, `book-view.ts` `loadDay`/`DayData` (export the `DayData` type from the query), and `create-booking.ts` (with the transaction's `db`). The day loader still reads settings/seasons first for `calendarState` and must not query them twice: split so `getDayData` can take already-loaded settings and seasons, or load once and reuse.
- [x] `src/lib/server/guest-urls.ts` (new) -- Move in `HOME_HREF`, `dayHref` (exported), `bookHref`, `parseHhmm`, `DAY_ERRORS`, `DayError`, `isDayErrorQuery`, `dayError`, `dayErrorHref` and `bookedHref`. Update every importer.
- [x] `src/lib/server/notice-text.ts` (new) -- Move in `durationLimit`, `sentence`, `coldNoticeText` and `offerNoticeText`. Update `booked-view.ts` and `book-view.ts`.
- [x] `src/lib/server/day-view.ts` -- Keep the types, `buildDayView`, `buildSeasonView` and `loadDayView`. Update the header comment to name the split.
- [x] Tests -- Move the tests of the moved functions from `day-view.test.ts` and `book-view.test.ts` into `guest-urls.test.ts` and `notice-text.test.ts` without changing their expectations.
- [x] `README.md` Layers section -- One short paragraph on the server view-model modules (`day-view`, `book-view`, `booked-view`, `guest-urls`, `notice-text`) and on `keybox.ts` in the core.
- [x] `sprint-status.yaml` -- Set action item A7 to `done` (when this ships).

**Acceptance Criteria:**
- Given the full suite, when it runs after the refactor, then every pre-existing expectation passes unchanged. Only import paths and file locations of tests differ.
- Given `src/lib/server`, when searched, then the window `addDays(…, -1)` / `addDays(…, 2)` appears only in `dayItemsWindow`, and `24 * 60` for the keybox appears only in the domain.
- Given `day-view.ts`, when measured, then it no longer contains URL or notice-copy helpers.

## Verification

**Commands:**
- `npm run check && npm run lint && npm test && npm run build` -- expected: all clean, with test count ≥ 708.
- `grep -rn "24 \* 60" src/lib/server` -- expected: no keybox match.

## Suggested Review Order

**Rules move into the core**

- Entry point: the 24 h cutoff as a core rule (AD-1, AD-9), used by the confirmation now and the outbox later.
  [`keybox.ts:10`](../../src/lib/domain/keybox.ts#L10)

- The one day window: why day−1 and day+2 matter (changeover and heat across midnight).
  [`start-times.ts:67`](../../src/lib/domain/start-times.ts#L67)

- The confirmation computes the cutoff once and compares instants against it.
  [`booked-view.ts:88`](../../src/lib/server/booked-view.ts#L88)

**One day-data loader**

- Replaces three copies; the day loader passes its settings and seasons so nothing is read twice.
  [`calendar.ts:74`](../../src/lib/server/db/queries/calendar.ts#L74)

- Inside the booking transaction, with the transaction's db.
  [`create-booking.ts:122`](../../src/lib/server/commands/create-booking.ts#L122)

- Day and book loaders.
  [`day-view.ts:361`](../../src/lib/server/day-view.ts#L361)
  [`book-view.ts:243`](../../src/lib/server/book-view.ts#L243)

**day-view.ts split**

- URL helpers and the refusal query, now with direct tests.
  [`guest-urls.ts:1`](../../src/lib/server/guest-urls.ts#L1)

- Heat notice sentences and row-text helpers.
  [`notice-text.ts:29`](../../src/lib/server/notice-text.ts#L29)

**Tests and docs**

- Spring and autumn DST cases for the cutoff.
  [`keybox.test.ts:1`](../../src/lib/domain/keybox.test.ts#L1)

- README file → responsibility map.
  [`README.md:45`](../../README.md#L45)
