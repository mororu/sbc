---
title: 'Story 3.2: Admin sees bookings by day'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '4ee4a5a3f5bc68cb8ec3d3205fa0ac1f382687c4'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Signed-in operators cannot see who is coming: Buchungen (`/admin/day`) is a dead nav link, there is no booking detail, and the admin home has no next bookings or flags.

**Approach:** A read-only admin day view (strip, rows/table), a booking detail, and the home's "Nächste Buchungen" plus the out-of-times and refused-email flags, all from admin view models over new admin queries and one new pure core flag.

## Boundaries & Constraints

**Always:**
- Pages under `src/routes/admin/(portal)/` (behind the 3.1 guard); reads via `db/queries/admin.ts` only, no writes, no migration. Deleted bookings excluded everywhere.
- View models in `src/lib/server/admin-day-view.ts` (day, rows, detail) and `admin-view.ts` (home); all text and times formatted on the server.
- Notice texts: `badgeText` moves from `booked-view.ts` to `notice-text.ts` (re-exported so callers keep working); admin uses it with `now` as the "at" instant. "Hinweis geändert" only from `!noticeEquals(current, lastTold)`; no tag when `lastTold` is null.
- Keybox code shown = the keybox row's `snapshot_keybox_code`; "Alter Code" when it differs from `getKeyboxSettings().code`.
- Out-of-times flag = new pure `outsideCurrentTimes({start, durationMin}, seasons, settings)` in `src/lib/domain/flags.ts`: true when the local date is in no season row, or start < open, or end > close of that day. Derived, never stored; only for bookings that have not started.
- Copy: EXPERIENCE.md strings exact (tags, detail terms, keybox status, flag line, empty line, skip link DE, home headings); every other string drafted in `messages/` DE+EN and listed in README "Drafted copy for operator review (Story 3.2)". Count strings get singular/plural.
- 320 px, 200 % text, both themes, 44 px targets, states never colour-only (tags = 1 px text box).

**Ask First:** a browser test layer (P3); any new dependency.

**Never:** delete/block actions or impact dialogs (3.3, 3.5); call list or replies content (3.4, 3.6); contact data outside admin routes or in logs.

## I/O & Edge-Case Matrix

`now` 2027-01-12 10:00 Zurich; season 2027-01-09…2027-03-31; hours 16:00–22:00; keybox code setting 4711.

| Scenario | Input / State | Expected |
|---|---|---|
| Default | GET `/admin/day`; today in season / today before season 2027-02-01… / no current or next season | 303 `/admin/day/2027-01-12` / `/admin/day/2027-02-01` / `/admin/day/2027-01-12` (today always accepted) |
| Accept | 2026-12-01 in a past season row; 2027-04-05 with only a block; 2027-05-01 nothing; `2027-13-01`, `x` | 200 / 200 / admin 404 / admin 404 / admin 404 |
| Strip | season + live booking 2027-04-05 + deleted booking 2027-04-06 | season days + 04-05 (flag text in its name), not 04-06; all cells links, date order |
| Chevrons | first / last strip day; a date outside the strip | prev disabled / next disabled / nearest strip day each side |
| Empty | day without live bookings | "Keine Buchungen an diesem Tag."; deleted booking not shown |
| Changed | current cold, lastTold hot / equal / lastTold null | tag "Hinweis geändert" / none / none |
| Code | keybox accepted with snapshot 4711 / 1234 / pending | muted "Code 4711" / tag "Alter Code 1234" (no muted code) / neither |
| Keybox status | accepted outcome Mo 11.01 16:00 / pending due Fr 15.01 17:15 / refused `smtp 550` / in_flight / transient_failure due 10:05 / expired / cancelled / no row | "verschickt Mo 16:00 · Code 4711" / "geplant Fr 17:15" / "abgelehnt: smtp 550" / drafted status for each of the rest |
| Refused list | confirmation refused; heat_change good news refused; heat_change urgent refused | listed on detail with reason / listed / not listed (call list owns it) |
| Flag | future booking 21:30–23:00; 2027-04-05 booking; past booking out of hours | row + detail flag text, home flag line with link / same / no flag |
| Home | 1 booking today, none tomorrow; 1 flagged; 2 refused-email bookings | two `h3` labels, row under Heute, empty line under Morgen; singular flag line; refused flag line with 2 links |
| Detail | `/admin/booking/{id}` live / deleted / unknown / `abc` | detail / admin 404 / admin 404 / admin 404 |

</frozen-after-approval>

## Code Map

- `src/lib/server/day-view.ts` -- guest model; reuse its strip-cell shape (`StripDay`) and heading pattern (`formatWeekday`/`formatDayMonth`, "Heute").
- `src/lib/components/DayView.svelte`, `DateStrip.svelte`, `src/lib/day-nav.ts` -- guest day-switch behaviour (busy, 1 s "Lädt …", status on arrival, focus fallback) to mirror for `/admin/day/…`; `DateStrip` takes any `{date, href, weekday, day, name}` cells.
- `src/lib/server/db/queries/admin.ts` -- add admin reads; `calendar.ts` `getDayData`/`getSettings`/`getSeasons`; `setting.ts` `getKeyboxSettings`; `booking.ts:79` notice pattern (`bookingNotice` over the day).
- `src/lib/server/booked-view.ts:70` `badgeText`; `notice-text.ts`.
- `src/lib/domain/notice.ts` `noticeEquals`/`parseNotice`; `heat.ts` `bookingEnd`; `start-times.ts` `Season`.
- `src/lib/server/admin-view.ts` -- home model; `src/routes/admin/(portal)/+page.*` home grid (right column = next bookings).
- `src/routes/admin/(portal)/+layout.svelte` -- `SkipLink` (add target `bookings` → `#bookings`, "Zu den Buchungen"); `admin-nav.ts` already maps `/admin/booking` to the day tab.
- Tests: `src/routes/admin/(portal)/*.test.ts` / route `server.test.ts` pattern (env mock, in-memory DB), `*.render.test.ts` (svelte/server), `queries/admin.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/flags.ts` (+test, export in `index.ts`) -- `outsideCurrentTimes`.
- [x] `src/lib/server/notice-text.ts`, `booked-view.ts` -- move `badgeText`, re-export.
- [x] `src/lib/server/db/queries/admin.ts` (+test) -- `getAdminBookings(from, to)` (live bookings in range with contact, party, duration, current + lastTold notice, keybox row, refused non-urgent rows), `getAdminBooking(id)`, `adminDayAccepted(date)`, `getAdminStripExtraDates(now)` (dates of future live bookings and blocks), `getFutureFlagCandidates(now)`.
- [x] `src/lib/server/admin-day-view.ts` (+test) -- `buildAdminRow`, `buildAdminDayView`, `loadAdminDayView`, `defaultAdminDay`, `buildAdminBookingView`, `loadAdminBookingView`.
- [x] `src/lib/server/admin-view.ts` (+test) -- home `nextBookings` (Heute/Morgen groups) and `flags` (out-of-times, refused email).
- [x] `src/lib/admin-nav.ts` (+test) -- client helpers `isAdminDayPath`, `pendingAdminDay`.
- [x] Routes (+server/render tests): `(portal)/day/+page.server.ts` (redirect), `(portal)/day/[date]/+page.*`, `(portal)/booking/[id]/+page.*`, `(portal)/+error.svelte` (admin not-found with link to Buchungen), `(portal)/+page.*` (home sections); components `AdminDayView.svelte`, `AdminBookingRow.svelte`, `AdminDayTable.svelte`, `ChangeTag.svelte`; `SkipLink` target.
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, drafted list, routes.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given a day below 1024 px, then rows (grid `1fr auto 20px`, ≥ 44 px, hairlines): line 1 time range + heat icon/label, line 2 "Tom Brunner · 2 Personen" + tags/code, chevron; from 1024 px a table with `<th scope="col">` columns time · name · party · email · mobile · notice · last told · keybox code sent, whole row linking to detail.
- Given the day page, then the skip link "Zu den Buchungen" is the first focusable element, the strip cell of the day has `aria-current="date"`, `<title>` is unique, and a day switch dims the list with `aria-busy`, shows "Lädt …" after 1 s and announces the day on arrival.
- Given booking detail, then ≤ 640 px column, back link "‹ Di, 12. Januar" (44 px, uppercase via CSS), eyebrow, time-range `h1`, `dl` Name · E-Mail · Handy · Personen · Dauer · Schlüsselmail, email/mobile as text inside `mailto:`/`tel:` links, "Hinweis jetzt"/"Zuletzt gesagt" side by side (one column on phones), flag and change tag when they apply.

## Design Notes

- Strip: current season's days (else the next season's), plus extra dates, sorted by date (an extra date before the season sorts first). Every cell is a link; extra cells carry `flagged` → visible marker (aria-hidden) and the flag text in the hidden name. Chevrons: nearest strip day before/after the shown date.
- Accept rule adds "today" so `/admin/day` always has a target. Admin 404 = `error(404)` caught by `(portal)/+error.svelte` (shell and nav stay).
- Table rows: stretched link on the time cell (`::after` inset 0) so the whole row is clickable without nested interactive content; email/mobile are text in the table, links on detail.
- Status after a switch: "Dienstag, 12. Januar: 2 Buchungen" (drafted, plural), or the empty line.
- Out-of-season extra days and flags look only at bookings that have not started; past seasons stay browsable by URL.
- Implementation decisions: a strip cell gets the flag marker when its day has any future flagged booking; the shown date is always added to the strip; a multi-day block adds every future day it overlaps; "Nächste Buchungen" lists all of today's bookings, finished ones included; mobile numbers show as stored (E.164); `tel:` keeps only `+` and digits.
- Review decisions: with the keybox code setting unset, no "Alter Code" tag; keybox times show weekday + time within 6 days of today, else the short date; the empty-day status after a switch names the date (drafted), the visible empty line stays the EXPERIENCE text; the table's time cell is the row header.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

## Suggested Review Order

**Day view**

- Entry point: accept rule, strip dates and the day's rows from one loader.
  [`admin-day-view.ts:314`](../../src/lib/server/admin-day-view.ts#L314)

- Current season (else next) plus extra dates and the shown date, sorted.
  [`admin-day-view.ts:219`](../../src/lib/server/admin-day-view.ts#L219)

- Row model: change tag via `noticeEquals`, sent code from the snapshot, old-code tag.
  [`admin-day-view.ts:137`](../../src/lib/server/admin-day-view.ts#L137)

- Pure out-of-times flag, derived, never stored.
  [`flags.ts:14`](../../src/lib/domain/flags.ts#L14)

**Admin reads**

- Live bookings with contact, notices, keybox row and refused non-urgent emails.
  [`admin.ts:190`](../../src/lib/server/db/queries/admin.ts#L190)

- Which dates open and which extra days reach the strip.
  [`admin.ts:206`](../../src/lib/server/db/queries/admin.ts#L206)

- Home flag candidates; same refusal rule as the detail.
  [`admin.ts:271`](../../src/lib/server/db/queries/admin.ts#L271)

**Detail and home**

- Keybox email status per outbox state, with the near/far time rule.
  [`admin-day-view.ts:392`](../../src/lib/server/admin-day-view.ts#L392)

- Booking detail model.
  [`admin-day-view.ts:430`](../../src/lib/server/admin-day-view.ts#L430)

- Home: Heute/Morgen groups and the two flag lines.
  [`admin-view.ts:75`](../../src/lib/server/admin-view.ts#L75)

**UI**

- Day switching mirrored from the guest view (busy, "Lädt …", announce).
  [`AdminDayView.svelte:28`](../../src/lib/components/AdminDayView.svelte#L28)

- Table: row header with a stretched link over the whole row.
  [`AdminDayTable.svelte:47`](../../src/lib/components/AdminDayTable.svelte#L47)

**Peripherals**

- `badgeText` moved here for the guest, mail and admin pages.
  [`notice-text.ts:1`](../../src/lib/server/notice-text.ts#L1)

- Drafted copy for operator review.
  [`README.md:555`](../../README.md#L555)
