---
title: 'Story 3.9: Epic 3 hardening (retro C1–C5)'
type: 'bugfix'
created: '2026-11-28'
status: 'done'
baseline_commit: '33987849462df30adb09625c3f7c631d0faaa25d'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-retro-2026-11-28.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 3 retro found four seams where a guest is left uninformed, past days are rewritten, or the admin is misled (D1–D4), and one inconsistent text (D5):
- After the changeover is lowered, deleting a booking or block finds no affected booking (D1).
- A heat-change row re-upserted after "Angerufen" keeps its `resolved_at`, so a second urgent change never reaches the call list (D2).
- A new or upcoming season may start before today (D3).
- The impact preview says "ANRUF NÖTIG" while the keybox email is only retrying (D4).
- A blank name shows blank in day rows and on the home, but "ohne Name" elsewhere (D5).

**Approach:** Fix each in the core or the command where the rule lives, with a test that reproduces the retro scenario.

## Boundaries & Constraints

**Always:**
- **C1:** `affectedBooking` sizes its window with the largest changeover that can apply: the current one or any live booking's stored changeover, plus the pre-heat maximum. The first live booking after the end still shields the rest, and `impactOn` still decides whether the notice really changed.
- **C2:** every re-upsert of an open heat-change row sets `resolved_at` to null, together with `state`, `due_at`, `reason` and `snapshot_urgent`.
- **C3:** for a new season, or a row whose start is today or later, a start before today is `past` with `field: 'start'`. The route shows it as the field error `settings_season_start_past` (DE "Der Beginn darf nicht in der Vergangenheit liegen.", EN "The start can't be in the past."). The running-season rule stays.
- **C4:** `impactOn` gives `consequence: 'mail'` when the keybox row is `transient_failure` (the retry carries the new notice) and `now` is before `keyboxOverdueAt(start, createdAt)`; from then on, as for `in_flight`, `accepted`, `refused` and `expired`, it gives `call`, matching the call list's `keybox_overdue` entry (amended 2026-11-28 by the user). `endsHeatChangeMail` is unchanged.
- **C5:** one helper gives the display name for all admin views: the trimmed name, or `admin_no_name` when it is null or blank. Day rows, the home, calls and replies use it. Also fix the stale "later stories add the remaining routes" comment in `admin/(portal)/+layout.svelte`.
- Commands keep `BEGIN IMMEDIATE` and `{ok, code}` results; no guest data in logs.

**Ask First:** any change to `endsHeatChangeMail`, AD-6 or AD-21; any new migration or dependency.

**Never:** the C6/C7 lint and refactor work; any UI change beyond the new season error text.

## I/O & Edge-Case Matrix

Pre-heat 30–40. Booking A 10:00–12:00, made with changeover 60; B at 13:00 back to back with A (hot); current changeover lowered to 15 (old window 12:00 + 15 + 40 = 12:55 misses B).

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| C1 delete | delete A after lowering | affected B, class `urgent` (now cold), heat-change row upserted | N/A |
| C1 shield | another booking between A's end and B | that booking is affected, not B | N/A |
| C1 beyond | B at 13:45 (gap 105 > 60 + 40) | no affected booking | N/A |
| C2 | urgent change in the warning window, Angerufen, second urgent change before claim | row `resolved_at` null, call list shows `warning_overdue` again | N/A |
| C3 new | new season starting yesterday | `past`, `field: 'start'`, nothing written | field error |
| C3 upcoming | next season (starts in 10 days) moved to start yesterday | `past`, `field: 'start'` | field error |
| C3 today | start today | saved | N/A |
| C4 | keybox `transient_failure`, urgent change | consequence `mail`; after the accepted retry, no call entry | N/A |
| C4 in flight | keybox `in_flight` | consequence `call` | N/A |
| C4 overdue | keybox `transient_failure`, `now` at / one minute before `keyboxOverdueAt` | `call` / `mail` | N/A |
| C5 | stored name `"  "` | "ohne Name" in day rows, home, calls, replies | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/domain/heat-change.ts:56` `affectedBooking` -- window uses `settings.changeoverMin` only; callers `queries/impact.ts:51`, `queries/block.ts:70`, `commands/create-booking.ts:173`. Hotness uses `laterMade(prev, b).changeoverMin` (`heat.ts:103`). The day window (`dayItemsWindow`, day −1 to day +2) still covers ≤ 150 min after the end.
- `src/lib/server/commands/heat-change.ts:76` `enqueueOne` update `.set(...)` -- add `resolvedAt: null`. `mark-called.ts:68-78` sets `resolvedAt`; `domain/call-list.ts:108` filters on it.
- `src/lib/server/commands/change-settings.ts:128` `saveSeason` -- the start check sits at `:137`; result type `field?: 'end'` at `:44`; header comment `:13`.
- `src/routes/admin/(portal)/settings/+page.server.ts:116` maps `field === 'end'`; messages in `src/lib/schemas/settings.ts:56,74`, `src/lib/server/settings-view.ts:178`, `messages/de.json:516`, `messages/en.json:516`.
- `src/lib/domain/impact.ts:51` -- the consequence; `domain/keybox.ts:69` `endsHeatChangeMail`.
- Name fallbacks: `admin-view.ts:103`, `admin-day-view.ts:163` (`??`) vs `call-view.ts:108`, `reply-view.ts:65` (`trim() ||`).
- Tests: `domain/heat-change.test.ts:114`, `domain/impact.test.ts:39`, `commands/heat-change.test.ts`, `commands/mark-called.test.ts`, `commands/change-settings.test.ts:370-405`, `routes/admin/settings.server.test.ts`, `admin-day-view.test.ts`, `admin-view.test.ts`, `call-view.test.ts`, `reply-view.test.ts`, `commands/delete-booking.test.ts`, `commands/block.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/heat-change.ts` (+ test; `delete-booking.test.ts`, `block.test.ts`) -- largest applicable changeover in the window -- C1.
- [x] `src/lib/server/commands/heat-change.ts` (+ `mark-called.test.ts` or `heat-change.test.ts`) -- clear `resolved_at` on re-upsert -- C2.
- [x] `commands/change-settings.ts`, `settings/+page.server.ts`, `schemas/settings.ts`, `settings-view.ts`, `messages/*.json` (+ tests) -- start before today refused -- C3.
- [x] `src/lib/domain/impact.ts` (+ test, + an outbox/call-list test after the accepted retry) -- `mail` for `transient_failure` -- C4.
- [x] `src/lib/server/display-name.ts` (new, + test), `admin-view.ts`, `admin-day-view.ts`, `call-view.ts`, `reply-view.ts`, `admin/(portal)/+layout.svelte` -- one fallback, comment fix -- C5.
- [x] `epics.md`, `sprint-status.yaml`, `epic-3-retro-2026-11-28.md` -- add Story 3.9, mark C1–C5 addressed -- docs.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint` and `build`, when they run, then all are clean and every matrix row has a test.

## Spec Change Log

- 2026-11-28, review (edge-case hunter):
  - **Trigger:** a retrying keybox row already past `keyboxOverdueAt` is on the call list (`keybox_overdue`), but the preview said "mail" — the D4 contradiction the other way round. A retry due after the start is covered too: the overdue time is at most 5 min before the start.
  - **Amended by the user:** C4 says `call` for `transient_failure` from `keyboxOverdueAt` on; new matrix row "C4 overdue". `impactOn` needs `now` and the affected booking's `createdAt`.
  - **Known-bad state avoided:** the preview promising a mail while the call list asks for a call.
  - **KEEP:** C1, C2, C3, C5 as implemented; the C4 `mail` case before the overdue time and its end-to-end test.

## Design Notes

**Why the global maximum (C1):** the changeover that decides hotness is the later-made booking's of a pair, which may be neither the candidate's nor the current one (a block between two bookings). Taking the largest stored or current changeover can only widen the window, and a too-wide window is harmless: the first booking after the end is the only possible candidate, and `impactOn` returns `none` when nothing changed.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

## Suggested Review Order

**Affected booking after a lowered changeover (C1)**

- Entry point: the window takes the largest current or stored changeover, so a lowered setting no longer hides B.
  [`heat-change.ts:68`](../../src/lib/domain/heat-change.ts#L68)

**Call list after Angerufen (C2)**

- A re-upsert reopens the row for the call list by clearing `resolved_at`.
  [`heat-change.ts:79`](../../src/lib/server/commands/heat-change.ts#L79)

**Impact consequence during a keybox retry (C4, amended)**

- The retry carries the new notice only until the row is overdue, the call list's own rule.
  [`keybox.ts:93`](../../src/lib/domain/keybox.ts#L93)

- `impactOn` picks mail or call from that predicate; `now` is now an input.
  [`impact.ts:58`](../../src/lib/domain/impact.ts#L58)

- `keyboxOverdueAt` moved here from the call list, so both read one definition.
  [`keybox.ts:38`](../../src/lib/domain/keybox.ts#L38)

**Season start in the past (C3)**

- A new or upcoming season may not start before today (Zurich date).
  [`change-settings.ts:142`](../../src/lib/server/commands/change-settings.ts#L142)

- The route turns it into the start field error.
  [`+page.server.ts:122`](../../src/routes/admin/(portal)/settings/+page.server.ts#L122)

**One no-name fallback (C5)**

- The trimmed name or "ohne Name", for day rows, home, calls and replies.
  [`display-name.ts:9`](../../src/lib/server/display-name.ts#L9)

- Day rows used `??` before, so a blank name showed blank.
  [`admin-day-view.ts:164`](../../src/lib/server/admin-day-view.ts#L164)

**Tests and docs**

- The lowered-changeover delete, the shield and beyond cases, and the C4 retry end to end.
  [`delete-booking.test.ts`](../../src/lib/server/commands/delete-booking.test.ts)

- Story 3.9 in the epics.
  [`epics.md:1692`](../planning-artifacts/epics.md#L1692)
