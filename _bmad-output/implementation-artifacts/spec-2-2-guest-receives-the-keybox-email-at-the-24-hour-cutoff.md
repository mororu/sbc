---
title: 'Story 2.2: Guest receives the keybox email at the 24-hour cutoff'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: 'e5631ddd89a47cbfe11f89f4a95dd6ceeb61c058'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The guest gets a confirmation but never the keybox code. Nothing holds the code or the access and return instructions, and nothing sends them at the 24-hour cutoff.

**Approach:** Add the keybox settings (code, DE and EN instructions). `createBooking` also inserts a `keybox` row, due at `max(keyboxCutoff(start), now)`. The worker claims it only when the settings are filled, freezing the current notice, the code and the locale. It renders the keybox email from that snapshot, and an accepted send writes `last_told_notice`. Retro A9's past-booking wording on the confirmation page is fixed here too, with the mail copy.

## Boundaries & Constraints

**Always:** Everything from the 2.1 spec still holds: commands own writes (`BEGIN IMMEDIATE`, `{ ok, code }`), rows hold no contact data, the copy is Paraglide in `snapshot_locale`, and logs carry only the row id, the state, the SMTP code and the name of a missing setting. The current notice comes only from `bookingNotice`. Notices are compared only with `noticeEquals`. Only an accepted keybox row of a live booking writes `last_told_notice`, from `snapshot_notice`.

**Ask First:** Any new env variable. Changing retro A8 behaviour.

**Never:** The keybox code in a log line, the reason or any column except `snapshot_keybox_code`. Resending an accepted row when the setting changes. Heat-change rows or the call-list core (2.3 and 2.4). An admin settings UI (3.8). Real SMTP outside production.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Book early | Tue 12 Jan 2027 18:00 booked 7 Jan | `keybox` row `pending`, due `2027-01-11T17:00:00Z`, in the same tx as the booking and the confirmation | — |
| DST | Sun 28 Mar 2027 10:00 | due `2027-03-27T08:00:00Z` | — |
| Book past cutoff | 15:30 for 18:00 today | due `now`. Drain order sends the confirmation first. | — |
| Claim | due keybox row, settings filled | `in_flight`. Snapshot: the current notice (`bookingNotice` over the day's live bookings and blocks, recorded changeover), the trimmed code and the booking locale. | — |
| Held | code blank, or the instructions for the booking's locale blank | not claimed, stays `pending`. Later rows are still claimed. The worker logs one line per tick: `outbox <id> keybox held missing=<setting>`. | expiry at start still applies |
| Accepted | SMTP 2xx | `accepted`. `booking.last_told_notice` = `snapshot_notice`. | deleted booking: row only |
| Refused / transient / expired | as in 2.1 | `last_told_notice` unchanged | — |
| Code changed later | setting updated after accept | no resend. The snapshot keeps the old code. | — |
| Downtime | worker back after the cutoff, before start | sent late | after start: `expired` |
| Stale at boot after start | `in_flight`, stale, start passed | `releaseStaleClaims` sets it `pending`, the next claim sets it `expired` | — |
| Deleted | `deleted_at` set | `cancelled`, never sent | — |
| A9: past booking | confirmation page, `now ≥ start` | revisit line without "we'll email changes". Keybox line omitted. | — |

</frozen-after-approval>

## Code Map

- `src/lib/server/db/schema.ts` `setting` / `outbox` -- add the setting columns and an `outbox_one_keybox` partial unique index modelled on `outbox_one_confirmation`.
- `src/lib/server/db/migrations/0003_booking_notice.sql` -- the pattern for hand-added SQL below generated DDL. Not needed if NULL is the empty placeholder.
- `src/lib/server/commands/create-booking.ts:155` -- the confirmation insert. Add the keybox insert next to it.
- `src/lib/server/commands/outbox.ts` -- three changes:
  - `SENDABLE_KINDS` (l.16): add `'keybox'`.
  - `claimDueRow` (l.73): the snapshot is currently `noticeAtBooking` for every kind. Branch per kind.
  - `recordSendOutcome` (l.147): add the `last_told_notice` write.
- `src/lib/server/commands/outbox.test.ts:133` -- "not sendable yet" uses `keybox`. Switch it to `heat_change`. The temp-DB harness and `book()`/`setRow()` helpers are reusable.
- `src/lib/domain/notice.ts:76` `bookingNotice(booking, bookings, blocks, preheat)`. `src/lib/server/db/queries/calendar.ts:74` `getDayData(localDate(start), db)` gives the bookings, blocks and settings to match by `id`.
- `src/lib/domain/keybox.ts` -- `keyboxCutoff`, `isPastKeyboxCutoff`. Put the new pure helpers here.
- `src/lib/server/db/queries/setting.ts` -- `getAdminContact` is the trimmed-or-null pattern to copy.
- `src/lib/server/db/queries/outbox.ts` `getSendData` -- add the instructions for the booking's locale.
- `src/lib/server/worker/index.ts` -- `render()` switch (l.70), `ClaimedRow` usage, `tick()` (l.135).
- `src/lib/server/mail/confirmation.ts` -- the template pattern. `badgeText` comes from `booked-view.ts:67`. `layout.ts` `Block` covers heading, paragraph and details.
- `src/lib/server/booked-view.ts:86` `keyboxText`, `:142` `revisit`. Page: `src/routes/(guest)/booked/[publicId]/+page.svelte:44-53`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` + `migrations/0005_*` (from `npm run db:generate`) -- `setting.keyboxCode`, `keyboxInstructionsDe`, `keyboxInstructionsEn` (nullable text), plus `outbox_one_keybox`.
- [x] `src/lib/domain/keybox.ts` (+ test) -- two pure helpers:
  - `keyboxDueAt(start, now)`
  - `missingKeyboxSetting({ code, instructions }, locale)`, which returns `'keybox_code' | 'keybox_instructions_de' | 'keybox_instructions_en' | null`

  Also `isKeyboxPhase(state)`, true for `accepted`/`refused`/`expired`. Unit tests use an explicit `now`, including the DST example.
- [x] `src/lib/server/db/queries/setting.ts` -- `getKeyboxSettings(db)`: `{ code, instructions: { de, en } }`, each trimmed or null.
- [x] `src/lib/server/db/queries/booking.ts` -- `currentNotice(bookingId, db)`: serialized `bookingNotice` for a live booking, else null.
- [x] `src/lib/server/db/queries/outbox.ts` -- `getSendData` gains `keyboxInstructions` (the booking's locale). Add `getHeldKeyboxRows(now, db)`: due, open keybox rows of live, not yet started bookings with `missing` set.
- [x] `create-booking.ts` -- insert the keybox row in the same tx. A resubmit inserts nothing.
- [x] `commands/outbox.ts` -- four changes:
  - `SENDABLE_KINDS` gets `keybox`.
  - The claim skips held keybox rows and takes the next due row.
  - A keybox claim snapshots `currentNotice`, the code and the locale.
  - `ClaimedRow` gains `snapshotKeyboxCode`. An accepted keybox outcome for a live booking writes `lastToldNotice` from the snapshot in the same tx.
- [x] `commands/outbox.test.ts` -- cover every matrix row and each AD-23 transition with kind `keybox`, including a held row expiring at start and the stale-after-start boot case.
- [x] `src/lib/server/mail/keybox.ts` (+ tests in `mail.test.ts`) -- `renderKeybox({ snapshot: { notice, keyboxCode, locale }, booking: { start, instructions }, claimedAt })`. Block order:
  1. heading `Code: 4 7 1 1`, from the code's characters, spaced
  2. paragraph "this one counts" + `badgeText(notice, start, claimedAt, locale)`
  3. instructions heading
  4. the instructions, one paragraph per blank-line-separated block

  The template throws `MISSING_SETTING` on blank instructions.
- [x] `worker/index.ts` -- the `keybox` case in `render()`. After the drain, `tick()` logs one `held` line per `getHeldKeyboxRows` row.
- [x] `messages/{de,en}.json` -- add `mail_keybox_subject` ("Schlüsselcode für {date}, {time}" / "Keybox code for {date}, {time}"), `mail_keybox_code`, `mail_keybox_counts`, `mail_keybox_instructions_heading` and `booked_revisit_past`. The new lines are drafts for operator review.
- [x] `booked-view.ts` (+ test) + `+page.svelte` -- A9. When `now ≥ start`, `revisit` = `booked_revisit_past` and `keybox` = null, and the page renders the keybox line only when it is set.

**Acceptance Criteria:**
- Given a DE booking Tue 12 Jan 2027 18:00, code `4711`, and DE instructions set, when the worker sends it, then:
  - the subject is "Schlüsselcode für Di 12. Januar, 18:00" (EN: "Keybox code for Tue 12 January, 18:00")
  - the first block is the heading "Code: 4 7 1 1"
  - the text part matches the HTML
- Given the dev server and a booking past its cutoff, when a tick runs, then the sink holds the confirmation `.eml` and then the keybox `.eml`, and no log line contains the code.
- Given a cutoff passes while the app runs, when the next tick runs (about a minute later), then the row is claimed: well within 15 minutes.

## Design Notes

- **No new snapshot columns:** the existing `snapshot_*` columns suffice. The only migration is 0005, for the settings and the unique index. NULL is the "empty placeholder", and blank after trimming counts as empty, so no seed SQL is needed. Existing dev bookings get no backfilled keybox rows; this is pre-launch.
- **Instructions are read at send time, not snapshotted:** there is no column for them, and the context forbids a snapshot migration. Only the code is frozen, as the record of what was sent. If an admin blanks the instructions between claim and send, the existing `render_error` path refuses the row, which puts it on the call list (2.4).
- **Held rows:** a pure `missingKeyboxSetting` is shared by the claim filter and `getHeldKeyboxRows`. The claim stays silent, so one line is logged per tick, not one per claim loop.
- **Past judgement:** the notice text is judged at `claimedAt` ("past" arrival). The confirmation judges at `createdAt`.
- **A9:** "past" means `now ≥ start`. That is also when the outbox rows expire, so no more mail can come. Between the cutoff and the start, the existing "schon unterwegs" line stays.
- **Keybox phase:** `isKeyboxPhase` only (terminal states). 2.3 adds its own `in_flight` check for stopping heat-change rows.

## Verification

**Commands:**
- `npm run db:generate` -- expected: exactly one new migration, `0005_*`.
- `npm run check && npm run lint && npm test` -- expected: all green.

**Manual checks:**
- `npm run dev`. Set the code and DE instructions in the DB, then book today within 24 h. In `data/mail-sink/`, the confirmation is written before the keybox `.eml`. The keybox mail's text and HTML parts match.

## Suggested Review Order

**Enqueue and claim**

- Entry point: the keybox row goes in the booking's transaction, due at the cutoff or now.
  [`create-booking.ts:9`](../../src/lib/server/commands/create-booking.ts#L9)

- Claim: confirmation first, rows held while a setting is missing, the current notice and code frozen.
  [`outbox.ts:84`](../../src/lib/server/commands/outbox.ts#L84)

- An accepted keybox row writes last_told_notice from its snapshot.
  [`outbox.ts:167`](../../src/lib/server/commands/outbox.ts#L167)

- Instructions blanked after the claim: the row goes back to pending, not refused.
  [`outbox.ts:237`](../../src/lib/server/commands/outbox.ts#L237)

**Core and mail**

- Due time, which setting is missing, and the keybox phase.
  [`keybox.ts:24`](../../src/lib/domain/keybox.ts#L24)

- The keybox template: code, when, notice, instructions, cancel line.
  [`keybox.ts:48`](../../src/lib/server/mail/keybox.ts#L48)

**Peripherals**

- A9: past bookings on the confirmation page; README dev SQL for the keybox settings.
  [`booked-view.ts:1`](../../src/lib/server/booked-view.ts#L1)
