---
title: 'Story 3.3: Admin deletes a booking with an impact preview'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'b8af867319bb2428a8ad7b610e460647fa1df3b2'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Operators cannot cancel a guest's booking without touching the database, and nobody sees beforehand what the deletion does to the booking behind it (email, call, or nothing).

**Approach:** A "Buchung löschen" button on `/admin/booking/[id]` opens a native impact dialog computed by a pure impact core; confirming posts an impact token to a `deleteBooking` command that recomputes the impact, refuses `stale`/`past`/`not_found`, soft-deletes, cancels the booking's open outbox rows and enqueues the affected booking's heat change via `enqueueHeatChanges`.

## Boundaries & Constraints

**Always:**
- Pure `impactOn` in `src/lib/domain/impact.ts`: given the affected booking (or null), the live bookings and blocks *after* the change, the pre-heat window, its told notice and keybox state, returns `{ affected, told, current, class, consequence }` with consequence `none` (no affected, no told, or `classifyHeatChange = none`) · `mail` (keybox state null or not `endsHeatChangeMail`) · `call`. `impactToken(impact)` is a deterministic string over every shown value. Reusable by 3.5/3.7.
- "Told" = snapshot of an `in_flight` heat-change row, else `last_told_notice`: one query `toldNotice(bookingId, db)` used by both the preview and `enqueueOne` (refactor, same behaviour).
- `deleteBooking({ bookingId, impactToken }, { now, db })` in `commands/delete-booking.ts`: one `BEGIN IMMEDIATE`; order `not_found` (unknown or deleted) → `past` (start ≤ now) → `stale` (token ≠ recomputed; tests write blocks and pre-heat settings directly) → set `deleted_at = now`, cancel its `pending`/`transient_failure` rows (all kinds, `outcome_at = now`), `enqueueHeatChanges([affected.id])`. Returns `{ ok: true, date }` or `{ ok: false, code }`. Never emails the deleted guest.
- Preview and command share one query `getDeletionImpact(bookingId, now, db)` (day data, `affectedBooking({ end, bookingId })`, told, keybox state, first name) + `impactOn`.
- Copy exact from EXPERIENCE.md (title, what line, consequences, markers, "Neuer Hinweis: komm zwischen …", stale, past, gone, failure); others drafted in `messages/` DE+EN and listed in README "Drafted copy for operator review (Story 3.3)".
- Dialog per EXPERIENCE "Impact dialog": `showModal()`, focus on Abbrechen, Esc/scrim cancel, focus back to trigger, `aria-labelledby` title, `aria-describedby` consequence line; phone bottom-anchored stacked buttons, from 1024 px centred ≤ 480 px side by side right-aligned; 90 dvh scroll; `scrim-dark` in dark mode; 44 px targets.

**Ask First:** a browser test layer (P3); any new dependency; a migration.

**Never:** emailing the deleted guest; hard deletes; reply reminders (3.4) or call-list UI (3.6); block impact (3.5).

## I/O & Edge-Case Matrix

`now` Di 2027-01-12 10:00 Zurich; changeover 15; pre-heat 30–40; Anna 16:00–17:00, Tom 17:15–18:15 hot, told "Schon heiss um 17:15."

| Scenario | State | Expected |
|---|---|---|
| Call | Tom keybox `accepted` (or `in_flight`/`transient_failure`) | mini row "Tom, 17:15:", "heiss → Kaltstart" (hidden "wird zu"), "weniger als 24 h." + *Anruf nötig*, "Neuer Hinweis: komm zwischen 16:35 und 16:45."; confirm enqueues nothing for Tom |
| Mail | Tom keybox `pending` | "bekommt eine Mail." + new notice; confirm upserts one open `heat_change` (Tom) due 10:10, urgent; an existing open row is reset, not duplicated |
| Good news, call | Tom cold told, keybox accepted, deletion makes him hot | marker "optional" instead of *Anruf nötig* |
| No effect | no booking within window / block between / told null | "Kein Effekt auf andere Buchungen."; nothing enqueued |
| Stale | token from before a new booking / block / pre-heat change altered the impact | `stale`, nothing written; dialog shows new impact + stale line, focus on title |
| Past | start passed while open | `past`, nothing written; dialog shows "Hat schon begonnen." |
| Gone | deleted by another admin: confirm / open detail | `not_found`; view shows "Diese Buchung gibt es nicht mehr." + link to the day (detail of a deleted booking no longer 404s; unknown id still 404) |
| Failure | lock timeout / network error | inline "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." focused; nothing changed |
| Cleanup | Anna has pending confirmation, keybox, transient heat_change, accepted confirmation | first three `cancelled`, accepted untouched; Anna gone from guest day (16:00 offered again), admin day, next bookings, call list |
| FR-12 | Jonas Sa 18:30 told cold 17:50–18:00; 17:15–18:15 booked (open row), deleted 5 min later | delete upserts nothing; claim at due finds `none`, row `cancelled`, no send, told unchanged |
| Started | detail of a started booking | "Hat schon begonnen.", no button |

</frozen-after-approval>

## Code Map

- `src/lib/domain/heat-change.ts` `classifyHeatChange`, `affectedBooking`; `keybox.ts:69` `endsHeatChangeMail`; `notice.ts` `bookingNotice`/`serializeNotice`.
- `src/lib/server/commands/heat-change.ts` `enqueueOne` (in-flight told logic to move into `toldNotice`), `OPEN_STATES`, `enqueueHeatChanges` (throws outside a transaction); `create-booking.ts` command shape and `isLockTimeout`.
- `src/lib/server/db/queries/booking.ts` `currentNotice` (pattern for day data + `bookingNotice`); `calendar.ts` `getDayData` (live only).
- `src/lib/server/commands/outbox.ts:153` sweep and `cancelInFlightOfDeleted` already handle deleted bookings worker-side; claim recheck in `claimDueRow` (FR-12 row).
- `src/lib/server/admin-day-view.ts:430` `buildAdminBookingView`/`loadAdminBookingView` (add `delete` model: impact view, token, or `gone`); `notice-text.ts` time/notice texts; `admin-nav`-style client helpers.
- `src/routes/admin/(portal)/booking/[id]/+page.*`; `src/routes/admin/login/+page.server.ts` (action + `fail` + lock timeout pattern).
- Tests: `src/routes/admin/server.test.ts`, `render.test.ts`, `queries/admin.test.ts`, `commands/*.test.ts` (in-memory DB, env mock).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/impact.ts` (+test, export) -- `impactOn`, `impactToken`.
- [x] `src/lib/server/db/queries/` (+test) -- `toldNotice`, `getDeletionImpact`; `heat-change.ts` uses `toldNotice`.
- [x] `src/lib/server/commands/delete-booking.ts` (+test, export in `index.ts`) -- `deleteBooking` per matrix (Mail, Call, Stale ×3 sources, Past, Gone, Cleanup, FR-12).
- [x] `src/lib/server/impact-view.ts` (+test) -- mini-row text model (who, from/to labels, consequence, marker, new notice, consequence id) shared by later dialogs.
- [x] `src/lib/server/admin-day-view.ts` (+test) -- detail delete model; deleted booking → gone view.
- [x] `src/lib/components/ImpactDialog.svelte`, `HeatChangeLine.svelte`; `booking/[id]/+page.server.ts` (`delete` action: id check, command, 303 to `/admin/day/{date}`, `fail(409|410|503, { code, … })`) and `+page.svelte` (`use:enhance`, stale re-render + title focus, inline failure, h1 focus on the day after success).
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, drafted list, action.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given a future booking's detail, then after a rule the destructive "Buchung löschen" (full width < 1024 px) opens "Buchung löschen?" with what line "Anna Meier · Di 12. Januar, 16:00–17:00", the mini row, destructive "Buchung löschen" then "Abbrechen".
- Given the preview and the command, then both compute the impact through `getDeletionImpact` + `impactOn` only.

## Design Notes

- Mini row label: first name and start time ("Tom, 17:15:"); short weekday added when the affected booking is on another local date. No name: time only. Heat-change line: told heat → current heat ("heiss", "Kaltstart"); cold → cold reads "Kaltstart → neue Ankunftszeit" (drafted). New notice: cold range uses the EXPERIENCE line; hot "Neuer Hinweis: schon heiss um {time}." and other cold cases "Neuer Hinweis: {cold notice text}" (drafted).
- `call` consequence shows "weniger als 24 h." with *Anruf nötig* (urgent) or "optional" (good news), the call-list markers.
- Impact is recomputed on confirm only; the stale refusal covers changes made while open. The dialog needs JS (admin tool); without JS the button does nothing — accepted.
- **A8 decision:** a guest resubmit whose booking an admin deleted keeps returning `conflict` with the generic message: the resubmit window is seconds, the form re-renders with a new token and the time is offered again, and telling a guest mid-submit that an admin deleted it helps nobody. No code change; AD-3's "never conflict" wording is amended with the S1 spine reconciliation.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** dialog focus, Esc/scrim, inert background, phone/laptop layout, dark scrim (no browser test layer, P3).

## Suggested Review Order

**Impact core and command**

- Entry point: the pure impact, its consequence (mail / call / none) and the stale token.
  [`impact.ts:44`](../../src/lib/domain/impact.ts#L44)

- Delete command: not_found → past → stale, soft delete, cancel open rows, enqueue.
  [`delete-booking.ts:29`](../../src/lib/server/commands/delete-booking.ts#L29)

- One query shared by preview and command: affected booking, told notice, keybox state.
  [`impact.ts:39`](../../src/lib/server/db/queries/impact.ts#L39)

- Told notice (in-flight snapshot else last told), now also used by the heat-change helper.
  [`booking.ts:108`](../../src/lib/server/db/queries/booking.ts#L108)

- Token covers what the impact is; name and now-dependent wording excluded on purpose.
  [`impact.ts:62`](../../src/lib/domain/impact.ts#L62)

**Detail and dialog**

- Detail loader: delete model only before start, gone view for a deleted booking.
  [`admin-day-view.ts:572`](../../src/lib/server/admin-day-view.ts#L572)

- Mini-row text model, reusable by the block and pre-heat dialogs.
  [`impact-view.ts:69`](../../src/lib/server/impact-view.ts#L69)

- Action: 303 to the day, 409 stale/past, 410 gone, 503 lock timeout.
  [`+page.server.ts:26`](../../src/routes/admin/(portal)/booking/[id]/+page.server.ts#L26)

- Client outcome handling: stale re-render, busy guard, focus moves.
  [`+page.svelte:90`](../../src/routes/admin/(portal)/booking/[id]/+page.svelte#L90)

- Native dialog: showModal, guarded close, scrim tap outside the panel only.
  [`ImpactDialog.svelte:69`](../../src/lib/components/ImpactDialog.svelte#L69)

**Peripherals**

- Drafted copy, A8 decision and the action docs.
  [`README.md:590`](../../README.md#L590)

- Matrix tests for the command.
  [`delete-booking.test.ts:1`](../../src/lib/server/commands/delete-booking.test.ts#L1)
