# Epic 2 Context: Guests are kept informed by email

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Every booking gets a confirmation email. The keybox email arrives at the 24-hour cutoff with the code and the notice that counts. Heat changes are emailed once they have settled. Every email goes out in the booking's language. Guests then arrive at the right time and can get in without phoning anyone. The epic adds the transactional outbox, the in-process worker with a heartbeat, and Infomaniak SMTP delivery. It also records refused, expired and stuck sends, so that Epic 3's call list can tell operators which guests to phone. Epic 1's booking command, notice core and keybox cutoff (`src/lib/domain/keybox.ts`) are the base. The stubs `src/lib/server/mail` and `src/lib/server/worker` are filled here.

## Stories

- Story 2.1: Guest receives a confirmation email
- Story 2.2: Guest receives the keybox email at the 24-hour cutoff
- Story 2.3: Guest is emailed when the heat state changes
- Story 2.4: Refused and stuck sends are recorded

## Requirements & Constraints

- **Confirmation:** sent on booking. It gives the date, start time, duration, party size and the notice at booking. It says the notice can change and the guest will be told, says when the keybox code arrives, and explains how to cancel (write to the admin contact). A booking made past its cutoff gets a "code follows right away" variant.
- **Keybox email:** sent at the 24-hour cutoff (start minus 24 h of real elapsed time, correct across DST), or right after the confirmation if the booking was made later. It contains the current code, the current notice marked as the one that counts, and the access and return instructions in the booking's language. If sending is delayed it still goes out late, up to the start time, and expires after that. A deleted booking never gets one.
- **Heat-change email:** sent only before the keybox email, after a 10-minute settle delay, and rechecked against the last-told notice at send time. Urgent: hot → cold start, a later earliest arrival, or an earlier latest arrival. Good news: cold start → hot. A change that only widens the arrival range sends nothing. A booking or block change can only affect its affected booking.
- **Failed sends:** a refused keybox or urgent heat-change email puts the booking on the call list as call required, with the reason. Other refusals are shown with the booking. A refused send never updates the last-told notice. Later bounces are out of scope.
- **Timeliness:** keybox emails go out within 15 minutes of the cutoff, and heat-change emails within 15 minutes of the settle delay ending.
- **Quiet off-season:** after downtime, the first tick catches up on every row that fell due.
- **Deliverability:** sender on sauna-luegisee.ch, From name "Sauna Luegisee". DNS authentication is Epic 5.
- **Privacy in logs:** log lines name the outbox row id, the outcome or state and the SMTP code. They never name a guest's name, email or mobile, or the keybox code.
- **Voice:** plain neighbour voice, informal *du*, Swiss spelling (*heiss*). Clock times and dates only, never durations or "tomorrow". Every subject carries the weekday, date and time.

## Technical Decisions

- **Outbox only:** no code except the worker sends guest email. Commands insert or upsert outbox rows in the same `BEGIN IMMEDIATE` transaction as the mutation. Rows hold no contact data and no rendered content.
- **`outbox` table (one migration in 2.1):**
  - Columns: booking id; kind `confirmation`·`keybox`·`heat_change`; state `pending`·`in_flight`·`accepted`·`refused`·`transient_failure`·`expired`·`cancelled`; due instant; `claimed_at`; reason; outcome instant.
  - Snapshot columns: `snapshot_notice` (canonical Notice JSON), `snapshot_keybox_code`, `snapshot_locale`, `snapshot_urgent`.
  - Stories 2.2 and 2.3 reuse these columns. Story 2.4 adds `resolved_at`. Story 2.1 also adds a one-row `worker_heartbeat` table.
- **Lifecycle (AD-23):**
  - Claim: `pending` or `transient_failure` → `in_flight`, which freezes the snapshot.
  - Outcome: `in_flight` → `accepted`, `refused` or `transient_failure`. A `transient_failure` row is retried with backoff while before the start time.
  - Expiry: `pending` or `transient_failure` → `expired` at the start time. An `in_flight` row never expires directly.
  - Boot: stale `in_flight` rows (older than the in-flight timeout) return to `pending`. Delivery is at-least-once.
  - Cancellation applies only to `pending` and `transient_failure` rows.
  - The worker owns and documents the backoff intervals and the in-flight timeout (for example 1, 2, 5, 10, then every 15 min).
- **Snapshot rule:** emails are rendered only from the frozen snapshot. The confirmation snapshot carries `notice_at_booking`. The keybox snapshot is the record of the code that was sent.
- **Last-told notice:** only an accepted `keybox` or `heat_change` row writes `last_told_notice`, from its snapshot, never recomputed. An accepted confirmation leaves it unchanged. Refused, expired and cancelled rows never write it. An outcome for a soft-deleted booking writes only the row.
- **Worker:**
  - Starts once in `hooks.server.ts` init, behind a module-level singleton so dev HMR never starts a second loop.
  - Ticks about every minute and schedules the next tick only after the current one finishes. It catches and logs its own errors and never exits.
  - Drain order: due time, then kind (`confirmation`, `keybox`, `heat_change`).
  - Each tick records the heartbeat through a command. SMTP sends happen outside any write transaction.
  - Claim and record-send-outcome are commands that return `{ ok, code }` results.
- **Keybox preconditions:** if the code setting or the instructions in the booking's language are empty, the row is not claimed. It stays `pending`, and each tick logs one line naming the row id and the missing setting. The DE and EN keybox code and instructions are setting columns (2.2), not messages.
- **Heat change (2.3):**
  - Pure core: `classifyHeatChange(lastTold, current) → none | urgent | good_news` and `affectedBooking`. The window uses the current changeover plus the longer pre-heat end. The earliest-arrival clamp still uses the recorded changeover.
  - Each notice-changing command upserts at most one open `heat_change` row per booking (due now + 10 min). A repeat change resets the due time.
  - Nothing is upserted, and open rows are cancelled, once the keybox row is `in_flight` or terminal.
  - At claim the worker rechecks; a result of `none` → `cancelled`.
  - Templates for the Epic 3 triggers (deletion, pre-heat change) are built and tested now.
- **Send problems (2.4):** a pure core function over the outbox rows and `now` returns call required in these cases, each only while `resolved_at` is unset:
  - the latest keybox row, or the latest urgent heat-change row, is `refused` or `expired`
  - a keybox row is still not `accepted` 15 minutes after it was due
  Other refused rows count as non-urgent. Once `resolved_at` is set, the row never raises an entry again. The display is built in Epic 3.
- **Notice:** use the one canonical Notice value and `noticeEquals`/`classifyHeatChange` only; no other code compares notices.
- **Transport:**
  - In production (`NODE_ENV=production`): nodemailer 10.4.0 over SMTP to `mail.infomaniak.com`, port 587 with STARTTLS. From is `MAIL_FROM`. `Reply-To` is the admin contact setting at send time.
  - Outside production: always a local sink (files or console), even if SMTP values are set.
  - Env values are read only through `src/lib/server/env.ts`.
- **i18n:** all email text, subjects and bodies, comes from the Paraglide catalogue and renders in the locale stored on the booking.
- **Testing:** the pure core is unit-tested with an explicit `now`, with every AD-23 transition and every heat-change direction covered. No DB or mail mocks.

## UX & Interaction Patterns

- **Format:**
  - `multipart/alternative`, with a complete `text/plain` part that has the same content in the same order as the HTML.
  - The HTML root has `lang` (`de-CH`/`en`), the `Content-Language` header matches it, and `<meta name="color-scheme" content="light dark">` is set.
  - No wrapper background colours. Wherever a colour is set, text and background are set together.
  - No images or tracking pixels. The admin contact is a `mailto:` link, any phone a `tel:+41…` link. Signed "Sauna Luegisee".
- **Keybox code:** comes first, as real text in a heading with spaced digits ("Code: 4 7 1 1").
- **Subjects (DE examples):** "Gebucht: Sauna Luegisee, Di 12. Januar, 18:00" · "Schlüsselcode für Di 12. Januar, 18:00" · "Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss" · "Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00" · "Wichtig: neue Ankunftszeit für …".
- **Copy:** the notice wording reuses the Epic 1 heat-state messages, so the guest reads the same message from day view to email. Some strings are not in the UX catalogue yet:
  - EN body lines for every email
  - the past-cutoff confirmation variant
  - the detail labels
  - the keybox "this one counts" marker and the instructions heading
  - the collapsed-range urgent body

  Draft these under the voice rules and flag them for operator review.
- **Past-booking wording (retro A9, deferred to this epic):** old confirmation pages still use future tense after the booking has passed ("schon unterwegs", "Änderungen schicken wir dir per Mail"). Settle this together with the mail wording.

## Cross-Story Dependencies

- 2.1 builds the outbox and heartbeat schema, the worker loop, claim and outcome commands, the transport and the email layout. 2.2–2.4 build on it and add no snapshot migration of their own.
- 2.2 provides the keybox phase that 2.3 needs, which stops heat-change mail once the keybox row is `in_flight` or terminal. 2.4 needs the keybox and urgent rows from 2.2 and 2.3.
- Epic 3 consumes this epic:
  - 3.3, 3.5 and 3.7 trigger heat changes through deletion, blocks and the pre-heat window. Deleting a booking cancels its open rows.
  - 3.6 displays the call list and sets `resolved_at` when an admin marks a guest as called.
  - 3.8 edits the keybox code. Accepted emails keep their snapshot code.
  - The admin home shows a warning when the heartbeat is older than 5 minutes.
- Epic 5: DNS authentication (5.2), and the readiness check (5.5) lists empty keybox and instruction settings.
- Open decision (retro A8): a resubmit after an admin has deleted the booking currently returns `conflict`, while AD-3 says an existing token never does. This is not in Epic 2's scope, but it touches the book command that 2.1–2.3 extend. Leave the behaviour unchanged unless it is decided.
