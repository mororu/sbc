---
title: 'Refused and stuck sends are recorded'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '66368657de715c2c9417ac070b2fe54b19102e79'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The worker already records `refused`, `transient_failure` (with backoff) and `expired` (Story 2.1), but nothing derives which guests must be phoned, and rows cannot be marked resolved. Epic 3's call list (3.6) needs that data.

**Approach:** Add `outbox.resolved_at` (migration 0007), a pure `sendProblems(rows, now)` core in `src/lib/domain/call-list.ts`, and a read query that feeds it. Close the remaining recording gaps with tests. Mark called and all display stay in Epic 3.

## Boundaries & Constraints

**Always:** The core is pure and takes `now` as a parameter. A row with `resolved_at` set never raises an entry, whatever its state. The 15-minute rule measures from the keybox row's original due time, `keyboxDueAt(start, createdAt)`, never from `outbox.due_at`, because a retry moves `due_at` forward. Log lines name the row id, state and SMTP code only. Commands never write or clear `resolved_at`.

**Ask First:** Changing the backoff, the in-flight timeout or the 15-minute threshold.

**Never:** Admin UI, a mark-called command, AD-21 part (a) (keybox-phase heat changes, Epic 3.6), a stored call-list flag or table, bounce handling, a new snapshot column.

## I/O & Edge-Case Matrix

| Scenario | Rows of one booking (now) | `sendProblems` result |
|----------|---------------------------|-----------------------|
| Keybox refused | keybox `refused`, unresolved | call `keybox_refused` |
| Keybox expired | keybox `expired` | call `keybox_expired` |
| Keybox stuck | keybox `pending`/`in_flight`/`transient_failure`, now ≥ original due + 15 min | call `keybox_overdue` |
| Keybox 14 min late | same, now = original due + 14 min | nothing |
| Urgent warning refused | latest `snapshot_urgent=true` heat row `refused` | call `warning_refused` |
| Stale warning | urgent heat row A `refused`; newer row B `cancelled` at recheck or by the keybox claim | call `warning_refused` (A is still the latest urgent row) |
| Older urgent refused | urgent A `refused`, later urgent B `accepted` | no call; A listed as a refusal |
| Non-urgent | confirmation or good-news heat row `refused` | refusal only |
| Resolved | any of the above with `resolved_at` set, including an overdue keybox row resolved and later `refused`/`expired` | nothing for that row |
| Deleted booking outcome | `in_flight` row, booking soft-deleted, outcome `refused` | row state and reason stored; no `last_told_notice` write, no new rows |

</frozen-after-approval>

## Code Map

- `src/lib/domain/outbox.ts` -- `OutboxState`, `OutboxKind`, timing constants. Add `KEYBOX_OVERDUE_MIN = 15` here.
- `src/lib/domain/keybox.ts:22` `keyboxDueAt(start, now)` -- gives the original due time exactly, because `create-booking.ts:148,165` uses the same `now` for `createdAt` and the keybox due time.
- `src/lib/domain/index.ts` -- re-export the new `call-list.ts`. Its header already promises "call list".
- `src/lib/server/commands/outbox.ts:329` `recordSendOutcome` -- already does refused/transient/accepted and the deleted-booking row-only write. No logic change expected. `claimDueRow` l.210 expires open rows at the start time.
- `src/lib/server/mail/transport.ts:43` `classifySendError` -- 5xx → refused; 4xx, timeout and connection errors → transient. Already done.
- `src/lib/server/worker/index.ts:616` -- the outcome log line `outbox <id> <kind> attempt=<n> <state> smtp=<code> due=…`. Already compliant.
- `src/lib/server/db/schema.ts:142` `outbox` -- add `resolvedAt: text()`. `src/lib/server/db/migrations/0006_heat_change.sql` -- plain `ALTER TABLE ADD` pattern.
- `src/lib/server/db/queries/outbox.ts` -- add the feed query next to `getHeldKeyboxRows`. No contact data.
- `src/lib/server/commands/outbox.test.ts` / `worker/worker.test.ts` -- temp-DB harness, `book()`, fake mailer. Existing coverage: refused with the SMTP code (l.241), backoff (l.249), expiry (l.191, 585), accepted-on-deleted (l.598).

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/server/db/schema.ts` + `npm run db:generate` -- add the nullable `resolved_at` text column (documented "set by mark called, Story 3.6") -> migration `0007_*` with a plain ALTER. Do not change the `outbox_instants` check: that would rebuild the table.
- [ ] `src/lib/domain/call-list.ts` (+ `index.ts`) -- add `sendProblems(booking: { start; createdAt }, rows: SendProblemRow[], now) → { callRequired: { rowId, reason }[]; refusals: { rowId, kind }[] }`. `SendProblemRow = { id, kind, state, urgent: boolean|null, resolvedAt }`. Reasons: `keybox_refused`, `keybox_expired`, `keybox_overdue`, `warning_refused`, `warning_expired`. "Latest" means highest id. If the latest row is resolved, it gives no entry, and the core does not fall back to an older row. A refused keybox row gets `keybox_refused`, not also `keybox_overdue`. `refusals` lists every unresolved `refused` row that raises no call.
- [ ] `src/lib/domain/call-list.test.ts` -- cover every matrix row with an explicit `now`: the 15-minute boundary (14 vs 15 min), measuring from the original due for a booking made past its cutoff, a moved `due_at` that does not delay `keybox_overdue`, resolved rows, an unclaimed expired heat row (`urgent` null) that is not urgent, and the stale-warning case.
- [ ] `src/lib/server/db/queries/outbox.ts` -- add `getSendProblemRows(now, db) → Map<bookingId, { start, createdAt, rows: SendProblemRow[] }>` for non-deleted bookings whose start is after `now` (AD-21). It selects no contact data and no keybox code.
- [ ] `src/lib/server/commands/outbox.test.ts` -- add tests: a refused outcome on a booking soft-deleted while `in_flight` stores the state and reason, leaves `last_told_notice` unchanged and adds no rows. An outcome on a row with `resolved_at` set keeps it. `getSendProblemRows` excludes deleted and started bookings.
- [ ] `src/lib/server/worker/worker.test.ts` -- add tests: a 5xx and a timeout each give one log line with the row id, state and SMTP code (`-` for a timeout), never the email or the code. A refused keybox row of a live booking is then reported `keybox_refused` by `sendProblems(getSendProblemRows(...))`.

**Acceptance Criteria:**
- Given a booking whose keybox row keeps failing transiently from its cutoff, when `sendProblems` runs 15 minutes after the cutoff, then it reports `keybox_overdue`, even though `due_at` has moved forward.
- Given the 0007 migration on a database with outbox rows, when it runs, then every existing row has `resolved_at` NULL and no other column changes.
- Given any failed send, then the guest sees nothing and no log line holds contact data or the keybox code.

## Design Notes

Recording (5xx → `refused`, 4xx/timeout → `transient_failure` with backoff 1, 2, 5, 10, then every 15 min, `expired` at the start, row-only outcome for a deleted booking) already shipped in 2.1. This story checks the remaining edges with tests and does not rewrite that logic.

Original due: `due_at` is overwritten by `retryAt`. With a 15-minute maximum backoff, `now − due_at` can stay under 15 minutes forever, so the 15-minute rule would never fire. `keyboxDueAt(start, createdAt)` rebuilds the original due exactly, so the story needs no `first_due_at` column.

Urgency comes from `snapshot_urgent` only, which is frozen at claim. A heat row that expires without ever being claimed has `urgent` null and counts as not urgent. That is safe: heat rows only reach the start time unsent when the keybox row was never claimed, and the keybox row then trips `keybox_overdue`.

Stale warning: when an in-flight urgent row A is refused and the newer change B is then cancelled (recheck `none`, or the keybox claim), A stays the latest urgent row, so the booking is call required. The core applies AD-21 strictly. It does not try to prove that a later keybox or good-news send told the guest the current notice. A few needless calls are acceptable, a missed call is not. Epic 3's part (a) and mark called then resolve the entry.

## Verification

**Commands:**
- `npm run db:generate` -- expected: exactly one new migration, `0007_*`, containing only `ALTER TABLE outbox ADD resolved_at text`.
- `npm run check && npm run lint && npm test` -- expected: all green.

## Spec Change Log

- 2026-11-14, review:
  - **Trigger:** the review found that `keybox_expired` and `warning_expired` cannot come out of the feed: rows expire only at the start, and `getSendProblemRows` holds only bookings that have not started (AD-21).
  - **Amended:** the keybox overdue time is clamped to `max(due, min(due + 15 min, start − 5 min))` (`KEYBOX_OVERDUE_BEFORE_START_MIN = 5`), so a booking made shortly before its start raises `keybox_overdue` before the feed drops it. The README documents that bookings drop off the call list at their start.
  - **Known-bad state avoided:** a late booking whose keybox email never goes out showing up on no list.
  - **KEEP:** the AD-21 feed limit (live bookings that have not started) and the expired branches in the core as a safety net.

## Suggested Review Order

**The call-list core**

- Entry point: the problems of one booking per AD-21. The latest row is picked by id, and resolved rows never raise an entry.
  [`call-list.ts:63`](../../src/lib/domain/call-list.ts#L63)

- When a keybox row counts as overdue. The time is measured from the original cutoff, and clamped before the start so late bookings stay visible.
  [`call-list.ts:50`](../../src/lib/domain/call-list.ts#L50)

- The whole feed turned into an ordered list, ready for Story 3.6.
  [`call-list.ts:98`](../../src/lib/domain/call-list.ts#L98)

**Feed and schema**

- Bookings that are live and not yet started, with no contact data and no code.
  [`outbox.ts:89`](../../src/lib/server/db/queries/outbox.ts#L89)

- Migration 0007 adds `resolved_at`, written only by mark called.
  [`0007_outbox_resolved.sql:1`](../../src/lib/server/db/migrations/0007_outbox_resolved.sql#L1)
