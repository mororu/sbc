---
title: 'Story 3.7: Admin changes operating hours, changeover, horizon, pre-heat window, instructions, contact and password'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '0ea26855e3158b031dca4ffa6053e13bbe18dc97'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The nav tab Einstellungen 404s: operators cannot change hours, changeover, horizon, pre-heat window, keybox instructions, contact address or the admin password without the database or the CLI (FR-20, FR-15).

**Approach:** Add `/admin/settings` with one `surface` card per group, each its own form and "Speichern", validated by one shared schema per card and written by a settings command; the pre-heat card goes through the impact dialog and enqueues heat changes; the password card hashes and signs out every other session.

## Boundaries & Constraints

**Always:**
- Schemas `src/lib/schemas/settings.ts` (pure valibot, errors = message keys): hours `open`/`close` `HH:MM` on 5-min steps, close > open; changeover int 0–60 step 5; horizon int 1–60; preheat `min`/`max` int 15–90 step 5, min ≤ max (error on `min`); instructions `de`/`en` trimmed, required, ≤ 4000; contact `emailSchema` rules, required; password required + `validateNewPassword`. Error copy exact from EXPERIENCE "Settings validation errors" (contact: own key without the example).
- Command `changeSettings(input, { now, db })` in `commands/change-settings.ts`, one `BEGIN IMMEDIATE`, input a discriminated union per card (`hours | changeover | horizon | preheat | instructions | contact`); revalidates ranges (`invalid`); updates only that card's columns. Only `preheat` enqueues: it recomputes `getPreheatImpact` with the posted window, refuses `stale` when `impactToken` differs, writes the window, then `enqueueHeatChanges(all future live booking ids)`. Others create no outbox row and touch no booking. Returns `{ ok: true } | { ok: false, code }`.
- Query `getPreheatImpact({ minMin, maxMin }, now, db)` in `queries/impact.ts`: future (start > now) live bookings, per local date `getDayData`, `impactOn` with the booking itself as `affected` and the new preheat (told `toldNotice`, keybox `keyboxStateOf`); returns `{ from, to, changed: Impact[] (class ≠ none), token }`; token = JSON of from, to and each changed `impactToken`.
- `changeAdminPassword({ hash, keepSessionId }, …)` in `admin-session.ts`: argon2id prefix check (`invalid`), replaces the hash, deletes every `admin_session` row except `keepSessionId`. The route hashes outside the transaction; the password is never in `values`, logs or results.
- View `src/lib/server/settings-view.ts` `loadSettings(locale, now, db)`: cards in order Betriebszeiten, Wechselzeit (note), Buchungshorizont, Vorheizzeit, Anleitung DE/EN, Kontaktadresse, Passwort (note); prefilled values (password empty), labels, error texts; hours card carries the outside flag (`buildHomeFlags` `outside` over `getFutureFlagCandidates`), shown whenever non-empty; `preheatDialog(impact, locale)` → title, what ("30–40 → 40–50 Minuten · {n} …", plural), confirm "Speichern", cancel, token.
- Route `admin/(portal)/settings/+page.{server.ts,svelte}`: actions `hours`, `changeover`, `horizon`, `preheatCheck`, `preheat`, `instructions`, `contact`, `password`. Results carry `card`: `{ card, saved: true }`; 400 `{ card, errors, values }`; `preheatCheck` with an unchanged window saves nothing and returns saved, else `{ card, values, dialog }`; `preheat` stale → 409 `{ card, code: 'stale', dialog }` with the new impact; lock timeout → 503 `{ card, code: 'failed' }`.
- UI: `SettingsCard.svelte` (section-label `h2`, fields, note, inline message, secondary "Speichern" with `aria-disabled` while running). Paired fields two columns; cards stack 20 px gap, two columns from 1024 px capped `--admin-max`; textareas min 132 px, vertical resize. Errors: `aria-invalid`, focus first error, values kept, other cards unchanged; "Gespeichert." `role="status"` in that card; failure `admin_action_failed` in that card, focused. Pre-heat: `ImpactDialog` with optional `row` (without it the what line carries `{id}-consequence`); stale shows new count + stale line, focus on title.
- Leave the page open for 3.8's Saison and Schlüsselbox-Code cards (one card per group).

**Ask First:** a migration; a new dependency; a browser test layer (P3).

**Never:** changing existing bookings or their `changeover_min`; outbox rows for non-preheat cards; resending mail; echoing or logging the password; writing settings outside the command.

## I/O & Edge-Case Matrix

`now` Di 2027-01-12 11:06 Zurich; seed: 10:00–22:00, changeover 15, preheat 30–40, horizon 14.

| Scenario | State / Input | Expected |
|---|---|---|
| Changeover | 15 → 30, booking 17:00–18:00 | booking row unchanged, 0 outbox rows; next kind-2 start 18:30 |
| Hours | 12:00–21:00, booking 20:30–21:30 | saved, nothing changed or enqueued; hours card "1 Buchung liegt … Sie bleibt gültig." + link; home flag; guest day offers no start before 12:00 and none ending after 21:00 |
| Horizon | 14 → 21 | strip/acceptance to today + 21; bookings unchanged |
| Preheat check | 30–40 → 40–50, cold 18:00 told 17:20–17:30 | dialog n = 1 "1 Buchung bekommt …" |
| Preheat save | confirm, token fresh | window saved, notice 17:10–17:20, one `heat_change` pending urgent due now + 10; keybox-phase booking: no row, on call list |
| Preheat stale | other booking changed since check | `stale`, nothing saved, new count + stale line |
| Delete stale | delete dialog open, then preheat saved | `deleteBooking` → `stale` |
| Unchanged preheat | 30–40 → 30–40 | saved, no dialog, no rows |
| Invalid | changeover 7; preheat 50–40; horizon 0; close ≤ open; empty; bad email; short password | 400 per-field keys, nothing saved, values kept (never password) |
| Instructions/contact | saved | next keybox claim uses them (instructions per locale, `Reply-To`); footer link new address; no resend |
| Password | new ≥ 12 chars | hash replaced, other sessions deleted, own kept; others redirected to "Bitte melde dich wieder an." |
| Failure | lock timeout | 503 `failed`, in-card message |

</frozen-after-approval>

## Code Map

- `db/schema.ts:27` `setting` columns + CHECKs; `queries/calendar.ts:10` `getSettings`, `:74` `getDayData`; `queries/setting.ts` `getAdminContact`, `getKeyboxSettings`.
- `queries/impact.ts` `getDeletionImpact` (pattern); `domain/impact.ts` `impactOn`, `impactToken`; `commands/heat-change.ts` `enqueueHeatChanges`; `commands/delete-booking.ts`, `create-block.ts` (command + stale pattern), `create-booking.ts` `isLockTimeout`; `commands/index.ts` exports.
- `commands/admin-session.ts:177` `setAdminPassword` (pattern); `password.ts` `hashPassword`; `schemas/admin.ts` `validateNewPassword`; `schemas/booking.ts:75` `emailSchema`; `schemas/block.ts` (schema + error-key pattern), `schemas/index.ts`.
- `admin-view.ts` `buildHomeFlags`; `queries/admin.ts:346` `getFutureFlagCandidates`; `admin-day-view.ts` `loadAdminRowContext`.
- `admin/(portal)/blocks/new/+page.{server.ts,svelte}` + `#lib/blocks-outcome.ts` (check → dialog → save flow, focus handling); `ImpactDialog.svelte` (make `row` optional); `TextField.svelte`, `InlineMessage.svelte`; `admin-nav.ts` `ADMIN_TAB_HREF.settings`.
- `hooks.server.ts` guard (`locals.adminSession.id`; ended session → login with "Bitte melde dich wieder an.").
- `messages/{de,en}.json` (`field_required`, `admin_action_failed`, `admin_impact_stale`, `admin_cancel`, `admin_flag_outside`, `admin_password_*`).
- Tests: `commands/delete-booking.test.ts`, `block.test.ts` (fixtures), `routes/admin/server.test.ts` (commands mock, lock timeout), `routes/admin/render.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/schemas/settings.ts` (+test, export) -- per-card schemas and error keys; matrix Invalid.
- [x] `src/lib/server/db/queries/impact.ts` (+test) -- `getPreheatImpact`.
- [x] `src/lib/server/commands/change-settings.ts` (+test, export) -- matrix Changeover, Hours, Horizon, Preheat save/stale, Unchanged, Delete stale.
- [x] `src/lib/server/commands/admin-session.ts` (+test) -- `changeAdminPassword`.
- [x] `src/lib/server/settings-view.ts` (+test) -- cards, flag, dialog text DE/EN, plural.
- [x] `src/routes/admin/(portal)/settings/+page.server.ts` (+ server tests) -- every action, stale, failure, password never in values.
- [x] `src/lib/settings-outcome.ts` (+test), `SettingsCard.svelte`, `ImpactDialog.svelte`, `settings/+page.svelte` (+ render tests: cards, labels, notes, prefill, no password value, errors) -- client decisions pure.
- [x] Worker/footer test -- matrix Instructions/contact: a keybox row claimed after the change sends the new instructions and `Reply-To`.
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy; drafted list "Drafted copy for operator review (Story 3.7)".

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given a guest page after any save, then it reads the new settings on the next request (no cache).

## Spec Change Log

## Design Notes

- Review decisions: a stored close of 1440 shows and saves as "00:00" (end of day); a password change from a session that another change already ended is refused (`not_found`, back to sign-in); instruction length counts UTF-16 units after CRLF→LF, matching `maxlength`; a pre-heat window of zero changed bookings still opens the dialog ("0 Buchungen …"), as the UX copy has no other variant.

- Pre-heat recomputation touches every future booking, so `affected` is each booking itself; the token covers only changed bookings, so an unrelated booking change does not refuse the save.
- The hours flag is derived on every load (not only right after save), so it stays visible until the flagged bookings pass; 3.8's season card can reuse it.
- `changeAdminPassword` is a new command rather than `setAdminPassword({ reset })`: reset deletes the current session too.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** focus after save/error/stale, two columns at 1024 px, 320 px, both themes (no browser test layer, P3).

## Suggested Review Order

**Settings command**

- Entry point: one transaction per card; only pre-heat rechecks its token and enqueues heat changes.
  [`change-settings.ts:65`](../../src/lib/server/commands/change-settings.ts#L65)

- The pre-heat impact: every future booking against the new window; the token covers only changed ones.
  [`impact.ts:116`](../../src/lib/server/db/queries/impact.ts#L116)

- Password: replaces the hash, keeps only the caller's session, refuses a session already ended.
  [`admin-session.ts:205`](../../src/lib/server/commands/admin-session.ts#L205)

**Validation**

- One schema per card; "Bis" 00:00 is end of day; instructions count UTF-16 units after CRLF→LF.
  [`settings.ts:182`](../../src/lib/schemas/settings.ts#L182)

**Route and view**

- Pre-heat check → dialog → save, stale with the new impact; password hashed outside the transaction.
  [`+page.server.ts:115`](../../src/routes/admin/(portal)/settings/+page.server.ts#L115)

- Cards, prefill, the derived hours flag and the dialog text.
  [`settings-view.ts:218`](../../src/lib/server/settings-view.ts#L218)

**UI**

- Per-card outcomes and focus; the pre-heat dialog flow.
  [`+page.svelte:156`](../../src/routes/admin/(portal)/settings/+page.svelte#L156)

- Pure client decisions behind the page.
  [`settings-outcome.ts:39`](../../src/lib/settings-outcome.ts#L39)

- The impact dialog without a mini row (the what line describes it).
  [`ImpactDialog.svelte:43`](../../src/lib/components/ImpactDialog.svelte#L43)

**Tests and docs**

- Matrix coverage: command, schema, view, route and worker tests.
  [`change-settings.test.ts:1`](../../src/lib/server/commands/change-settings.test.ts#L1)

- The flow and the drafted copy for operator review.
  [`README.md:725`](../../README.md#L725)
