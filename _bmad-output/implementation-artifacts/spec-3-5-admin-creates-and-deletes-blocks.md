---
title: 'Story 3.5: Admin creates and deletes blocks'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '3815c46ae70f9d76024a7efcb49a95d098cf7ec8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Operators cannot block time for cleaning, maintenance or private use, or remove a block, without the database, and nobody sees beforehand how a block moves the next guest's arrival time.

**Approach:** `/admin/blocks` lists upcoming blocks with a delete impact dialog; `/admin/blocks/new` is a form whose "Prüfen" runs a shared block check (past, overlap, back-to-back gap, impact via `impactOn`) and opens "Block speichern?". `createBlock`/`deleteBlock` commands recompute the same check and refuse `past`/`conflict`/`stale`/`not_found`, then write and `enqueueHeatChanges` the affected booking. The admin day view shows the day's blocks with their reason.

## Boundaries & Constraints

**Always:**
- No migration: the Story 1.3 `block` table (id, start_at, end_at, reason). Deleting a block removes its row (blocks have no `deleted_at`).
- Pure `blockConflict(candidate, bookings)` in `src/lib/domain/block.ts`: `{ kind: 'overlap', bookings }` (live bookings intersecting [start, end), start order) wins over `{ kind: 'gap' }` (candidate intersects [earlier end, later start) of a back-to-back pair, changeover recorded on the later-made booking, AD-8), else null. Touching a booking's start or end is allowed (no changeover next to a block). Overlapping another block is allowed.
- One query per action shared by preview and command (`src/lib/server/db/queries/block.ts`): `getBlockCheck({ start, end }, now, db)` → `{ date, past (start ≤ now), conflict (overlapping bookings with first names), impact, affectedFirstName }` over `getDayData(localDate(start))` + candidate; `getBlockDeletion(blockId, now, db)` → null for unknown, else `{ block, date, started, impact, affectedFirstName }` with one block of equal start/end removed. Affected = `affectedBooking({ end })`; told = `toldNotice`; keybox = `keyboxStateOf`.
- `createBlock({ start, end, reason, impactToken })`: one `BEGIN IMMEDIATE`; `invalid` (bad instants/reason, end ≤ start) → `past` → `conflict` → `stale` → insert → `enqueueHeatChanges([affected.id])`. `deleteBlock({ blockId, impactToken })`: `not_found` → `past` → `stale` → delete row → enqueue. Results `{ ok: true, … } | { ok: false, code }`; never throw for expected outcomes.
- Valibot `src/lib/schemas/block.ts`: date, start, end (HH:MM, 5-minute step), reason `cleaning|maintenance|private_use`; errors i18n keys (`field_required`, end not after start, not on a 5-minute step); `fail(400, { errors, values })`, focus first error, values kept. The block lies on one local date (end ≤ 23:55).
- Copy exact from EXPERIENCE.md/epics (titles, what line "Reinigung · Mo 11. Januar, 09:00–11:00", "Block speichern"/"Block löschen", overlap and gap refusals, "Keine Blocks geplant.", "Gespeichert.", "Schon erledigt.", stale, failure); drafted DE+EN (copy items 28, 30–33, plus list delete button, "Block gelöscht.", past-start line, day-view block row) in `messages/` and README "Drafted copy for operator review (Story 3.5)".
- Reuse `ImpactDialog`, `buildImpactRow`, `SegmentedControl` (generalise value to string|number), `InlineMessage`, `TextField`; admin guard already covers `/admin/blocks*`.

**Ask First:** a browser test layer (P3); any new dependency; a migration.

**Never:** block reasons in guest queries or view models; blocks heating or needing a changeover; removing bookings; blocks across midnight; touching the guest offer/book wiring beyond regression tests.

## I/O & Edge-Case Matrix

`now` Mo 2027-01-11 08:00 Zurich; changeover 15; pre-heat 30–40.

| Scenario | State / Input | Expected |
|---|---|---|
| Overlap | Anna 18:00–19:00, Ben 19:30–20:30; block 18:30–20:00 | `conflict`: "Dieser Block überschneidet 2 Buchungen: Mo 18:00 (Anna), Mo 19:30 (Ben). Blocks löschen keine Buchungen." (singular drafted); nothing written |
| Gap | back-to-back 17:00–18:00, 18:15–19:15; block 18:00–18:15 or 18:05–18:10 | `conflict`: "Zwischen diesen zwei Buchungen ist kein Platz für einen Block." |
| Adjacent | block 19:00–19:30 after a 18:00–19:00 booking, no gap pair | allowed |
| Mail | cold 18:00 told 17:20–17:30, keybox `pending`; cleaning 16:00–17:25 | dialog "Block speichern?", "Reinigung · Mo 11. Januar, 16:00–17:25", mini row "Neuer Hinweis: komm zwischen 17:25 und 17:30.", "bekommt eine Mail."; save upserts one open urgent `heat_change` due 08:10 |
| Call | same, keybox `accepted`/`in_flight`/`transient_failure` | *Anruf nötig*; save enqueues nothing |
| No effect | no booking in window | "Kein Effekt auf andere Buchungen."; nothing enqueued |
| Delete, no effect | cleaning 09:00–11:00, cold 11:30 told "11:00" (clamped) → 10:50–11:00 (only widened) | "Block löschen?", "Reinigung · Mo 11. Januar, 09:00–11:00", destructive "Block löschen", "Kein Effekt …"; row removed, nothing enqueued |
| Delete, good news | A 16:00–17:00, block 17:00–17:15 (inserted directly), B 17:15 told cold, keybox pending | mini row "Kaltstart → heiss", "bekommt eine Mail."; one open good-news `heat_change` for B |
| Past | start ≤ now on Prüfen, save, or delete | `past`; nothing written; form: inline at start; dialog: past line, no confirm |
| Stale | token, then a booking/block/pre-heat change alters the impact | `stale`; nothing written; dialog shows new impact + stale line, focus title |
| Stale chain | delete-booking dialog open; a block saved that changes its affected booking | `deleteBooking` → `stale` |
| Gone | block deleted by another admin, then confirm | `not_found`; list reloads, status "Schon erledigt." |
| Failure | lock timeout / network | inline "Das hat nicht geklappt. Nichts wurde geändert …" focused |
| Guest | saved block 09:00–11:00 | guest day: taken row "bis 11:00", no reason; overlapping booking refused; booking at 11:30 after a block ending 11:10 is a cold start |

</frozen-after-approval>

## Code Map

- `src/lib/domain/impact.ts` `impactOn`/`impactToken`; `heat-change.ts` `affectedBooking`; `heat.ts` `bookingHeat`, `Block` (no id), laterMade rule; `index.ts` exports.
- `src/lib/server/db/queries/impact.ts` `getDeletionImpact` (pattern), `firstName`; `booking.ts` `toldNotice`, `keyboxStateOf`; `calendar.ts` `getDayData`/`getDayItems` (guest: no reason — keep); `admin.ts:238-298` accepted-day/strip extra dates already count blocks.
- `src/lib/server/commands/delete-booking.ts` (shape, order, enqueue after write), `heat-change.ts:89` `enqueueHeatChanges`, `create-booking.ts` `isLockTimeout`, `index.ts`.
- `src/lib/server/impact-view.ts` `buildImpactRow`; `admin-day-view.ts:483` `buildAdminDeleteView` (dialog view pattern), `:250` `buildAdminDayView`/`loadAdminDayView` (add blocks).
- `src/lib/components/ImpactDialog.svelte` (`action`, `fields`, `outcome`), `SegmentedControl.svelte` (numeric `value` today), `AdminDayView.svelte`, `AdminDayTable.svelte`, `AdminBookingRow.svelte`.
- `src/routes/admin/(portal)/booking/[id]/+page.server.ts` + `+page.svelte` (action/fail/enhance/stale/focus pattern); `src/lib/admin-nav.ts` (`blocks` tab href exists).
- `src/lib/schemas/booking.ts` (schema/error-key pattern), `schemas/index.ts`.
- Tests: `commands/delete-booking.test.ts` (fixtures), `routes/admin/server.test.ts` (commands mock incl. lock timeout), `render.test.ts`, `queries/*.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/block.ts` (+test, export) -- `blockConflict` (Overlap, Gap, Adjacent rows); FR-19 regression (block end 11:10 → 11:30 cold, no kind-2).
- [x] `src/lib/schemas/block.ts` (+test, export) -- `parseBlockForm` → `{ start, end, reason }` instants or errors.
- [x] `src/lib/server/db/queries/block.ts` (+test, export) -- `getBlockCheck`, `getBlockDeletion`, `getUpcomingBlocks(now)` (end > now, start order, reason), `getAdminDayBlocks(from, to)`.
- [x] `src/lib/server/commands/create-block.ts`, `delete-block.ts` (+tests, export) -- matrix: Overlap, Gap, Mail, Call, No effect, Delete, Past, Stale ×3 sources, Stale chain, Gone.
- [x] `src/lib/server/block-view.ts` (+test) -- list view (rows "Mo 11. Januar · 09:00–11:00 · Reinigung", delete dialog per not-started row, empty line), form labels/reasons, check view (dialog or refusal text), `admin-day-view.ts` block rows (time range + reason).
- [x] `src/routes/admin/(portal)/blocks/+page.server.ts`, `+page.svelte` -- list, `?/delete` (303 `/admin/blocks?deleted`, 409 stale/past, 410 gone, 503), statuses "Gespeichert."/"Block gelöscht."/"Schon erledigt." (`role=status`), h1 focus after delete.
- [x] `src/routes/admin/(portal)/blocks/new/+page.server.ts`, `+page.svelte` -- form (date, Von, Bis with `step=300`, reason fieldset), `?/check` (400 errors, 409 past/conflict refusal, else dialog view + token), `?/save` (303 `/admin/blocks?saved`, 409 stale with new dialog view, past, conflict → refusal in form, 503).
- [x] `AdminDayView.svelte`, `AdminDayTable.svelte`, `SegmentedControl.svelte` -- block rows in start order among bookings; string values.
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, drafted list, routes/actions.
- [x] Server + render tests -- check/save/delete outcomes, empty list, day-view block row, guest view model without reason.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given the preview and the command, then both compute through `getBlockCheck`/`getBlockDeletion` + `impactOn` only.
- Given `/admin/blocks` with no upcoming blocks, then "Keine Blocks geplant." and the "Neuer Block" link show.

## Spec Change Log

## Design Notes

- Saving needs JavaScript (the dialog); without it "Prüfen" does nothing beyond validation — accepted as in 3.3.
- A started (running) block is listed without a delete button and with "Hat schon begonnen.".
- `conflict` on save (someone booked meanwhile) closes the dialog and shows the refusal in the form, focused.
- Status after save/delete comes from a `?saved` / `?deleted` flag on `/admin/blocks` (no data in the URL).

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** dialog focus/Esc/scrim, segmented control keyboard, 320 px layout (no browser test layer, P3).

## Suggested Review Order

**Conflict rule**

- Entry point: overlap is checked first, then the gap between back-to-back bookings, using the later-made booking's changeover.
  [`block.ts:26`](../../src/lib/domain/block.ts#L26)

**Commands**

- Create: one transaction refuses invalid, past, conflict or stale, then enqueues heat changes.
  [`create-block.ts:54`](../../src/lib/server/commands/create-block.ts#L54)

- Delete: refuses not_found, past or stale, then enqueues heat changes.
  [`delete-block.ts:27`](../../src/lib/server/commands/delete-block.ts#L27)

**Views and client**

- The impact dialog reuses the Story 3.3 core.
  [`block-view.ts:94`](../../src/lib/server/block-view.ts#L94)

- Pure client decisions: save posts the checked values, and the dialog closes if a field changes.
  [`blocks-outcome.ts:90`](../../src/lib/blocks-outcome.ts#L90)

**Docs**

- The flow and the drafted copy for operator review.
  [`README.md:655`](../../README.md#L655)
