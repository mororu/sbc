---
title: 'Story 2.1: Guest receives a confirmation email'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: 'e40e83937640106c46d9b7d4ba522e8d5f5dc63e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A booking ends at the confirmation page; the guest gets no email, and there is no outbox, worker or mail transport for the keybox and heat-change emails to build on.

**Approach:** Add the `outbox` and `worker_heartbeat` tables. Enqueue one `confirmation` row inside `createBooking`'s transaction. Start a singleton worker in `hooks.server.ts` init that claims due rows, renders from the frozen snapshot, sends through nodemailer (SMTP in production, file sink elsewhere) outside any transaction, and records the outcome and heartbeat through commands.

## Boundaries & Constraints

**Always:** Commands own every write, each one `BEGIN IMMEDIATE` (`db.$client.transaction(...).immediate()`), returning `{ ok, code }`. Outbox rows hold no contact data and no rendered content. All email text comes from Paraglide in `snapshot_locale`. Env comes only through `getEnv()`. Log lines carry the row id, the state and the SMTP code only. Pin `nodemailer` at exactly `10.4.0` and `@types/nodemailer` at exactly `8.0.2` (dev).

**Ask First:** Changing the submit-token/deleted-booking behaviour (retro A8). Any new env variable.

**Never:** Sending mail from anywhere but the worker. Real SMTP outside `NODE_ENV=production`. Writing `last_told_notice` from any outcome in this story. No keybox/heat-change sending, no call-list core, no `resolved_at` column. No images, tracking or wrapper background colours.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Book | new token, offered slot | booking + one `confirmation` row (`pending`, due `now`) in one tx | none |
| Resubmit / refused | same token, or `conflict`/`past`/`invalid` | no outbox row inserted | none |
| Claim | due `pending` or `transient_failure` row | `in_flight`, `claimed_at`, `attempts+1`, snapshot = `notice_at_booking` + `locale` | none due → `{ ok:false, code:'none' }` |
| Deleted booking | due open row, booking `deleted_at` set | row → `cancelled`, not sent | none |
| Start passed | `pending`/`transient_failure`, booking start ≤ now | row → `expired` (in the claim tx) | `in_flight` never expires |
| Accepted | SMTP 2xx | `accepted`, `outcome_at`; `last_told_notice` unchanged | none |
| Refused | SMTP 5xx | `refused`, reason `smtp 550` | none |
| Transient | 4xx, connection error, unexpected render/send error | `transient_failure`, `due_at` = backoff | — |
| Stale claim on boot | `in_flight`, `claimed_at` older than timeout | back to `pending` | — |
| Outcome on wrong state | row not `in_flight` | nothing written | `{ ok:false, code:'not_in_flight' }` |
| Catch-up | many rows due during downtime | first tick drains all of them | — |
| Past cutoff | `createdAt` or `claimed_at` ≥ start − 24 h | "code follows right away" line instead of the cutoff time | — |

</frozen-after-approval>

## Code Map

- `src/lib/server/db/schema.ts` -- add tables here; follow its CHECK, `isInstant` and enum-const conventions. Migration `0004_*` comes from `npm run db:generate`, never hand-written.
- `src/lib/server/commands/create-booking.ts` -- the insert inside `run`. Add `.returning({ id })` and the outbox insert after it.
- `src/lib/server/commands/create-booking.test.ts:26-40` -- the temp-file DB harness to copy for the new tests.
- `src/lib/server/booked-view.ts:67` -- `badgeText(notice, start, createdAt, locale)` gives exactly "Cold start: come between 17:20 and 17:30 and light the fire." Reuse it. `cancelLine`/`around` (MARKER split) are the pattern for the mailto line.
- `src/lib/domain/keybox.ts` -- `keyboxCutoff`, `isPastKeyboxCutoff`.
- `src/lib/time/zurich.ts` -- `formatDateShort` ("Di 12. Januar" / "Tue 12 January"), `formatTime`, `localDate`, `addMinutes`.
- `src/lib/server/db/queries/setting.ts` -- `getAdminContact(db)` (trimmed, null when blank).
- `src/lib/server/env-parse.ts` -- `Env.mailTransport` (`'smtp'|'sink'`), `Env.smtp`, `databasePath`.
- `src/hooks.server.ts` -- `init` calls `applyMigrations()`. The worker starts after it.
- `eslint.config.js` -- `mail → db` is blocked. The worker may import only `commands` and `db/queries`.
- `messages/{de,en}.json` -- `booked_cancel_term`, `booked_cancel`, `booked_people` (plural) are reusable.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/server/db/schema.ts` + `migrations/0004_*` -- add `outbox` and `worker_heartbeat`. `outbox` columns: `id`, `booking_id` FK, `kind`, `state`, `due_at`, `claimed_at`, `attempts` int default 0, `snapshot_notice`, `snapshot_keybox_code`, `snapshot_locale`, `snapshot_urgent` (int bool), `reason`, `outcome_at`, with CHECKs and an index on `(state, due_at)`. `worker_heartbeat`: `id = 1`, `beat_at`. Export `OUTBOX_KINDS`, `OUTBOX_STATES` -- one migration for the whole epic.
- [ ] `src/lib/domain/outbox.ts` (+ test, barrel) -- pure: `KIND_ORDER`, `IN_FLIGHT_TIMEOUT_MIN = 10`, `retryAt(attempts, now)` with backoff 1, 2, 5, 10, then 15 min, and `isStale(claimedAt, now)` -- the worker-owned timings, unit-tested with an explicit `now`.
- [ ] `src/lib/server/commands/create-booking.ts` -- insert the confirmation row in the same transaction -- AC 2.
- [ ] `src/lib/server/commands/outbox.ts` (+ test, barrel) -- four commands, each its own tx:
  - `releaseStaleClaims`
  - `claimDueRow`: expire, cancel deleted, then claim the first due row of a sendable kind (only `confirmation` for now), ordered by `due_at`, kind, id.
  - `recordSendOutcome(id, outcome, reason)`
  - `recordHeartbeat`

  Each takes `{ now, db }` options like `createBooking`, and the test covers every matrix row.
- [ ] `src/lib/server/db/queries/outbox.ts` -- `getSendData(rowId)`: recipient email, start, duration, party size, `createdAt`, admin contact. These are immutable booking facts plus the address, read at send time.
- [ ] `src/lib/server/mail/` -- three parts:
  - `layout.ts`: blocks → `{ subject, html, text }`, satisfying every format rule in the epic context's UX section.
  - `confirmation.ts`: pure, takes the snapshot + send data + `claimedAt`.
  - `transport.ts`: `createMailer(env)` → `send(message) → { outcome, smtpCode, reason }`, plus a pure `classifySendError`. Production is SMTP 587 with `requireTLS`, From `{ name: 'Sauna Luegisee', address: MAIL_FROM }`, `Reply-To` the admin contact, and `Content-Language` set. The sink is nodemailer `streamTransport`, writing `<rowId>-<kind>.eml` to `dirname(DATABASE_PATH)/mail-sink/`.

  Tests cover subjects DE/EN, plain/HTML parity, `lang`/meta, and `classifySendError`.
- [ ] `src/lib/server/worker/index.ts` -- `startWorker()` behind a `globalThis` symbol guard. On start it calls `releaseStaleClaims` once. The loop is a `setTimeout` chain of about 60 s, unref'd, with the next tick scheduled in `finally`. `tick()` claims until `none`, sends each row, records the outcome and logs one line, then records the heartbeat. Any error is caught and logged.
- [ ] `src/hooks.server.ts` -- `init`: `applyMigrations(); if (!building) startWorker();`.
- [ ] `messages/de.json`, `messages/en.json` -- add `mail_*` keys:
  - the subject
  - the detail labels: date, start, duration, people
  - the notice-may-change line
  - the keybox line at {at}, plus the past-cutoff variant
  - the signature

  New DE and EN lines are drafts for operator review.

**Acceptance Criteria:**
- Given an EN booking Tue 12 Jan 2027 18:00 with cold start 17:20–17:30, when it is rendered, then the subject is "Booked: Sauna Luegisee, Tue 12 January, 18:00" (DE "Gebucht: Sauna Luegisee, Di 12. Januar, 18:00"). The body gives date, start, duration, party size, the notice, "If that changes, we'll let you know.", the keybox time "Mon 11 January at 18:00", and the cancel line as a `mailto:` link.
- Given the dev server, when a booking is made, then within about a minute a `.eml` appears in the sink. The log line holds no name, email, mobile or code.
- Given the worker module is evaluated twice (HMR), when `startWorker()` runs again, then no second loop starts.

## Design Notes

- **Deferred to later stories:** keybox claim, its preconditions and `last_told_notice` writes (2.2). Heat-change upsert and cancel (2.3). `resolved_at` and the call-list core (2.4). Retro A9 past-booking wording (2.2, with the keybox copy). `claimDueRow`'s sendable-kind list is the extension point.
- **Decisions:**
  - **`attempts` column:** it drives the backoff and is not a snapshot column, so it belongs in this migration.
  - **Snapshot scope:** the snapshot freezes the mutable state (notice, locale). Start, duration and party size never change, so they are read with the address at send time.
  - **Past cutoff:** judged at `claimed_at`, which is on the row, so rendering stays deterministic.
  - **Singleton guard:** a `globalThis` guard, because HMR re-evaluates modules and a plain module-level variable would reset.
  - **Stored reason:** only `smtp <code>` or an error code is stored, never the server text, which can echo the address.
  - **Sink folder:** sits next to the DB under `/data`, which is gitignored, so no new env var is needed.
  - **No admin contact:** the cancel line and `Reply-To` are omitted.
  - **Expiry:** `in_flight` rows are never expired, because the transient path brings them back to the claim, which expires them at the start time.

## Verification

**Commands:**
- `npm run db:generate` -- expected: exactly one new migration, `0004_*`.
- `npm run check && npm run lint && npm test` -- expected: all green.

**Manual checks:**
- `npm run dev`, book a slot, open the `.eml` in `data/mail-sink/`: multipart/alternative, `Content-Language`, and the text and HTML parts carry the same content.

## Suggested Review Order

**Enqueue and drain**

- Entry point: the confirmation row is inserted in the booking's own transaction.
  [`create-booking.ts:155`](../../src/lib/server/commands/create-booking.ts#L155)

- Claim: cancel the rows of deleted bookings, then expire started ones, then claim by due time, kind and id, freezing the snapshot.
  [`outbox.ts:73`](../../src/lib/server/commands/outbox.ts#L73)

- One tick: release stale claims, drain, record the heartbeat only when the drain succeeded.
  [`index.ts:135`](../../src/lib/server/worker/index.ts#L135)

- Send outside any transaction; deterministic failures are terminal.
  [`index.ts:91`](../../src/lib/server/worker/index.ts#L91)

- Outcomes: accepted, refused, transient with backoff; never writes last_told_notice.
  [`outbox.ts:147`](../../src/lib/server/commands/outbox.ts#L147)

**Mail**

- SMTP with requireTLS and timeouts, or the .eml sink; Auto-Submitted header.
  [`transport.ts:76`](../../src/lib/server/mail/transport.ts#L76)

- Pure confirmation template (DE/EN, HTML and text with the same content).
  [`confirmation.ts:32`](../../src/lib/server/mail/confirmation.ts#L32)

**Schema and boot**

- The outbox and heartbeat tables, with a partial unique index on the confirmation.
  [`0004_outbox.sql:1`](../../src/lib/server/db/migrations/0004_outbox.sql#L1)

- The worker is started from init, guarded against building and HMR.
  [`index.ts:171`](../../src/lib/server/worker/index.ts#L171)
