---
title: 'Story 3.8: Admin manages seasons and rotates the keybox code'
type: 'feature'
created: '2026-11-25'
status: 'done'
baseline_commit: '40775b2abdc0117c97e2c642ae25f50db4b5fc02'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Operators cannot set season dates, open next winter's season or change the keybox code without the database (FR-20, FR-1, FR-11). The schema does not stop two seasons from overlapping (Epic 1 retro F12).

**Approach:** Add the Saison and Schlüsselbox-Code cards to `/admin/settings` (3.7's card pattern). Both write through `changeSettings`. The season card edits the current or next season in place, or creates the next one, and refuses overlaps in the command. The code card replaces the code and lists upcoming bookings whose keybox email went out with an old code.

## Boundaries & Constraints

**Always:**
- Schemas in `schemas/settings.ts`:
  - `season`: `start` and `end` are required `yyyy-mm-dd` (`isValidDate`), with end > start; the error `settings_season_order` goes on `end`. An optional `id` is a positive integer string.
  - `keybox`: `code` is trimmed and required.
- `changeSettings` input gains `{ card: 'season'; id: number | null; startDate; endDate }` and `{ card: 'keybox'; code }`:
  - season: revalidate (`invalid`). With an id, a missing row → `not_found`, and a row that ended before today (Zurich) → `past`. Overlap with any other row (inclusive dates) → `conflict`. Then update in place, or insert when the id is null.
  - keybox: write `keybox_code`.
  - Neither card touches a booking (`season_id` included) or writes an outbox row.
- Domain `flags.ts`: `outsideReason(booking, seasons, settings) → 'season' | 'hours' | null`. A booking in no season row is `season` (checked first), and outside the open–close times is `hours`. `outsideCurrentTimes` = reason ≠ null, so the home and row flags stay unchanged. The season card's flag lists the `season` bookings, and the hours card's flag the `hours` bookings. Both reuse `admin_flag_outside` with links (`buildHomeFlags` link format).
- Season card target (pure, in the view), with today in Zurich:
  1. the row containing today, else
  2. the earliest row starting after today: editable, Beginn · Ende prefilled, hidden `id`, "Speichern";
  3. else the latest ended row read-only ("Letzte Saison (vorbei)": dates with year) plus empty Beginn · Ende fields and the button "Nächste Saison anlegen" (no `id`);
  4. with no row at all, the same without the read-only line.
- Query `getOldCodeBookings(now, db)` in `queries/admin.ts`: live bookings with start > now whose accepted keybox row has a trimmed, non-empty `snapshot_keybox_code` ≠ the trimmed current code, in start order. Nothing is listed while the current code is unset. Codes come only from the snapshots.
- Keybox card view: prefilled code, note "Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben.", and the old-code groups by code (groups ordered by first start).
  - Each group gets the line "{n} kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code {code} bekommen:" (plural) and one link per booking ("Di 12. Januar, 17:15 · Tom Brunner" → detail).
  - With two or more groups, an intro heading goes first.
- Route actions `season` and `keybox` follow 3.7's result shapes:
  - `conflict` → 400 `{ card, errors: { start: 'settings_season_overlap' }, values }`;
  - `not_found`/`past`/lock timeout → 503 `{ card, code: 'failed' }`.
- UI: render both cards through `SettingsCard.svelte`, with focus and messages as in 3.7. The card order is Saison, Betriebszeiten, …, Vorheizzeit, Schlüsselbox-Code, Anleitung, Kontaktadresse, Passwort. Date inputs use `type="date"`.
- Copy follows EXPERIENCE exactly where it exists (labels: Saison: Beginn · Ende / Season: Start · End; Schlüsselbox-Code: Code / Keybox code: Code; the note; the old-code line DE/EN; "Das Ende muss nach dem Beginn liegen."). Drafted copy (#35, plus the singular old-code line) is listed in the README.

**Ask First:** a migration; a new dependency; a browser test layer (P3).

**Never:** resending or enqueueing mail on a code or season change; changing `booking.season_id` or deleting bookings; editing ended season rows; logging the keybox code; a DB-level overlap constraint (that would need a migration).

## I/O & Edge-Case Matrix

`now` is Di 2027-01-12 11:06 Zurich. The seed is season 1 (2027-01-09 – 2027-04-30), code 4711 and horizon 14.

| Scenario | State / Input | Expected |
|---|---|---|
| Edit current | id 1, 2027-01-09 – 2027-04-15 | row 1 updated in place; booking `season_id` unchanged; 0 outbox rows |
| Shorten | id 1, end 2027-01-20; 2 live bookings 21 and 22 Jan | both kept; season card "2 Buchungen liegen ausserhalb … Sie bleiben gültig." + 2 links; hours card no flag; home flag; guest `selectableDays` ends 2027-01-20 |
| Order / empty | end ≤ start; empty start | 400 `settings_season_order` on end / `field_required`, values kept |
| Overlap | create 2027-04-01 – 2027-05-31 while row 1 exists | `conflict` → 400 overlap on start, nothing written |
| Ended, create next | now 2027-05-10, only row 1 | read-only row 1 + "Nächste Saison anlegen"; create 2027-12-20 – 2028-04-30 → new row, row 1 unchanged; guest calendar state `before` with the new dates |
| Past row | id 1 posted at now 2027-05-10 | `past` → 503 failed, row unchanged |
| Code change | 4711 → 5822 | code replaced, "Gespeichert.", 0 outbox rows, no resend; next keybox claim snapshots 5822 |
| Old-code list | 3 future bookings accepted with 4711, 1 past one | card lists the 3, not the past one; empty once all start |
| Second change | snapshots 4711 ×2, 5822 ×1, now 6933 | two groups (4711: 2, 5822: 1) under the intro heading |
| Empty code | "  " | 400 `field_required` |
| Failure | lock timeout | 503 failed in that card |

</frozen-after-approval>

## Code Map

- `schemas/settings.ts` -- `SETTINGS_CARDS`, `SETTINGS_FIELDS`, `SETTINGS_ERROR_KEYS`, `parseSettingsCard`, `settingsValues` (extend; `id` is a field of `season`); `#lib/time` `isValidDate`, `today`, `compareDates`, `formatDateLong`/`formatDayMonth` (dates with the year: add a formatter in `time/zurich.ts` if none fits).
- `commands/change-settings.ts` -- `columnsOf` + transaction: add the season branch (reads `season` rows) and the keybox column; result codes widen to `invalid | stale | conflict | not_found | past`.
- `domain/flags.ts` `outsideCurrentTimes` (+ `flags.test.ts`); `admin-day-view.ts:133` `isFlagged`, `buildAdminRow` (old-code logic at :147 to mirror); `admin-view.ts` `buildHomeFlags` (link format, `HomeFlag`).
- `queries/admin.ts` `adminBookings` (keybox row via `outbox.snapshotKeyboxCode`), `getFutureFlagCandidates`; `queries/setting.ts` `getKeyboxSettings` (trimmed code); `queries/calendar.ts` `getSeasons` (returns no id: add `getSeasonRows` with ids); `queries/booking.ts` `seasonIdFor`.
- `settings-view.ts` -- `buildSettingsView` / `loadSettings`: add the cards, split the flags. `SettingsCardView` gains `readOnly` (label + text), `submitLabel`, `hidden` fields and `groups` (old-code). `SettingsCard.svelte` renders them.
- `routes/admin/(portal)/settings/+page.server.ts` `write`, results; `+page.svelte`; `#lib/settings-outcome.ts`.
- `domain/calendar.ts` `calendarState`, `selectableDays` (guest checks in tests); `commands/outbox.ts:272` claim snapshots `keybox.code`.
- Tests to extend: `change-settings.test.ts` (temp DB fixtures), `schemas/settings.test.ts`, `settings-view.test.ts`, `routes/admin/settings.server.test.ts`, `routes/admin/settings.render.test.ts`, `queries/admin.test.ts`, worker keybox test from 3.7.
- `messages/{de,en}.json`, `README.md` (drafted copy list), `src/routes/admin/README.md`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/flags.ts` (+test) -- `outsideReason`; `outsideCurrentTimes` on top of it.
- [x] `src/lib/schemas/settings.ts` (+test) -- the `season` and `keybox` cards and their error keys; matrix Order/empty, Empty code.
- [x] `src/lib/server/db/queries/{calendar,admin}.ts` (+test) -- `getSeasonRows`, `getOldCodeBookings`; matrix Old-code list, Second change.
- [x] `src/lib/server/commands/change-settings.ts` (+test) -- the season and keybox branches; matrix Edit current, Shorten (DB side + `selectableDays`), Overlap, Ended create next (+ `calendarState`), Past row, Code change (+ claim snapshots the new code).
- [x] `src/lib/server/settings-view.ts` (+test) -- the card target cases 1–4, the split flags, the old-code groups DE/EN and plural.
- [x] `settings/+page.server.ts` (+ server tests) -- the `season`/`keybox` actions, conflict → overlap error, not_found/past/lock timeout → failed.
- [x] `SettingsCard.svelte`, `+page.svelte`, `settings-outcome.ts` (+ render tests) -- the read-only line, the create button, the hidden id, date inputs, old-code groups with links, card order.
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, plus the list "Drafted copy for operator review (Story 3.8)".

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint` and `build`, then all are clean, and every matrix row has a test that fails without the feature.
- Given any season or code save, then no `outbox` row is inserted and no `booking` row changes (asserted by counts and row snapshots).

## Spec Change Log

## Design Notes

- Overlap is a command check, not a DB constraint (no migration). Dates are inclusive, so a new season may start the day after another ends.
- Overlap is returned as `conflict` and shown as a field error, because the copy is a validation message.
- Ended rows are frozen (`past`) because AC: "past season rows are kept unchanged". Purge timing (AD-25) reads their end.
- The flag is split by cause, so each card names only its own bookings. A booking both out of season and out of hours counts as `season`. The home flag stays combined.
- The old-code list compares trimmed codes, as `buildAdminRow` does. An unset current code lists nothing.
- Review decisions:
  - No season edit may reach into the past. An end before today (Zurich) is refused inline. The start of a season that has already begun is read-only, and the command refuses a change to it.
  - A malformed hidden `id` is the in-card failure.
  - The keybox code allows at most 32 characters and no line breaks.
  - The date check reuses the block form's pure `isCalendarDate`, because schemas may not import `#lib/time`.
  - While a season runs, the card shows only that season. A later row can be edited once it becomes the next season. This matches the ACs.
- Drafted copy:
  - "Nächste Saison anlegen" / "Add next season";
  - "Letzte Saison (vorbei)" / "Last season (ended)";
  - overlap: "Diese Daten überschneiden sich mit einer anderen Saison." / "These dates overlap another season.";
  - end in the past: "Das Ende darf nicht in der Vergangenheit liegen." / "The end can't be in the past.";
  - code: "Höchstens 32 Zeichen, ohne Zeilenumbruch." / "At most 32 characters, no line breaks.";
  - group intro: "Kommende Buchungen mit einem alten Code:" / "Upcoming bookings with an old code:";
  - singular: "1 kommende Buchung hat ihre Schlüsselmail noch mit dem alten Code {code} bekommen:" / "1 upcoming booking got its keybox email with the old code {code}:".

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** focus after save/error, date inputs at 320 px, both themes (no browser test layer, P3).

## Suggested Review Order

**Season command**

- Entry point: refuses unknown or ended rows, past ends and changed started starts, then inclusive overlaps.
  [`change-settings.ts:127`](../../src/lib/server/commands/change-settings.ts#L127)

- One transaction per card; season and keybox write no booking or outbox row.
  [`change-settings.ts:95`](../../src/lib/server/commands/change-settings.ts#L95)

**Flags and old codes**

- The out-of-times flag split by cause: season first, then hours.
  [`flags.ts:18`](../../src/lib/domain/flags.ts#L18)

- Future bookings whose accepted keybox snapshot differs from the current code.
  [`admin.ts:392`](../../src/lib/server/db/queries/admin.ts#L392)

**View and route**

- Which season the card edits: current, next, or read-only ended plus create.
  [`settings-view.ts:147`](../../src/lib/server/settings-view.ts#L147)

- Per-card flags and the old-code groups by code.
  [`settings-view.ts:129`](../../src/lib/server/settings-view.ts#L129)

- Command codes to results: overlap and past end inline, the rest failed.
  [`+page.server.ts:110`](../../src/routes/admin/(portal)/settings/+page.server.ts#L110)

**Validation and UI**

- Season dates with end after start; keybox code trimmed, at most 32, single line.
  [`settings.ts:161`](../../src/lib/schemas/settings.ts#L161)

- Read-only ended season, readonly Beginn, create button, old-code groups.
  [`SettingsCard.svelte:75`](../../src/lib/components/SettingsCard.svelte#L75)

**Tests and docs**

- Matrix coverage: edit, shorten, overlap, create next, past, code change.
  [`change-settings.test.ts:271`](../../src/lib/server/commands/change-settings.test.ts#L271)

- Drafted copy for operator review.
  [`README.md:768`](../../README.md#L768)
