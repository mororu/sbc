---
title: 'Story 4.1: An anonymous analytics record is kept for every booking'
type: 'feature'
created: '2026-11-28'
status: 'in-review'
baseline_commit: '06fa64d03f4fa15bb8c01d534915a0b88d7002cf'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The April questions (FR-22 to FR-25) need numbers that survive the purge and later settings changes. Nothing records them yet.

**Approach:** A worker job writes one anonymous row per started booking and one per passed season day, insert-if-absent, with the rules in the pure core.

## Boundaries & Constraints

**Always:**
- `analytics_booking` (unique booking id) and `analytics_day` (unique date), no name, email or mobile column (migration `0010`).
- The guest key is HMAC-SHA256 of the trimmed, lowercased email with `GUEST_KEY_SECRET`, read only in `env.ts`.
- Local date, `hhmm`, weekday and ISO week come from `src/lib/time`.
- One command, `snapshotAnalytics`, one `BEGIN IMMEDIATE` transaction; the worker runs it each tick. Records are never changed. Logs hold counts only.
- Day blocks and unbooked times are stored as Zurich clock times (JSON), so Epic 6 needs no time-zone conversion.

**Never:** No analytics views (Epic 6). No change to the mail path.

</frozen-after-approval>

## Code Map

- `src/lib/domain/analytics.ts` -- `bookingStartKind`, `unbookedStartTimes`.
- `src/lib/server/commands/snapshot-analytics.ts` -- the only writer of both tables.
- `src/lib/server/guest-key.ts`, `src/lib/time/zurich.ts` (`isoWeekday`, `isoWeek`), `src/lib/server/db/schema.ts`, migration `0010_analytics.sql`.
- `src/lib/server/worker/index.ts` -- `runJobs`.

## Tasks & Acceptance

- [x] Core, time helpers, guest key, schema and migration, command, worker job, each with tests.
- [x] README section.

**Acceptance Criteria:** those of Story 4.1 in `epics.md`.

## Spec Change Log

## Design Notes

- **One evaluation per day:** offers depend on `now` only through "has not started", so one call just before midnight equals one per start time. A test compares it with the literal definition minute by minute.
- **Null guest key:** only when the email was erased before the snapshot (downtime past the purge). The worker runs the snapshot before the purge in every tick.
- **A failing job keeps the heartbeat:** the heartbeat drives the mail warning on the admin home; a job error is logged.
- **Not recorded:** days outside every season, also when a booking lies there after a season was shortened; the booking itself is recorded with its own `season_id`.

## Verification

- `npm test`, `npm run check`, `npm run lint`, `npm run build`.
