# Rubric review: ARCHITECTURE-SPINE.md (Sauna Luegisee booking calendar)

Reviewer: rubric walker (good-spine checklist, `references/reviewer-gate.md`)
Date: 2026-11-08
Target: `../ARCHITECTURE-SPINE.md` (status: draft), checked against `.memlog.md` and PRD `prd-sauna-booking-2026-11-08/prd.md`
Calibration: small volunteer app, one VPS, 6-week deadline. Severity reflects real risk to SM-1 ("no unexpected cold sauna"), guest data, or builders diverging, not polish.

## Verdict

**Pass with fixes.** The spine is strong for its stakes: a named paradigm, a clear layer table, real divergence points (pure core, single command layer, outbox, single worker, last-told notice ownership, recorded changeover, time module) and an operational envelope that is decided or explicitly deferred. Three internal contradictions or gaps sit exactly where SM-1 lives (call list, last-told notice, reply reminder) and must be fixed before handoff. No critical findings.

Counts: **critical 0 · high 3 · medium 7 · low 8**

## Checklist walk

| Checklist item | Result |
| --- | --- |
| Fixes the real divergence points for the level below, misses none | Mostly. Gaps: which notice is written as last-told on an accepted send (H2); how refused-send call-list entries clear (H1); route access to `time` (M2); Paraglide strategy (M5). |
| Every AD's Rule enforceable and prevents its divergence | Mostly. AD-21 cannot clear refused-send entries (H1); AD-7 leaves the written value ambiguous (H2); AD-1/AD-2 boundaries have no mechanical enforcement (M3); AD-22's backup claim is not backed by AD-18 (M6). |
| Nothing under Deferred lets two units diverge | One item does: "Language strategy detail" (M5). "SMTP transient-failure policy" is single-owner but leaks into call-list semantics (M1). Others are correctly single-owner. |
| Named tech verified-current | Yes. Memlog records npm registry and Node release checks dated 2026-11-08; Caddy 2.11 line checked. |
| Ratifies brownfield | N/A (greenfield). Mirrors beehiveJournal stack on current versions, as logged. |
| Covers the driving spec's capabilities | Yes. Capability map covers FR-1..FR-31 and NFR-1..NFR-10. FR-20 "flagged to admins" for bookings outside shortened season/hours has no stated home (folded into L-notes). |
| Inherited parent spine | N/A. |
| Every dimension decided, deferred, or open | Yes, including the operational envelope: deployment (AD-17), provider (Infomaniak VPS/SMTP/Swiss Backup), backups (AD-18), environments, monitoring, patching, secrets, log rotation, migrations all deferred with triggers. Monitoring deferral is the weakest (M7). |
| Altitude | Right: feature altitude, layer/ownership invariants that keep epics coherent. A few ADs drop to restating PRD consequences (L2). |
| Bloat | Low. No rationale in the spine; some restated PRD text in AD-6, AD-10, AD-12; a meta note in the Stack table. |
| Mermaid validity | All three diagrams are syntactically valid (flowchart TD, flowchart LR with subgraphs, cylinder nodes and `<-->`, erDiagram with attribute blocks and quoted labels). Content mismatch with the layer table (M2) and the ERD contradiction (H3) are semantic, not syntax. |
| Stack rows pinned | Not fully: `drizzle-kit`, Docker Compose, Caddy `2.11.x` (M4). |

## Findings

### High

**H1. Refused-send call-list entries can never leave the derived call list; urgency of a refused heat-change email is not recorded**
- Location: AD-21 (Rule), AD-6, AD-4 (outcome fields), Consistency Conventions "Outbox kinds".
- Problem: AD-21 puts a booking on the call list while "its latest keybox or urgent email outbox row is recorded as refused". Mark called (AD-7) only writes the last-told notice, which does not change the latest outbox row, so after the admin calls, the entry stays forever (until the start time passes). Also, "urgent" is not an outbox kind or a recorded field: urgency is computed at send time, so the call-list query cannot tell an urgent refused heat-change row from a good-news one (FR-14 requires only urgent ones to be call required; others are "shown with the booking"). Two units (call-list derivation in `domain`, mark-called command) will invent different fixes (a `called_at` column, a new outbox row, a stored flag).
- Fix: Extend AD-21/AD-4: the outbox row records `urgent` (boolean) at send time; a refused-send entry is cleared when an admin marks it called after the refusal (e.g. mark called records `called_at` on the booking, and the entry shows only if the refusal is newer than `called_at`), or when a later email of the same kind is accepted. State it in one Rule so domain and command agree. While there, align wording: AD-21 says "keybox email was sent", AD-6 says "accepted"; pick "accepted" (FR-13's "sent" maps to the mail service accepting it).

**H2. AD-7 does not say which notice the record-send-outcome command writes as last-told**
- Location: AD-7, AD-4, AD-5 ("SMTP sends happen outside the write transaction; the outcome is recorded afterwards via a command").
- Problem: The email is rendered from current data at send time (AD-4), sent outside the transaction, and the outcome is recorded later. If a booking or block changes between render and record, a command that writes "the current notice" marks a notice as told that the guest never received. That is precisely the silent failure SM-1 counts. The outbox row records the keybox code it contained but not the notice it contained, so the correct value is not available to the command.
- Fix: AD-4: each sent row stores the notice it rendered (heat state + arrival range). AD-7: on accepted, record-send-outcome writes the row's rendered notice, never a recomputed one. Same rule already holds for mark called ("the notice the entry displayed"); make the email path symmetric. Also clarify for the confirmation email: it renders the notice at booking (FR-10) or the current notice; either is acceptable once the rendered notice is the one stored.

**H3. Reply reminder: AD-20 says no separate copy; ERD, naming table and AD-12 assume a `reply_reminder` table holding contact data**
- Location: AD-20 ("reply reminder ... is the state `reply_done_at` on the deleted booking itself"; "Contact data exists only on `booking`"), ERD (`BOOKING ||--o| REPLY_REMINDER`), Consistency Conventions Naming (`reply_reminder` table), AD-12 ("and from any copy kept for reply reminders").
- Problem: The spine contradicts itself on a data-ownership invariant that touches personal data and the FR-28 purge. One builder will add a `reply_reminder` table (and maybe copy name/email into it), another will use `reply_done_at` on `booking`. The memlog's later decision (soft delete, `reply_done_at` on booking) is the authority.
- Fix: Remove `REPLY_REMINDER` from the ERD and `reply_reminder` from the naming table; drop "and from any copy kept for reply reminders" from AD-12 (or replace with "no copy of contact data exists outside `booking` (AD-20)").

### Medium

**M1. A keybox email that is never sent before the start time disappears silently**
- Location: AD-6 ("sent late up to the start time, and is dropped after it"), Deferred "SMTP transient-failure policy".
- Problem: If SMTP is unreachable (transient errors retried, not refused) until the start time, the row ends as skipped/dropped and nothing reaches the call list: the guest stands at a locked keybox. Same for a late booking during an outage. The transient policy is deferred to the worker alone, but its end state affects call-list semantics owned elsewhere.
- Fix: One sentence in AD-6/AD-21: a keybox email still not accepted at its due time + 15 min (NFR-4 bound) or dropped at the start time puts the booking on the call list as call required with reason "not delivered". Keep the retry mechanics deferred.

**M2. Layer table and dependency diagram disagree; routes are not allowed to use `time`**
- Location: Design Paradigm table and first mermaid flowchart.
- Problem: The table lets commands and worker touch `time`, but the diagram has only `domain --> time`. Routes are allowed neither in table nor diagram, yet routes parse `yyyy-mm-dd`/`hhmm` URL segments (Conventions) and format clock times for display (AD-9 says `time` alone does display formatting). Builders will either reimplement Zurich conversion in routes (exactly what AD-9 prevents) or route everything through `domain`. Mail also needs time formatting for "clock times".
- Fix: Add `time` to the routes and mail rows, and draw `routes --> time`, `commands --> time`, `worker --> time`, `mail --> time` in the diagram. Optionally list `server/env.ts` in the table (used by db, mail, worker).

**M3. Boundary rules (AD-1 purity, AD-2 single write path) have no mechanical enforcement**
- Location: AD-1, AD-2, Design Paradigm table.
- Problem: "nothing else imports write paths of `src/lib/server/db`" and "domain never reads DB/clock/env" are enforceable only by review. With agents building stories in parallel under deadline, an import slips through unnoticed. Also "write paths of db" is not a defined module boundary.
- Fix: Split `db` into `db/queries` (reads) and `db/schema` + write access used only by `commands`; add an import-boundary lint at scaffold (ESLint `no-restricted-imports` or `eslint-plugin-boundaries`) mirroring the layer table, plus a ban on `Date.now`/`new Date()` and `$env` in `src/lib/domain` and `src/lib/time`. One line in AD-1/AD-2 ("enforced by lint at scaffold").

**M4. Stack rows not pinned**
- Location: Stack table: `drizzle-kit` ("pin at scaffold"; note "seed, not in memlog"), Docker Compose ("pin at scaffold"), Caddy `2.11.x`.
- Problem: The checklist and `lint_spine.py` expect pinned versions. `drizzle-kit` must be compatible with `drizzle-orm` 0.45.4, so leaving it open is a real (if small) mismatch risk. The "(seed, not in memlog)" annotation is author meta-text, not spine content.
- Fix: Look up and pin the `drizzle-kit` version matching drizzle-orm 0.45.4 and the current Caddy 2.11 patch tag (log both as `version` entries); for Docker Compose, pin the plugin major (v2.x current) or move it to Deferred with Caddy's exact tag. Remove the meta note.

**M5. Paraglide locale strategy is deferred but crosses units**
- Location: Deferred "Language strategy detail (cookie only vs URL prefix)", AD-11, AD-13, source tree.
- Problem: A URL-prefix strategy changes every route path (`/en/day/...`), every link in emails (`/booked/[publicId]`), the source tree, and `hooks.server.ts` routing. It is not owned by one unit, so it fails the Deferred test.
- Fix: Decide now: cookie strategy with base locale `de` fallback, no URL prefix (fits AD-11's two cookies, AD-13's URLs and the source tree). Log as a decision and fold into AD-14.

**M6. AD-22 claims `GUEST_KEY_SECRET` is backed up with the database, but AD-18 backs up only the SQLite file**
- Location: AD-22, AD-18, Deferred "Secrets handling".
- Problem: The secret is an env value (Config convention), not in SQLite. Losing the VPS loses the secret, breaking unique/repeat guest counts across seasons (FR-24) — the exact divergence AD-22 says it prevents. Nothing in the backup Rule covers env secrets.
- Fix: Either store the secret in the DB (generated on first boot into `setting`, so it travels with the backup) or add to AD-18: the env file (or at least `GUEST_KEY_SECRET`) is stored off-box with the operators (e.g. password manager). Prefer the DB option: one less manual step.

**M7. Monitoring deferred past launch, though the in-process worker can fail silently**
- Location: Deferred "Monitoring and alerting", AD-5.
- Problem: If the worker loop throws or stalls, the web app still serves pages and bookings succeed, but no confirmation, keybox or heat-change email goes out and no refusal reaches the call list (refusals are recorded by the worker). "Refusals already surface on the call list" does not cover a dead worker. AD-5 also does not say a failing tick must not kill the loop.
- Fix: AD-5: each tick catches and logs its own errors and the loop never exits; worker records `last_tick_at`. Before launch (not after): a `/health` endpoint that fails if `last_tick_at` is older than ~5 min, polled by a free external uptime check that emails the operators. Small, cheap, and protects SM-1 over months of idle time.

### Low

**L1. Memlog does not record several ADOPTED decisions that the spine states**
- Location: AD-11 (exactly two cookies, theme in `localStorage` with inline script), AD-4 details (no rendered content/contact data in rows, cancel on delete), AD-17 details (non-root, memory limit), Consistency Conventions (command result shape, outbox kinds, logging).
- Fix: Append the missing decisions to the memlog (or drop `[ADOPTED]` where the user did not settle them), so the spine stays distilled from the memlog and an Update can re-derive it.

**L2. Some ADs restate PRD consequences instead of fixing an invariant**
- Location: AD-6 (most of FR-12/13/14 restated), AD-10 ("5 wrong, then 1 per minute" from FR-15), AD-12 (FR-30 field list), AD-17 (VPS specs duplicated in Stack).
- Fix: Keep the architectural parts (single pending row per booking, recheck at send via the core, keybox accepted as the switch, analytics tables PII-free and never purged) and reference FR-12/13/14, FR-15, FR-30 for the rest.

**L3. Confirmation vs keybox ordering for late bookings unspecified**
- Location: AD-4 (both rows "due now").
- Fix: Worker drains due rows ordered by due time then insertion id, so the confirmation always precedes the keybox email (FR-11 "immediately after the confirmation").

**L4. Due time of a first heat-change row not stated**
- Location: AD-6 (only the re-enqueue case is specified).
- Fix: "A heat-change row is enqueued, or moved if one is pending, with due time now + settle delay."

**L5. Domain registration and DNS not on the open-questions list**
- Location: Open questions (only sender address); AD-15, AD-17.
- Fix: PRD OQ1 says sauna-luegisee.ch is not registered yet; Caddy's automatic HTTPS and SPF/DKIM/DMARC both depend on it. Extend the open question: "register domain, point A record at the VPS, set SPF/DKIM/DMARC — before first deploy".

**L6. Dev environment safety for the worker and mail**
- Location: AD-5, Deferred "Environments".
- Problem: `hooks.server.ts` init under Vite dev with HMR can start the loop more than once, and local dev with real SMTP credentials can email real guests from seeded or copied data.
- Fix: Guard the worker start with a module-level singleton, and use a local SMTP sink (or log transport) whenever not production.

**L7. Small table and coverage nits**
- Location: Design Paradigm table row "Persistence" lists contents, not allowed dependencies; FR-20 "shortened season/hours bookings flagged to admins" has no stated owner; AD-6 "other refusals are flagged on the booking" reads like a stored flag while AD-21 derives from outbox rows.
- Fix: Persistence row "May touch: nothing above it"; name `domain` as the owner of the out-of-hours/out-of-season flag (derived, not stored); say "shown on the booking from its outbox outcomes".

**L8. OS patching decision timed to season start, but the box is public from mid-December**
- Location: Deferred "OS and image updates on an idle box".
- Fix: Change the trigger to "before first public deploy" (enable unattended security upgrades at provisioning; base-image rebuild between seasons can stay deferred).
