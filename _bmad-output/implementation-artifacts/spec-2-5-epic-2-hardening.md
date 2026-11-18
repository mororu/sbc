---
title: 'Story 2.5: Epic 2 hardening (retro B1–B3)'
type: 'bugfix'
created: '2026-11-15'
status: 'done'
baseline_commit: 'd97f98aa692ec95a5c7695c8bccf344e2883d40b'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-11-15.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 2 retro found three ways a warning can silently fail to reach anyone:
- The heartbeat stays fresh while every send fails transiently (F1).
- A held keybox row swallows the heat-change rows its claim cancelled (F2).
- The call list never sees an urgent warning that is still open, only refused or expired ones, and keeps a superseded refusal (F3, F8).

**Approach:**
- Track a sending failure next to the heartbeat, and judge it with a pure `workerHealth` that Epic 3 will show.
- Re-enqueue heat changes when a keybox row is held again.
- Mark heat-change rows urgent at enqueue time, and add a `warning_overdue` reason to the call-list core.

## Boundaries & Constraints

**Always:**
- **Heartbeat (B1):**
  - `worker_heartbeat` gains a nullable `failing_since` instant (migration `0008`).
  - A send ending in `transient_failure` sets it, if it is null, to the outcome time. An `accepted` send clears it. `refused` leaves it alone, because a refused recipient is not an outage.
  - `beat_at` keeps meaning "the worker ran a tick".
  - Pure `workerHealth({beatAt, failingSince} | null, now)` in `src/lib/domain` returns `ok`, `stale` (no row, or `beat_at` at least 5 min old) or `failing` (`failing_since` at least 15 min old; `stale` wins).
  - The worker header comment says what the heartbeat really means.
- **Held keybox (B2):** `releaseHeldKeybox` calls `enqueueHeatChanges([bookingId])` inside its own transaction after returning the row to `pending`.
- **Keybox retries (B2):** a keybox row in `transient_failure` also ends heat-change mail (`endsHeatChangeMail`), because each retry re-freezes the current notice. Only a held (`pending`) keybox row lets heat changes through.
- **Call list (B3):**
  - `enqueueHeatChanges` writes `snapshot_urgent` (`true` for urgent, `false` for good news) whenever it upserts. The claim still re-freezes it.
  - `sendProblems` reads the latest heat-change row of any urgency:
    - If it is urgent and `refused` or `expired`, the reason is `warning_refused` or `warning_expired`.
    - If it is urgent and still open (`pending`, `in_flight`, `transient_failure`) at or after `start − (preheat max + 20 min)` (60 min with the default 30–40 window; decided by the user on 2026-11-15), the reason is `warning_overdue`.
    - If it is non-urgent, there is no warning entry. An older refused urgent row then appears only under `refusals`.
- **Every rule is a pure function in `src/lib/domain`,** unit-tested with an explicit `now`. Commands keep `BEGIN IMMEDIATE` and `{ok, code}` results. No guest data in logs.

**Ask First:** Any other change to the AD-6 keybox-phase rule. Any new dependency.

**Never:**
- No admin UI. The warning display is Story 3.1, the call-list page is 3.6.
- No change to email copy, templates or the settle delay.

## I/O & Edge-Case Matrix

Start 18:00, `now` as given, pre-heat 30–40, so the urgent warning window is 60 min.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Outage | sends at 10:00 and 10:05 end `transient_failure` | `failing_since` 10:00, `beat_at` still moves; `workerHealth` at 10:14 → `ok`, at 10:15 → `failing` | N/A |
| Recovery | an `accepted` send at 10:20 | `failing_since` null → `ok` | N/A |
| Refused only | a send ends `refused` | `failing_since` unchanged | N/A |
| Dead worker | `beat_at` 10:00, `now` 10:05 / 10:04 | `stale` / `ok`; no row → `stale` | N/A |
| Held keybox | an open urgent heat row is cancelled by the keybox claim, then the code is unset → held | an urgent heat row is pending again, due now + settle delay | N/A |
| Keybox retry | keybox `transient_failure`, then a notice change | no heat row upserted; open ones cancelled | N/A |
| Urgent at enqueue | an urgent change is upserted | the row has `snapshot_urgent = 1` before any claim | N/A |
| Overdue | open urgent row, `now` 16:59 / 17:00 | no entry / `warning_overdue` | N/A |
| Superseded | an older urgent row `refused`, a newer good-news row `accepted` | no call; the refused row only under `refusals` | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/server/worker/index.ts`:
  - The header comment (L1-12) is wrong about the heartbeat.
  - `tick` (~L195-231) and `sendClaimedRow` (~L141-188) record outcomes through `recordSendOutcome`.
- `src/lib/server/commands/outbox.ts`:
  - `recordSendOutcome` (~L289-331); `releaseHeldKeybox` (~L360-379); `recordHeartbeat` (~L380-391).
  - The claim's keybox branch cancels heat rows (~L264-265); the sweep cancels them after the keybox phase (~L177-187).
- `src/lib/server/commands/heat-change.ts` -- `enqueueOne` (~L49-90) computes `classifyHeatChange` and upserts. Set `snapshotUrgent` there. `enqueueHeatChanges` requires an open transaction.
- `src/lib/domain/keybox.ts` -- `endsHeatChangeMail` (L63-69), pinned in `keybox.test.ts:137`.
- `src/lib/domain/call-list.ts` -- `sendProblems` (~L63-90), `CallReason`, `keyboxOverdueAt` as the clamp pattern. Constants live in `src/lib/domain/outbox.ts`.
- `src/lib/server/db/schema.ts` `workerHeartbeat` (L196-203); migrations through `0007`, generated with `npm run db:generate`, checks as in `isInstant`.
- Tests:
  - `commands/outbox.test.ts`, `commands/heat-change.test.ts`, `worker/worker.test.ts`, `domain/call-list.test.ts`, `domain/keybox.test.ts`.
  - Temp-DB pattern; fake mailers are allowed.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` + migration `0008_*` (+ `db.test.ts`) -- `worker_heartbeat.failing_since`, a nullable instant with a GLOB check -- B1.
- [x] `src/lib/domain/worker-health.ts` (+ test, re-exported) -- `workerHealth` and the 5/15 min constants -- B1.
- [x] `commands/outbox.ts`, `worker/index.ts` (+ tests) -- set and clear `failing_since` with the send outcome in the same transaction, and fix the header comment -- B1.
- [x] `commands/outbox.ts` `releaseHeldKeybox`, `domain/keybox.ts` (+ tests) -- re-enqueue heat changes; `transient_failure` ends heat-change mail -- B2.
- [x] `commands/heat-change.ts`, `domain/call-list.ts`, `domain/outbox.ts` (+ tests) -- urgency at enqueue, `warning_overdue` at `start − (preheat max + WARNING_OVERDUE_MARGIN_MIN = 20)`, the latest-heat-row rule -- B3.
- [x] `README.md`, `epic-2-retro-2026-11-15.md` (mark B1–B3 as addressed by 2.5) -- docs.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint` and `build`, when they run, then all are clean, and every matrix row has a test.
- Given an outage simulated with a fake mailer that returns `transient_failure` for several ticks, when `workerHealth` is read, then it turns `failing` after 15 min of failures while `beat_at` stays fresh.

## Spec Change Log

- 2026-11-15, review:
  - **Trigger:** `WARNING_OVERDUE_BEFORE_START_MIN = 60` was fixed, but the pre-heat window is a setting (15–90 min). With a long window the call would come after the guest has left.
  - **Amended by the user:** the window is the pre-heat maximum plus 20 min, which is 60 min with the defaults. The matrix is unchanged.
  - **KEEP:** the rest of the implementation.

## Design Notes

**Why a separate `failing_since`:** with backoff (1 to 15 min), many ticks claim nothing, so "skip the heartbeat when the drain failed" would still leave a fresh beat. A persisted failure start is the only signal that survives quiet ticks.

**Why pre-heat max + 20 min:** the earliest arrival is the pre-heat maximum before the start. An urgent warning still unsent 20 min before the guest should leave must be phoned.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

## Suggested Review Order

**Heartbeat (B1)**

- Entry point: `failing_since` is set by the first transient failure and cleared by an accepted send; no fake heartbeat row.
  [`outbox.ts:305`](../../src/lib/server/commands/outbox.ts#L305)

- At the end of a drain it clears once no row is left retrying, so it never sticks.
  [`outbox.ts:320`](../../src/lib/server/commands/outbox.ts#L320)

- Pure health for the Epic 3 warning: ok, stale or failing.
  [`worker-health.ts:21`](../../src/lib/domain/worker-health.ts#L21)

**Held keybox (B2)**

- One helper puts a keybox row back to pending and re-enqueues heat changes, for a held or a retrying row.
  [`outbox.ts:333`](../../src/lib/server/commands/outbox.ts#L333)

**Call list (B3)**

- Urgency is written at enqueue, not only at claim.
  [`heat-change.ts:85`](../../src/lib/server/commands/heat-change.ts#L85)

- The warning window follows the pre-heat maximum plus 20 min (user decision).
  [`call-list.ts:72`](../../src/lib/domain/call-list.ts#L72)

- The latest heat-change row decides: refused, expired or overdue.
  [`call-list.ts:90`](../../src/lib/domain/call-list.ts#L90)

**Docs**

- What the heartbeat and the warning rules mean for operators.
  [`README.md:442`](../../README.md#L442)
