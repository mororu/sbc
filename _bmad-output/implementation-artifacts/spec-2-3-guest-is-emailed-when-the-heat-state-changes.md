---
title: 'Story 2.3: Guest is emailed when the heat state changes'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '373558e8290899d3a3a9f4dc4a4a510e569b48eb'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a new booking turns a later guest's start hot or cold, or moves their arrival time, nobody tells them. They arrive at the wrong time.

**Approach:** Add the pure core `classifyHeatChange` and `affectedBooking`. Add a reusable command helper. It recomputes a booking's notice against its `last_told_notice` and upserts one open `heat_change` row, due now + 10 min. The helper is wired into `createBooking` now; the Epic 3 commands call it later. At claim the worker rechecks and freezes the snapshot. It renders the good-news or urgent email, and an accepted send writes `last_told_notice`.

## Boundaries & Constraints

**Always:** Everything in the 2.1/2.2 specs still holds (commands own writes, `{ ok, code }` results, rows hold no contact data, Paraglide in `snapshot_locale`, privacy in logs). Notices are compared only through `noticeEquals`, `classifyHeatChange` and `heatChangeDirection` in `src/lib/domain`. The current notice comes only from `currentNotice`. The helper runs inside the caller's `BEGIN IMMEDIATE` transaction and never opens its own.

**Ask First:** Any new env variable. Changing retro A8 behaviour.

**Never:** Admin commands or UI (Epic 3). Call-list logic (2.4/3.6). Heat-change mail once the keybox row is `in_flight` or terminal. Two open (`pending`/`transient_failure`) heat-change rows for one booking.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Good news | 18:30 told cold 17:50–18:00, 16:00–17:00 before. Someone books 17:15–18:15 | Same tx: one `pending` heat_change row for 18:30, due now+10 | — |
| Collapsed urgent | 18:00 told 17:20–17:30. Someone books 16:30–17:30 | Row upserted. Sent urgent: subject "Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00", body has "Nur 15 Minuten zum Einheizen: komm um 17:45" | — |
| Debounce | Second change within 10 min (row `pending` or `transient_failure`) | Same row: `pending`, due reset to now+10 | — |
| Widen only | Classification `none` | Nothing written. An existing open row is left for the recheck. | — |
| Recheck none | Claim, current 17:15–17:30 vs told 17:20–17:30, or equal | Row `cancelled`, the next due row is claimed, nothing sent | — |
| Claim | Due row, classification ≠ none, the booking's confirmation not open/in flight | `in_flight`. Snapshot: current notice, last-told notice, locale, urgent flag. | — |
| Keybox phase | Keybox row `in_flight`/terminal | Helper cancels open heat rows and upserts none. A keybox claim cancels them in the same tx. | — |
| Accepted | SMTP 2xx | `last_told_notice` = `snapshot_notice` | deleted booking: row only |
| Start passed / deleted | Open row | `expired` / `cancelled` (existing sweeps) | — |
| Helper fixtures | Block inserted; booking soft-deleted; pre-heat setting changed (Epic 3 triggers) | Later earliest → urgent upsert. Book-then-delete → none, no write. Earlier latest → urgent upsert. | — |

</frozen-after-approval>

## Code Map

- `src/lib/domain/notice.ts:126` `noticeEquals` -- the comparison pattern. `Notice`: `latest` null = collapsed range.
- `src/lib/domain/heat.ts` `Booking`, `bookingEnd`, `live` -- the inputs for `affectedBooking`.
- `src/lib/domain/keybox.ts:59` `isKeyboxPhase` -- add the `in_flight` variant next to it.
- `src/lib/domain/outbox.ts` -- `KIND_ORDER`, `OutboxState`. Put `SETTLE_DELAY_MIN = 10` here.
- `src/lib/server/db/queries/booking.ts:79` `currentNotice(bookingId, db)` -- reuse in the helper and at claim.
- `src/lib/server/db/queries/calendar.ts:74` `getDayData` -- items over day −1…+2, so they cover the affected window.
- `src/lib/server/commands/create-booking.ts:157` -- the outbox insert. Call the helper after it. `bookings`/`settings` come from l.125 (pre-insert, so the new booking is not in them).
- `src/lib/server/commands/outbox.ts` -- four places:
  - `SENDABLE_KINDS` (l.18)
  - the cancel/expire sweeps (l.88–102)
  - `awaitingConfirmation` + the `.find` filter (l.111–137)
  - the snapshot (l.140) and the `last_told_notice` write (l.200)
- `src/lib/server/commands/outbox.test.ts` -- the temp-DB harness and `book()`. The "not sendable yet" test uses `heat_change`; replace it.
- `src/lib/server/worker/index.ts:77` `render()` -- add a case. `sendClaimedRow` needs no other change.
- `src/lib/server/mail/keybox.ts` -- the template pattern. `blocks.ts` has `whenItems` and `cancelBlock`. `booked-view.ts:70` `badgeText`, `notice-text.ts:30` `coldNoticeText` (collapsed/past wording).
- `src/lib/server/db/schema.ts:142` `outbox` -- the pattern for the `outbox_one_keybox` partial unique index.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/heat-change.ts` (+ test, export in `index.ts`) -- three things:
  - `heatChangeDirection(lastTold, current) → 'none' | 'now_hot' | 'now_cold' | 'later_earliest' | 'earlier_latest'`
  - `classifyHeatChange`, which maps `now_hot` → `good_news`, `none` → `none` and the rest → `urgent`
  - `affectedBooking(item: { end; bookingId? }, bookings, { changeoverMin, preheatMaxMin })`: the first live booking (not the item itself) with `end ≤ start ≤ end + changeover + preheatMax`, else null

  Tests cover every direction, equal, widen-only, collapsed ↔ range, both story examples and the window boundaries.
- [x] `src/lib/domain/keybox.ts` (+ test) -- `endsHeatChangeMail(state)`: `in_flight` or `isKeyboxPhase`.
- [x] `schema.ts` + `migrations/0006_*` (from `npm run db:generate`) -- two changes:
  - the nullable `outbox.snapshot_last_told` (canonical Notice JSON)
  - the unique index `outbox_one_open_heat_change` on `booking_id` where kind = `heat_change` and state is `pending` or `transient_failure`
- [x] `src/lib/server/commands/heat-change.ts` (+ test) -- `enqueueHeatChanges(bookingIds, { now, db })`. Not re-exported from `commands/index.ts`, so only commands call it. For each live, not yet started booking:
  - If the keybox row ends heat-change mail, cancel the booking's open heat rows.
  - Otherwise classify `lastTold` against `currentNotice`. When the result is not `none`, update the open row (`pending`, due now+10, `reason` null) or insert one.

  Returns `{ bookingId, action: 'upserted' | 'cancelled' | 'none' | 'skipped' }[]`. Tests cover every helper-fixture row of the matrix and the keybox phase.
- [x] `create-booking.ts` (+ test) -- after the inserts, call `affectedBooking({ end, bookingId: new id }, bookings, settings)` and pass the result to the helper. A resubmit enqueues nothing. Test both story examples end to end.
- [x] `commands/outbox.ts` (+ tests) -- four changes:
  - `SENDABLE_KINDS` gets `heat_change`.
  - The sweep cancels open heat rows whose keybox row `endsHeatChangeMail`. A keybox claim also cancels them in the same tx.
  - A heat row waits on `awaitingConfirmation` like a keybox row. At claim it classifies `lastTold` against `currentNotice`. `none` (or no last-told notice) → `cancelled`, and the claim moves to the next due row. Otherwise the snapshot holds the notice, `snapshotLastTold`, the locale and `snapshotUrgent`.
  - An accepted `heat_change` writes `last_told_notice` like a keybox row.

  `ClaimedRow` gains `snapshotLastTold` and `snapshotUrgent`. Cover each AD-23 transition with kind `heat_change`.
- [x] `src/lib/server/mail/heat-change.ts` (+ tests in `mail.test.ts`) -- `renderHeatChange({ snapshot: { notice, lastTold, urgent, locale }, booking: { start, adminContact }, claimedAt })`. The variant comes from `heatChangeDirection(lastTold, notice)`. Blocks: the lead line, the arrival sentence, `whenItems`, `cancelBlock`. Tests render all four variants in DE and EN from snapshots: good news, now cold, later earliest (range and collapsed) and earlier latest.
- [x] `worker/index.ts` (+ test) -- the `heat_change` case in `render()`.
- [x] `messages/{de,en}.json` -- the keys below. Lines not quoted in the story are drafts for operator review.

**Acceptance Criteria:**
- Given the good-news example, when it is sent, then:
  - the subject is "Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss" / "Good news: Sat 16 January, 18:30 is already hot"
  - the body has "Vor dir ist jetzt jemand in der Sauna. Komm am Sa 16. Januar einfach um 18:30, der Ofen läuft."
  - the text part matches the HTML
- Given a hot → cold change, then the subject is "Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00". For a collapsed range it is "…, komm um {earliest}".
- Given an earlier latest arrival, then the subject is "Wichtig: neue Ankunftszeit für …" and the body "Wir heizen jetzt länger vor. Komm zwischen 17:10 und 17:20 und heiz ein."
- Given the settle delay ends while the app runs, when the next tick runs, then the row is claimed: well within 15 min.

## Design Notes

- **Migration 0006 adds the snapshot column `snapshot_last_told`.** This departs from the epic note that 2.3 adds no snapshot migration. The template needs the earlier notice to pick its subject and lead (hot → cold vs a new arrival time, a longer pre-heat vs a later earliest arrival). AD-23 says to render only from the snapshot, so the earlier notice is frozen at claim and never read at send time. `snapshot_urgent` stays the flag 2.4 reads.
- **Collapsed range:** the effective latest is `latest ?? earliest` (the arrival time is then just the earliest arrival). A told collapsed 17:45 that becomes 17:20–17:30 is an earlier latest arrival → urgent. When the earliest moves later and the latest moves earlier, `later_earliest` wins.
- **The affected booking is found over the pre-insert `bookings`**, so the new booking is never its own affected booking. The helper's `currentNotice` reads inside the tx and sees the insert. Epic 3:
  - delete: the deleted booking's end over the remaining bookings
  - block create/delete: the block end, read with `getDayData(localDate(end))`
  - pre-heat change: all future live booking ids
- **Widen-only with an open row:** nothing is written and the due time is not reset. The claim recheck cancels the row (AD-6 "rechecked equal").
- **Heat rows wait for the confirmation**, like keybox rows, so the guest never gets a change before the booking mail.
- **Message keys (DE drafts):**
  - `mail_heat_good_subject` / `_body` (story text)
  - `mail_heat_cold_subject` / `_cold_short_subject`, with the lead `mail_heat_now_cold` ("Vor dir ist jetzt niemand mehr in der Sauna.")
  - `mail_heat_arrival_subject`, with the leads `mail_heat_longer_preheat` ("Wir heizen jetzt länger vor.") and `mail_heat_later_earliest` ("Vor dir ist die Sauna länger belegt.")
  - the arrival sentence `mail_heat_arrival` ("Komm zwischen {earliest} und {latest} und heiz ein."). For a collapsed range, or an arrival already past at the claim, `coldNoticeText` is used.

## Verification

**Commands:**
- `npm run db:generate` -- expected: exactly one new migration, `0006_*`.
- `npm run check && npm run lint && npm test` -- expected: all green.

**Manual checks:**
- `npm run dev`: book 18:00 cold, then 16:30–17:30 on the same day. Advance (or wait) 10 min. `data/mail-sink/` holds the urgent heat-change `.eml`, and its text and HTML parts match.

## Suggested Review Order

**Detect and enqueue**

- Entry point: the reusable recompute/upsert; it compares against the in-flight snapshot when there is one, and stops at the keybox phase.
  [`heat-change.ts:96`](../../src/lib/server/commands/heat-change.ts#L96)

- The pure rules: the direction, urgent vs good news, and the affected booking.
  [`heat-change.ts:25`](../../src/lib/domain/heat-change.ts#L25)

- Wired into the book command over the pre-insert day list.
  [`create-booking.ts:174`](../../src/lib/server/commands/create-booking.ts#L174)

**Claim, recheck, send**

- Recheck at claim (equal → cancelled, an invalid notice → cancelled), freeze both notices; superseded stale rows.
  [`outbox.ts:1`](../../src/lib/server/commands/outbox.ts#L1)

- Six template variants from the snapshot, including the past-arrival subject.
  [`heat-change.ts:82`](../../src/lib/server/mail/heat-change.ts#L82)

**Peripherals**

- Migration 0006: snapshot_last_told and the one-open-heat-row index; the README draft-copy table.
  [`0006_heat_change.sql:1`](../../src/lib/server/db/migrations/0006_heat_change.sql#L1)
