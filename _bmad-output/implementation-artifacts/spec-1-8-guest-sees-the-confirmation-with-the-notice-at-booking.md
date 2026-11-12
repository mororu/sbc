---
title: 'Story 1.8: Guest sees the confirmation with the notice at booking'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '3e29c1c2a56abdaa0330c1ead3c7c9c2cc05e039'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-sauna-booking-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The confirmation shows only date, time, duration and party size. The guest does not see the notice they booked with, when the keybox code arrives, or how to cancel. Bookings store no notice for later heat-change emails.

**Approach:**
- The book command computes the booking's notice inside its transaction. It stores the notice as both `notice_at_booking` and `last_told_notice`, compares it with the notice the form displayed, and reports whether it changed.
- The confirmation renders the stored notice, the keybox-email time, a details list with the admin contact, and the "changed" and "revisit" lines.

## Boundaries & Constraints

**Always:**
- **Notices (AD-24):** a notice is canonical JSON from `serializeNotice`, read back with `parseNotice`. `noticeEquals` is the only comparison.
  - The booking's notice is the `notice` of the matching `offeredStartTimes` entry, computed in the same `BEGIN IMMEDIATE` transaction.
  - `notice_at_booking` is never updated after insert.
- **Notice token:** the form posts the displayed notice as a hidden field. A malformed token is `form_invalid`. A token that differs from the stored notice still books, and the result says `changed: true`.
- **Keybox time:** the keybox-email time is the start minus 24 h of real time (AD-9). It is formatted as "Mo 11. Januar um 18:00" / "Mon 11 January at 18:00".
  - If the booking was made at or after that time, or that time has passed, the line reads "Der Schlüsselcode ist schon unterwegs in dein Postfach." instead.
- **Badge texts** come from the UX catalogue: hot "Schon heiss um 18:15." and cold "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.", with their EN versions.
  - Too little time and arrival already past use the catalogue row texts behind "Kaltstart: ". "Past" is judged at the booking's `created_at`, because the badge shows the state at booking.
- **Page data (AD-26):** the confirmation data holds only date, start, duration, party size, the notice at booking, the keybox time and the admin contact address. Never name, email or mobile.
- **One-time flags:** "changed" and "just booked" travel only as the query flags `?new=1` and `&changed=1` on the action's 303. They are not guest data. With JavaScript they are removed from the URL after the first render, so a reload counts as a revisit.
- **Copy and design:**
  - Copy is exact where EXPERIENCE.md has it. Drafted strings (keybox sentence, details terms, the cancel line, the EN versions) go into the README for operator review.
  - Design follows DESIGN.md `confirmation` and `state-badge`.

**Ask First:** Any change to the notice rules of Story 1.6, or to the command's conflict rules from Story 1.7.

**Never:**
- No emails and no outbox (Epic 2).
- No editing of the admin contact (Epic 3); this story only seeds it.

## I/O & Edge-Case Matrix

Pre-heat 30–40, changeover 15.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cold booking | book Tue 12 Jan 18:00 on Thu 7 Jan, nothing before | stored `{"heat":"cold","earliest":"…T16:20:00Z","latest":"…T16:30:00Z"}` in both columns. The page shows "Gebucht!", badge "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.", "Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00.", Wann / Personen / Absagen with a `mailto:` to the placeholder address, and the title "Gebucht · Sauna Luegisee" | N/A |
| Hot booking | 18:15 after a booking ending 18:00 | badge "Schon heiss um 18:15." / "Already hot at 18:15." | N/A |
| DST | booking Sun 28 Mar 2027 10:00 | "… am Sa 27. März um 09:00" | N/A |
| After cutoff | booked 12 Jan 09:00 for 12 Jan 18:00 | "Der Schlüsselcode ist schon unterwegs in dein Postfach." | N/A |
| Changed | the form showed cold; 17:00–18:00 booked in between; submit 18:15 | booked as hot; badge "Schon heiss um 18:15."; "Das hat sich gerade geändert." / "That just changed." | N/A |
| Revisit | `/booked/{id}` without `new` | the same badge plus "So stand es bei der Buchung. Änderungen schicken wir dir per Mail." | N/A |
| Collapsed / past at booking | the notice is collapsed, or `created_at` is after the arrival | "Kaltstart: Nur 15 Minuten zum Einheizen: komm um 17:45. …" / "Kaltstart: Komm so bald wie möglich …"; no error styling | N/A |
| Bad token | `notice` field missing or malformed | 400 `form_invalid`, input kept | nothing booked |
| Resubmit | the same submit token | the existing booking, `changed: false`, no second row | N/A |
| Unknown id | `/booked/xyz` | 404 as in Story 1.7 | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/domain/notice.ts` -- `Notice`, `serializeNotice`, `parseNotice`, `noticeEquals`. `offeredStartTimes` entries carry `notice`.
- `src/lib/server/commands/create-booking.ts` -- `createBooking`:
  - it finds `offer` (line ~85) and inserts the booking (~95);
  - it returns `{ok, publicId}` and needs `changed`;
  - its input needs the posted notice. `wellFormed` validates the input.
- `src/lib/server/db/queries/booking.ts` -- `bookingByToken` and `getConfirmation` (date, start, duration, party size). Add `noticeAtBooking`, `createdAt` and the admin contact.
- `src/lib/server/db/schema.ts` -- `booking` and `setting`. Migrations are generated with `npm run db:generate`; hand-edits and seeds as in `0001`/`0002`.
- `src/lib/server/book-view.ts` -- builds the offer's `notice` text (~208) and `submitToken`. Add the canonical notice token.
- `src/lib/schemas/booking.ts` -- `BOOKING_FIELDS` and the `submitToken` field. Add a `notice` string field; the schema only checks that it is non-empty, and `parseNotice` runs in the action.
- `src/routes/(guest)/book/[date]/[time]/+page.server.ts` -- the action redirects to `/booked/{id}`. Add `?new=1` and, when changed, `&changed=1`.
- `src/lib/components/BookForm.svelte` -- add the hidden `notice` input.
- `src/lib/server/booked-view.ts`, `src/routes/(guest)/booked/[publicId]/+page.svelte` -- the current minimal confirmation. Extend it.
- `src/lib/components/StateBadge.svelte` -- the summary badge; it needs a large variant.
- `src/lib/time/zurich.ts` -- `formatDateShort`, `formatTime`, `addMinutes`.
- `src/lib/day-nav.ts` -- the shallow-replace pattern (`withoutDayError`) to reuse for removing `new`/`changed`.
- Tests:
  - `src/lib/server/commands/create-booking.test.ts`.
  - `src/routes/(guest)/book/[date]/[time]/server.test.ts`, which mocks env and uses an in-memory DB.
  - `src/lib/server/db/db.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` + migration `0003_*` (+ `db.test.ts`) -- `booking.notice_at_booking` and `last_told_notice`, nullable text; `setting.admin_contact` with an idempotent placeholder seed `platzhalter@sauna-luegisee.ch` -- columns.
- [x] `create-booking.ts` (+ tests) -- the input gets `displayedNotice: Notice`. Store `serializeNotice(offer.notice)` in both columns and return `changed` = `!noticeEquals`. A resubmit returns `changed: false` -- notice at booking.
- [x] `schemas/booking.ts`, `book-view.ts`, `BookForm.svelte`, the book `+page.server.ts` (+ tests) -- post the token, parse it in the action (failure → `form_invalid`), and redirect with the flags.
- [x] `queries/booking.ts`, `booked-view.ts` (+ tests) -- the confirmation view model:
  - date eyebrow, heading, badge (heat, label, text), optional changed line, optional revisit line;
  - keybox sentence;
  - details: Wann ("Di 12. Januar, 18:00–19:30"), Personen, Absagen (`mailto:`);
  - "Weitere Zeit buchen" and "So funktioniert's" links.
- [x] `booked/[publicId]/+page.server.ts`, `+page.svelte`, `StateBadge.svelte` -- the rendering per DESIGN.md `confirmation`, and removing the flags with JavaScript.
- [x] `messages/*.json`, `README.md`, `scripts/dev-fixtures.ts` -- the copy, the drafted strings, the admin-contact placeholder note (to be confirmed before launch, Story 5.5), and fixtures that store notices.

**Acceptance Criteria:**
- Given every booking created through `createBooking`, when its row is read, then both notice columns hold the same canonical JSON. A test shows that no code path updates `notice_at_booking`.
- Given the confirmation page data, when it is serialised, then it contains no name, email, mobile or row id.
- Given `npm run build`, then the client time guard passes.

## Design Notes

**Keybox time:** `addMinutes(start, -24*60)` on instants is 24 h of real time. Across the 28 March switch, 10:00 becomes 09:00 on the Saturday.

**Revisit vs. just booked:** the server cannot tell these apart without the flag. The `?new=1` flag on the 303 is the cheapest honest signal. Without JavaScript the flag stays in the URL, so a reload still shows the "just booked" form, which is acceptable.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:**
- With `DEV_NOW` and fixtures, book a cold and a hot time in DE and EN and reload the confirmation (the revisit line appears).
- Force a change by inserting a booking between form load and submit.
- Check 360 px, light and dark.

## Suggested Review Order

**Notice at booking**

- Entry point: the command stores the offer's notice in both columns and reports a change.
  [`create-booking.ts:156`](../../src/lib/server/commands/create-booking.ts#L156)

- A resubmit compares the stored notice, so a lost response keeps the change line.
  [`create-booking.ts:117`](../../src/lib/server/commands/create-booking.ts#L117)

- A trigger keeps `notice_at_booking` immutable; the admin-contact seed fills empty values.
  [`0003_booking_notice.sql:9`](../../src/lib/server/db/migrations/0003_booking_notice.sql#L9)

- The form posts its displayed notice as a hidden field.
  [`BookForm.svelte:234`](../../src/lib/components/BookForm.svelte#L234)

**Confirmation**

- View model: badge, changed and revisit lines, keybox sentence, details with mailto.
  [`booked-view.ts:126`](../../src/lib/server/booked-view.ts#L126)

- Badge text from the catalogue; past judged at booking time.
  [`booked-view.ts:64`](../../src/lib/server/booked-view.ts#L64)

- Keybox time: 24 h of real time before the start, or "schon unterwegs".
  [`booked-view.ts:85`](../../src/lib/server/booked-view.ts#L85)

- One-time flags removed from the address with a shallow navigation.
  [`+page.svelte:19`](../../src/routes/(guest)/booked/[publicId]/+page.svelte#L19)

**Docs**

- The flow, the placeholder admin contact and drafted copy for operator review.
  [`README.md:232`](../../README.md#L232)
