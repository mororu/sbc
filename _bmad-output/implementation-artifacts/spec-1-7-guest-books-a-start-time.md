---
title: 'Story 1.7: Guest books a start time'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'f60851d4f39780ba5291524b5ec1642e8915b7cc'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-sauna-booking-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Guests can see free start times but cannot book them.

**Approach:**
- A free row links to a server-rendered booking form: duration, party size, name, email and mobile.
- One shared Valibot schema validates the form on the client and on the server.
- A `createBooking` command runs in one `BEGIN IMMEDIATE` transaction. It rechecks the time against the same core offer function, inserts the booking idempotently by submit token, and redirects to a minimal confirmation at an unguessable public id.
- Conflicts, start times that have already begun, and stale forms land the guest on the refreshed day with a message. Their details stay in `sessionStorage`.

## Boundaries & Constraints

**Always:**
- **Transactions (AD-2, AD-3):** every write goes through `src/lib/server/commands`, one `BEGIN IMMEDIATE` transaction each. Inside it, read bookings, blocks, settings and seasons fresh, and accept only a start and duration that `offeredStartTimes` offers.
  - The new booking records the current changeover, `created_at`, `season_id`, party size, the locale at submit, the normalised contact data, the public id and the submit token.
  - Commands return `{ok:true, publicId}` or `{ok:false, code}`, with code `conflict`, `past` or `invalid`. They never throw for expected outcomes.
  - A submit token that already exists returns `{ok:true}` with that booking's public id.
- **Ids:** public ids and submit tokens are random, URL-safe and at least 128 bits (`crypto.randomBytes(16)` → base64url). Row ids never reach a guest page.
- **Guest data (AD-11, AD-13):** never in a URL, cookie or redirect.
  - `sessionStorage` holds only name, email and mobile. They are written on input and on submit, and read to prefill the form.
  - The query parameters `d`, `p`, `error` and `time` carry no guest data.
- **Schema (AD-16):**
  - The email is trimmed and checked as an email.
  - The name is trimmed, 1–100 characters.
  - The mobile accepts spaces, `+41`, `0041` and `0…` and is normalised to E.164: `079 123 45 67` → `+41791234567`. Another `+`/`00` international number is accepted as 8–15 digits.
  - Errors are i18n message keys. The server result is authoritative.
- **Copy:** exactly as in EXPERIENCE.md (Errors and refusals, Field labels, the button label). Strings the UX lacks are drafted under the voice rules and listed in the README for operator review.
- **Design:** components follow DESIGN.md (booking summary, state badge, segmented control, text field, primary button, inline message). Targets are at least 44 px. The primary button is last in scroll order.
- **Without JavaScript:** everything works with plain forms and links.

**Ask First:** Any change to the Story 1.3–1.6 rules. A new dependency.

**Never:**
- No notice token or notice columns, no keybox sentence or details list (Story 1.8).
- No emails (Epic 2).
- No account, password, consent checkbox or captcha.
- No guest data in logs.

## I/O & Edge-Case Matrix

Changeover 15, hours 10:00–22:00, season 9 Jan – 30 Apr 2027, `now` 12 Jan 09:00.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Durations | form for 18:00, booking at 20:00 | 60 and 90 enabled; 120–180 are disabled radios; note "120–180 Min. nicht möglich: nächste Buchung um 20:00."; 60 preselected; options named like "90 Minuten, bis 19:30" | N/A |
| Kind 3 only | a start time offering only [90] | 90 preselected; the rest disabled | N/A |
| Valid submit | Lena, `lena@example.ch `, `079 123 45 67`, 90 min, 3 people | a row with email `lena@example.ch`, mobile `+41791234567`, changeover 15, locale `de`, season 1; 303 to `/booked/{publicId}`, which shows "Gebucht!", the date, 18:00, 90 Min. and 3 Personen | N/A |
| Resubmit | the same submit token again | no second row; the same public id | N/A |
| Conflict | 17:00–18:00 booked, then 18:00 submitted | `conflict`; 303 to `/day/2027-01-12?error=conflict&time=1800`; message "18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da." first in `main`, focused; title "Fehler: Di, 12. Januar · …" | nothing booked |
| Past | `now` after 18:00 at submit | `past`; "18:00 hat schon angefangen. Wähl bitte eine andere Zeit." with the same treatment | nothing booked |
| Stale form | `/book/2027-01-12/1800` when 18:00 is taken or past | a redirect to the day with the matching message | N/A |
| Crafted | 180 min running past 22:00, an overlapping block, too little changeover, an unknown duration, party size 7 | `conflict` or `invalid` | nothing booked |
| Invalid fields | email `lena@`, mobile `12` | 400 with error keys and the typed values kept; summary "2 Angaben fehlen oder stimmen nicht."; focus on the first invalid field | nothing booked |
| Unknown id | `/booked/xyz` | 404 in the guest layout, revealing nothing | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/domain/start-times.ts` -- `offeredStartTimes` returns `{start, kinds, durations, heat, notice}`. `DURATIONS` is the list of allowed durations. The book command must call this same function.
- `src/lib/server/day-view.ts`:
  - `loadDayView` gets the day's items through `getDayItems(from, to, db)`.
  - `buildDayView` builds the free rows with `notice` and `srText`.
  - Free rows need an `href` to `/book/{date}/{hhmm}` and a closing "Buchen." in `srText`.
  - The day view model needs an optional `error {text}` driven by `?error=conflict|past&time=hhmm`.
- `src/lib/components/StartTimeRow.svelte` -- not a link yet; the chevron column is reserved. `DayView.svelte` renders the rows. The `h1` has `tabindex=-1`.
- `src/lib/server/db/schema.ts` `booking` -- add the columns. Migrations are generated with `npm run db:generate`; seeds are hand-written as in `0001`.
- `src/lib/server/db/queries/calendar.ts` -- the query pattern: `db = getDb()` as the default parameter.
- `src/lib/server/clock.ts` -- `now()`. Tests inject `now` and `db`, as in `day-view.test.ts` and `src/routes/(guest)/day/[date]/server.test.ts` (which mocks `env.ts`).
- `src/lib/schemas/index.ts`, `src/lib/server/commands/index.ts` -- empty barrels. Lint allows the db layer only in `commands` and `db/queries`.
- `src/lib/time/zurich.ts` -- `toInstant`, `formatTime`, `formatDateLong`, `formatDateTitle`, `addMinutes`.
- `src/lib/components/LanguageSwitch.svelte` -- carries the current path and query. Changing duration or party size must update `?d=&p=` with `replaceState`.
- `scripts/dev-fixtures.ts` -- inserts bookings; after the migration it must fill the public id and the submit token.
- `messages/*.json` -- add keys. A count needs singular and plural variants.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` + generated migration `0002_*` (+ `db.test.ts`) -- `booking` gains these columns, with check constraints:
  - `party_size` 1–6;
  - `locale` `de`/`en`;
  - `name`, `email`, `mobile`, all nullable;
  - `public_id` and `submit_token`, unique.
- [x] `src/lib/schemas/booking.ts` (+ tests) -- the Valibot booking schema and `normaliseMobile`.
- [x] `src/lib/server/commands/create-booking.ts` (+ tests on a temp-file DB, including a second connection) -- `createBooking(input, {now, db})`, covering every command row of the matrix.
- [x] `src/lib/server/db/queries/booking.ts` -- `getConfirmation(publicId)` selects only date, start, duration and party size. Also `bookingIdByToken` if needed.
- [x] `src/lib/server/book-view.ts` (+ tests) -- the form view model:
  - back link, title, time, heat badge and notice;
  - duration options with end time, enabled flag and the unavailable note (reason: next booking / a time taken by a block / the end of operating hours);
  - preselection, a fresh submit token;
  - or a redirect target for a stale or invalid URL.
- [x] `src/routes/(guest)/book/[date]/[time]/+page.server.ts`, `+page.svelte` (+ route test) -- load and the `default` action.
  - The action: schema → command → 303 `/booked/{id}`, or 303 to the day with `error`, or `fail(400, {errors, values})`.
  - The client:
    - `use:enhance` sets the "Wird gebucht …" state, `aria-disabled` and the status; after 15 s the slow line; the network error at the top;
    - errors on blur for fields with content; the summary;
    - `sessionStorage` prefill and save; `?d=&p=` sync.
- [x] `src/routes/(guest)/booked/[publicId]/+page.server.ts`, `+page.svelte`, `src/routes/(guest)/+error.svelte` -- the minimal confirmation, and the guest 404.
- [x] `src/lib/components/` -- `BookingSummary`, `SegmentedControl`, `TextField`, `PrimaryButton` and `InlineMessage` as needed. `StartTimeRow` becomes one link with a chevron and the "Buchen." name. `DayView` shows the error message first in `main`, focused on load, with the title prefixed "Fehler: ".
- [x] `messages/*.json`, `README.md`, `scripts/dev-fixtures.ts` -- the copy, the drafted strings for operator review, the flow notes, and fixtures that fill the new columns.

**Acceptance Criteria:**
- Given two connections submitting conflicting bookings, when both commands run, then exactly one row is inserted and the other gets `conflict`.
- Given the full flow at 360 px without JavaScript, when a guest books, then they reach the confirmation; a conflict shows the day with the message.
- Given any page, redirect or cookie in the flow, when it is inspected, then no name, email or mobile appears in a URL or cookie.
- Given `npm run build`, then the client time guard passes and no `src/lib/time` reaches the client.

## Design Notes

**Conflict and past go through a redirect, not `fail(409)`:** the action answers `303 /day/{date}?error=conflict&time=1800`. The day page then rebuilds the day fresh, with the message first. This works the same with and without JavaScript, and the query holds no guest data. With `use:enhance`, the redirect is followed the same way.

**Unavailable reasons:** the disabled durations always form a suffix, except for kind-3-only times.
- Note: "{from}–180 Min. nicht möglich: nächste Buchung um 20:00."
- When a block causes it, the note reads "… ab 20:00 belegt" (drafted), so a block is never revealed.
- When the end of operating hours causes it: "… Betrieb bis 22:00" (drafted).
- For a kind-3-only time: "Nur 90 Min. möglich: nächste Buchung um 20:00." (drafted).

**Mobile:** `0041…` and `+41…` → `+41…`. A national `0[1-9]…` with 10 digits → `+41` + the digits without the 0.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:**
- `rm -rf data`, `npm run dev` with `DEV_NOW`, fixtures. Book in DE and EN, with and without JavaScript.
- Double-tap the button.
- Book the same time in two tabs: the second gets the conflict.
- Switch language on the form.
- Check 360 px, light and dark.

## Suggested Review Order

**Book command (AD-2, AD-3)**

- Entry point: one BEGIN IMMEDIATE transaction; token first, then fresh reads against the core offer.
  [`create-booking.ts:64`](../../src/lib/server/commands/create-booking.ts#L64)

- Only a lock timeout is caught, and it becomes a retryable 503 instead of an error page.
  [`create-booking.ts:43`](../../src/lib/server/commands/create-booking.ts#L43)

- Action: schema, command, then 303 to the confirmation or to the day with the error.
  [`+page.server.ts:27`](../../src/routes/(guest)/book/[date]/[time]/+page.server.ts#L27)

**Validation (AD-16)**

- One schema for client and server: trims, normalises the mobile to E.164, returns i18n keys.
  [`booking.ts:131`](../../src/lib/schemas/booking.ts#L131)

- Swiss and international mobile numbers to E.164.
  [`booking.ts:40`](../../src/lib/schemas/booking.ts#L40)

**Form view model**

- Duration options with end times, preselection and a fresh submit token, or a stale-form redirect.
  [`book-view.ts:181`](../../src/lib/server/book-view.ts#L181)

- Why durations are unavailable, without revealing blocks.
  [`book-view.ts:110`](../../src/lib/server/book-view.ts#L110)

**Client**

- Busy state, slow line, failure handling, sessionStorage for contact only, ?d=&p= sync.
  [`BookForm.svelte:1`](../../src/lib/components/BookForm.svelte#L1)

- Free rows become one link to the form.
  [`StartTimeRow.svelte:36`](../../src/lib/components/StartTimeRow.svelte#L36)

**Confirmation and privacy**

- Confirmation selects only date, time, duration and party size; deleted or unknown ids 404.
  [`booked-view.ts:42`](../../src/lib/server/booked-view.ts#L42)

- Migration adds contact columns, public id and token; old dev rows get placeholder values.
  [`0002_booking_contact.sql:1`](../../src/lib/server/db/migrations/0002_booking_contact.sql#L1)

**Docs**

- Flow notes and drafted copy for operator review.
  [`README.md:170`](../../README.md#L170)
