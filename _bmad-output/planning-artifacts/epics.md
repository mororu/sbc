---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-sauna-booking-2026-11-08/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-sauna-booking-2026-11-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-sauna-booking-2026-11-08/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-sauna-booking-2026-11-08/ARCHITECTURE-SPINE.md
---

# Sauna Luegisee booking calendar - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Sauna Luegisee booking calendar, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

PRD §4 Glossary terms (wagon, operator, admin, season, operating hours, booking, guest, block, changeover, back to back, start time, heat state, hot, cold start, pre-heat window, arrival time, earliest arrival, latest arrival, notice, last-told notice, heat change, affected booking, settle delay, keybox code, keybox email, 24-hour cutoff, call list, booking horizon) are used exactly as defined there. Requirement ids keep the PRD's hyphenated form (FR-n, NFR-n) for exact traceability.

## Requirements Inventory

### Functional Requirements

FR-1: Browse availability — A guest, without sign-in, can see every day from today to the end of the booking horizon that falls inside a season, each start time marked free or unavailable. Days outside a season or beyond the booking horizon are not selectable; before a season the page says when the season opens and from which date booking opens ("Season opens 9 January. Booking opens 26 December."); after the last season it says the season is over; past start times are not offered; an unavailable start time reveals nothing about who booked it or why it is blocked.

FR-2: Heat state on every free start time — Each free start time shows hot or cold start per the §4 heat state rule (hot iff back to back with a booking before it, using the current changeover; any longer gap or a block is cold start). With a 15-min changeover: booking 17:00–18:00 alone → 18:15 offered and hot, 18:30 and 19:00 cold start, 18:00 not offered; bookings 17:00–18:00 and 19:00–20:00 → the 19:00 booking is a cold start; only a booking at 19:00 → 17:45 offered for 60 min and 17:15 for 90 min, booking either turns 19:00 hot; a booking right after a block of any reason is a cold start; heat state never depends on the chosen duration.

FR-3: Arrival time shown on cold starts — Every cold start shows its arrival time as clock times ("come between 17:20 and 17:30"), never as a duration. With a 30–40-min pre-heat window: cold start 18:00 → 17:20–17:30; block ending 17:25 → 17:25–17:30; booking ending 17:30 with 15-min changeover → only 17:45, with text saying how many minutes there are to heat ("only 15 minutes to heat: it will still be warming up"); arrival time already past at booking → text says come as soon as possible and the wagon will not be fully hot at the start.

FR-4: Start times — Start times follow the §4 definition (kind 1: every full and half hour; kind 2: end of each booking plus one changeover; kind 3: any time from which a booking would end exactly one changeover before an existing booking, offered only with the durations that end there), within admin-set operating hours. No start time before operating hours begin and no booking ending after they end; no start time less than one current changeover after a booking ends; no changeover needed next to a block.

FR-5: Make a booking — A guest can book a free start time by choosing a duration (60, 90, 120, 150 or 180 min) and party size (1–6) and entering name, email and mobile number. Durations that would overlap a block, end less than one current changeover before the next booking, or run past operating hours or the season are not offered; an invalid email or mobile number is rejected inline without losing typed input; no account, password or verification step.

FR-6: No double booking — A new booking can never start or end less than one current changeover from another booking, or overlap a block; pairs of existing bookings made under an earlier, shorter changeover stay valid. Of two simultaneous conflicting attempts exactly one succeeds; the other guest sees a clear message and the refreshed day and keeps the entered contact details.

FR-7: Notice at booking — The confirmation screen shows the booking's notice at that moment, and that notice is stored as the last-told notice.

FR-8: Booking window — Bookings are accepted from now until the end of the booking horizon, inside a season; a start time can be booked until it begins (no minimum lead time).

FR-9: Privacy information — The booking form links to the privacy statement (FR-29) and says in one line why each field is collected; there is no consent checkbox.

FR-10: Confirmation email — On booking, the guest receives an email with date, start time, duration, party size, the notice at booking, a note that the notice can change and the guest will be told, how to cancel (by email to the admins), and when the keybox code will arrive.

FR-11: Keybox email — At the 24-hour cutoff the guest receives the keybox email with the current keybox code, the access and return instructions and the current notice. A booking made after its 24-hour cutoff gets it immediately after the confirmation; if accepted by the mail service its notice becomes the last-told notice; a deleted booking never receives one; if sending is delayed (e.g. downtime) it is still sent late, up to the start time.

FR-12: Heat-change email — Until a booking's keybox email has been sent, a heat change is emailed to the guest once the notice has been stable for the settle delay (10 min). At send time the notice is compared again with the last-told notice and nothing is sent if they match (book-then-delete inside the settle delay sends nothing); none is sent after the keybox email; hot → cold start and a later earliest arrival are marked urgent and give the arrival time; cold start → hot is sent as good news; creating or deleting a booking or block can only cause a heat change in its affected booking.

FR-13: Heat changes after the keybox email go to the call list — When a booking whose keybox email has been sent has a heat change, no email is sent and the booking appears on the call list: hot → cold start and a later earliest arrival are *call required*, cold start → hot is *optional*; if the notice changes back to the last-told notice before anyone calls, the entry leaves the list; before the keybox email nothing goes on the call list.

FR-14: Failed sends go to the call list — If the mail service refuses a keybox email or an urgent heat-change email, the booking goes on the call list as *call required* with the reason, and the last-told notice is not updated. Other refused emails are shown with the booking. Later bounces are out of scope.

FR-15: Shared admin sign-in — An admin signs in with the single shared password; guests never sign in. After 5 wrong passwords from one address, at most one attempt per minute is accepted; changing the password signs out every other admin session.

FR-16: Booking list — An admin can see bookings by day with guest name, email, mobile number, party size, current notice, last-told notice, and keybox-email status including the code it contained.

FR-17: Create a block — An admin can create a block with start, end and reason (cleaning, maintenance, private use). A block overlapping an existing booking is refused and the conflicting bookings are listed (blocks never remove bookings); a block inside the changeover between two back-to-back bookings is refused; before saving, the admin sees any heat change the block causes in its affected booking (a later earliest arrival) and whether it will be emailed or needs a call.

FR-18: Delete a booking or block — An admin can delete a future booking or block. Before deleting, the admin sees the affected booking (guest name), its heat change measured against its last-told notice, and whether it will be emailed (FR-12) or needs a call (FR-13); deleting a booking cancels its pending emails and removes it from the call list; the deleted booking's guest is not emailed automatically; bookings whose start time has passed cannot be deleted.

FR-19: Blocks never heat — No block heats the wagon, whatever its reason; a booking starting right after a block (including private use) is a cold start.

FR-20: Settings — An admin can set season start and end, operating hours, changeover, booking horizon, pre-heat window, keybox code, access and return instructions (DE and EN), admin contact address and admin password. Allowed values: changeover 0–60 min; each pre-heat end 15–90 min with shorter ≤ longer; both in 5-min steps; booking horizon 1–60 days. A new changeover applies only to bookings made afterwards (existing bookings keep times and heat states, no emails). The keybox code can change any time; each keybox email uses the code current when sent; sent emails are not resent; no automatic rotation or scheduled codes. Shortening a season or operating hours never deletes bookings; they stay fully valid and are flagged to admins. A pre-heat window change can cause heat changes; the admin sees how many bookings are affected before saving.

FR-21: Call list — An admin sees every call-list booking with guest name, tap-to-call mobile number, start time, notice to give, last-told notice, and call required/optional, and can mark an entry as called. The call list is visible from admin home with a count; marking as called stores the displayed notice as the last-told notice, and is refused (entry re-shown with the new notice) if the notice changed since display; entries whose start time has passed drop off.

FR-22: When should we clean? — Analytics view: bookings and booked hours by weekday, by hour of day, and by week of the season. (Can follow launch.)

FR-23: How much wood are we burning? — Analytics view: cold-start bookings per week and per season, labelled as the estimate of fires lit. (Can follow launch.)

FR-24: Is this worth repeating? — Analytics view for the season: number of bookings, booked hours, unique guests, share of guests who booked more than once, and share of bookable hours (operating hours in force each day minus blocks) that stayed empty; the changeover after each booking counts as used. (Can follow launch.)

FR-25: Are empty start times empty because they are cold starts? — Analytics view counting each free kind-1 or kind-2 start time that passed unbooked once, as hot or cold start by its heat state when it passed, compared with the same split for booked start times; states its question in plain words with a one-line reading ("Cold-start times were booked about half as often as hot times"). (Can follow launch.)

FR-26: German default, English alongside — All guest-facing text (pages, errors, emails, keybox instructions) exists in German and English; German is the default; a guest can switch language from any page and the choice is remembered on that device.

FR-27: Language per booking — Each booking stores the language it was made in and every email for it uses that language; the admin portal follows the language switch (admin-only text may stay German if time runs short).

FR-28: Retention — Name, email and mobile number of every booking, including deleted bookings, are deleted automatically 30 days after the end of the season the booking belongs to; only analytics records (FR-30) remain.

FR-29: Privacy statement — A public privacy statement in DE and EN names the operator contact, each field with its purpose (email for confirmation and keybox code, mobile for the short-notice call, name to identify the booking at the wagon), the retention period, and that no tracking or third-party analytics are used.

FR-30: Analytics record (MVP) — From the first booking, at each booking's start time a record is kept of date, start time, duration, party size, heat state, the changeover it was made under, and a one-way key derived from the guest's email; each operating day records its operating hours, its blocks, and the free start times that passed unbooked with their heat state; bookings deleted before their start time are excluded; records contain no name, email or mobile and survive FR-28 deletion.

FR-31: Reminder to answer a cancelled guest — Deleting a booking creates a reminder for admins to email that guest personally: shown right after deletion with guest name, email and the deleted booking's date and time; tapping the email opens a new email with a short prepared text in the booking's language, editable before sending from the admin's own mail program; the reminder stays on admin home next to the call list with its own count until an admin marks it done, shared by all admins.

### NonFunctional Requirements

NFR-1: Mobile first — Every guest flow works one-handed on a 360 px-wide phone screen; tap targets ≥ 44 px; text contrast meets WCAG 2.1 AA (UX raises the target to WCAG 2.2 AA) for reading outdoors in low light or glare.

NFR-2: Speed — A first-time guest can book in under one minute; the calendar is usable within 3 seconds on a mid-range phone over 4G; no formal page-weight budget.

NFR-3: Time — All times are Europe/Zurich wall-clock, including the summer-time switch on 28 March 2027; the 24-hour cutoff is measured in real elapsed time; emails state clock times, never "same time tomorrow"; the booking horizon is counted in calendar days.

NFR-4: Timeliness of emails — Keybox emails are sent within 15 minutes after the 24-hour cutoff; heat-change emails within 15 minutes after the settle delay.

NFR-5: Deliverability — Emails come from a sender on sauna-luegisee.ch with standard authentication (SPF/DKIM/DMARC), reaching common Swiss and international mailboxes rather than spam folders.

NFR-6: No lost bookings — Bookings are backed up daily to a location off the server; a restore is tested before the season opens.

NFR-7: Admin security — Admin pages are reachable only after sign-in and only over HTTPS; the password is stored only as a strong hash; guest contact details are never shown on public pages.

NFR-8: Privacy by default — No third-party trackers or analytics; only cookies essential for language choice and admin sessions.

NFR-9: Quiet off-season — The app may sit idle for months; it comes back after a server restart without manual steps, its certificate renews automatically, and scheduled emails missed during downtime are sent when it is back (FR-11).

NFR-10: Plain voice — Guest-facing text speaks like a neighbour: short, concrete, friendly ("Nobody before you: come between 17:20 and 17:30 and light the fire", "Already hot at 18:15."); notices always give a clock time and never hedge; same voice in DE and EN.

### Additional Requirements

**Starter template — shapes Epic 1 Story 1.** The project is greenfield. Scaffold with SvelteKit 3 via `sv create` (TypeScript), then `sv add paraglide` (locales `de` base + `en`), with `@sveltejs/adapter-node`, Drizzle ORM + drizzle-kit on better-sqlite3, Vitest, ESLint with the import-boundary rules (AD-1, AD-2), and the source tree from the Structural Seed (`src/lib/{domain,time,schemas,paraglide,server/{env.ts,db,db/queries,commands,worker,mail}}`, `src/routes/(guest)`, `src/routes/admin`, `messages/de.json|en.json`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `eslint.config.js`, `scripts/backup.sh`). Scaffold-time decisions to settle in that story: instant storage form (ISO text or epoch ms, used everywhere incl. notice JSON), validation schema library, initial admin password bootstrap (decided: CLI `npm run set-admin-password`, built in Story 3.1), drizzle-kit migration workflow.

- **Pinned stack (Stack table):** Node 26 LTS (`node:26.13.0-alpine3.24`), `@sveltejs/kit` 3.1.1, Svelte 5.57.3, `@sveltejs/adapter-node` 6.0.1, `@sveltejs/vite-plugin-svelte` 7.3.1, Vite 8.3.6, TypeScript 6.0.3, svelte-check 4.7.8, Vitest 4.1.12, better-sqlite3 13.0.3 (bundled SQLite), drizzle-orm 0.45.4, drizzle-kit 0.31.11, nodemailer 10.4.0, `@inlang/paraglide-js` 2.29.3, argon2 0.45.2, Caddy 2.11.9 (`caddy:2.11.9-alpine`), Docker Compose 5.7.0. SvelteKit 3 idioms: `#lib/…` imports with explicit extensions, `$app/state` (not `$app/stores`), `refreshAll`, hook types from `@sveltejs/kit/hooks`, origin via `kit.paths.origin`.
- **Layering and import rules (Design Paradigm, AD-1, AD-2):** enforce the layer table with ESLint `no-restricted-imports` (or equivalent) from the scaffold: `domain` imports only `time`; `time` and `schemas` import nothing; db connection/schema importable only by `commands` and `db/queries`; routes write only via commands and read via `db/queries`; `Date.now`, `new Date()` and env access banned in `src/lib/domain` and `src/lib/time`. App env read only in `src/lib/server/env.ts` (`DATABASE_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `GUEST_KEY_SECRET`).
- **Pure core (AD-1, AD-8, AD-24):** `src/lib/domain` exposes pure functions over `(bookings, blocks, settings, outbox rows, now)`: offered start times with durations (all three kinds, clipped to current operating hours, season, horizon), heat state, arrival time, notice, affected booking, `noticeEquals`, `classifyHeatChange(lastTold, current) → none | urgent | good_news` (urgent: hot → cold, later earliest, earlier latest arrival), conflicts, keybox phase, call-list membership, out-of-hours/out-of-season flag (derived, never stored). Calendar and book command call the same offer function. Back to back for existing bookings uses the changeover recorded on the later-made booking (`created_at`, row id tiebreak); earliest-arrival clamp uses the recorded changeover of the booking ending in the window. One canonical Notice value `{ heat: 'hot'|'cold', earliest: instant|null, latest: instant|null }` (hot → both null; collapsed range → earliest only) with one canonical JSON serialization everywhere (stored, snapshot, form tokens); "already past" and "minutes to heat" derived at render time.
- **Command layer (AD-2, conventions):** every mutation is a verb-first function in `src/lib/server/commands` (book, delete booking, create/delete block, change settings incl. season rows, change password, mark called, mark reminder done, sign in/out, claim outbox row, record send outcome, record heartbeat, snapshot analytics, purge personal data) that loads state, calls the core, writes, and enqueues/cancels outbox rows in the same transaction. Commands return `{ ok: true, … }` or `{ ok: false, code }` with codes `conflict`, `stale`, `not_found`, `past`, `invalid`, never throwing for expected outcomes. Form actions return `fail(status, { errors: { field: messageKey }, values })` (passwords never echoed); booking conflict/past returns `fail(409, { code, date })`. Impact previews (FR-17/18/20) call the same core functions; the command refuses with `stale` if the outcome changed.
- **Transactions and idempotency (AD-3):** each command runs in one `BEGIN IMMEDIATE` SQLite transaction with checks against freshly read state (offered start time + duration, block overlap, block inside a back-to-back changeover, no block/deletion for past time, displayed notice unchanged for mark called). Each booking form render carries a random submit token (≥ 128 bits) stored on the booking with a unique constraint; a duplicate submit returns `{ ok: true }` with the existing public id. The form also posts its displayed notice token; if the notice changed, the booking is still made and the confirmation flags the change.
- **Data model (AD-8, AD-20, AD-25, conventions):** tables `booking`, `block`, `season`, `setting`, `outbox`, `admin_session`, `worker_heartbeat`, `analytics_booking`, `analytics_day` (snake_case, singular). Booking stores recorded changeover, `created_at`, `season_id` (never changed), locale, `notice_at_booking` (immutable) and `last_told_notice` (AD-7), public id, submit token, nullable contact columns; mobile normalised to E.164. Bookings are soft-deleted (`deleted_at`); every query and core input excludes them except the FR-31 reminder (`deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`). Seasons are non-overlapping rows edited in place. Row ids are integer and admin-only; public id, submit token and session id are random URL-safe ≥ 128 bits. Enumerations: heat `hot`·`cold`; block reasons `cleaning`·`maintenance`·`private_use`; locales `de`·`en` (`de` → `de-CH`).
- **Last-told notice ownership (AD-7):** book sets both notices; afterwards `last_told_notice` is written only by record-send-outcome on an accepted `keybox` or `heat_change` row (from its snapshot) and by mark called (from the posted displayed notice token). Accepted confirmation, refused/expired/cancelled rows, and outcomes for deleted bookings never update it.
- **Transactional outbox (AD-4, AD-23):** only the worker sends guest email. Commands insert rows of kind `confirmation` (due now), `keybox` (due at 24-hour cutoff or now), `heat_change`; rows hold no contact data or rendered content. States `pending`, `in_flight`, `accepted`, `refused`, `transient_failure`, `expired`, `cancelled` per the AD-23 state diagram. Claim (one transaction) moves a due row to `in_flight` and freezes a send snapshot (notice; keybox code for keybox rows; language; urgent flag for heat-change rows; confirmation carries `notice_at_booking`); email rendered only from the snapshot; SMTP send outside any write transaction. Transient errors back off until start time; unsent at start → `expired`; stale `in_flight` rows return to `pending` on boot (at-least-once). Deleting a booking cancels its `pending`/`transient_failure` rows. Keybox code, changeover, operating hours and season changes enqueue nothing.
- **Heat-change debounce and keybox phase (AD-6):** commands recompute the notice of the affected booking (booking/block create/delete) or of all future non-deleted bookings (pre-heat window change); per booking with a heat change, upsert exactly one open `heat_change` row due now + 10 min (reset on each change). Worker rechecks against last-told notice at claim (equal → `cancelled`). Keybox phase = keybox row terminal; once keybox row is `in_flight` or terminal, open heat-change rows are cancelled and none upserted. Keybox email sent late up to start time, then expires.
- **Worker (AD-5):** one in-process loop started once in `hooks.server.ts` init behind a module-level singleton (no second loop under dev HMR); ticks about every minute, next tick scheduled only after the current finishes; drains due outbox rows ordered by due time then kind (`confirmation`, `keybox`, `heat_change`), runs scheduled jobs (analytics snapshots, purge), records a heartbeat via a command; catches/logs its own errors, never exits; idempotent catch-up after downtime. Exactly one app instance; no separate worker container or external scheduler. Admin home warns when the last heartbeat is older than 5 minutes.
- **Call list derived (AD-21):** computed per request by the core, one entry per non-deleted future booking: keybox phase + urgent → call required, good_news → optional; latest keybox or latest urgent heat-change row `refused`/`expired`, or a keybox row not `accepted` 15 min after due (still retried), with `resolved_at` unset → call required with reason (keybox entry shows the keybox code to give). Call required wins. Mark called writes last-told notice and sets `resolved_at` on that booking's refused/expired rows. No call-list table or flag column; other refusals derived from outbox rows.
- **Time module (AD-9):** instants persisted and passed as UTC; `src/lib/time` alone converts to/from Europe/Zurich wall-clock (operating hours, 30-min grid, calendar days, horizon, season bounds, display formatting); 24-hour cutoff = start instant − 24 h real time; only the shell reads the clock and passes `now` inward. Implementation via Temporal (Node 26 default) on the server; check browser support/polyfill if client code imports it. URL dates `yyyy-mm-dd`, times `hhmm`; durations in whole minutes.
- **Admin sessions (AD-10):** one shared password stored only as an argon2 hash; sign-in creates a server-side `admin_session` row, browser holds an opaque random id in a `Secure`, `HttpOnly`, `SameSite` cookie; every `/admin` route except `/admin/login` guarded in `hooks.server.ts`; password change deletes all other sessions; failed attempts rate-limited per client address (5 wrong → 1/min; storage in memory or SQLite, owned by the sign-in command); post-sign-in return target accepted only as a same-origin `/admin` path; session lifetime set by the sign-in command.
- **Cookies and client storage (AD-11):** exactly two cookies (language choice, admin session); `localStorage` holds only the theme choice, applied before first paint by an inline script; `sessionStorage` holds only guest name/email/mobile (written on input and submit, read by the booking form; re-asked without JS); guest details never in URLs, cookies or redirects; no third-party scripts, fonts, analytics or pixels on pages or in emails.
- **Public data exposure (AD-13, AD-26):** confirmation route `/booked/[publicId]` with an unguessable id; no guest data in any http(s) URL or query string; row ids only in admin routes; admin-only `mailto:`/`tel:` may carry guest data. Loads/actions under `routes/(guest)` return only a view model (offered start times with durations, heat state, notice, taken intervals as start/end, season state; confirmation: date, start, duration, party size, notice at booking, keybox-email time); guest read queries never select contact columns or block reasons.
- **Analytics records (AD-12, AD-22):** worker writes `analytics_booking` at each non-deleted booking's start time (unique on booking id: `season_id`, Zurich-local date, start `hhmm`, weekday, ISO week, duration, party size, heat state, recorded changeover, guest key) and `analytics_day` once a day has passed (unique on date: `season_id`, operating hours, blocks, unbooked kind-1/kind-2 start times with heat state, using settings at snapshot time). Guest key = HMAC-SHA256(trimmed lowercased email, `GUEST_KEY_SECRET`); secret never changes; no plain hash stored. Analytics tables hold no contact data, are never purged; views read only analytics tables and group on stored local columns.
- **Seasons and purge (AD-25, AD-20):** worker purges each booking (deleted included) at max(booking start, its season's current end) + 30 days by setting name, email, mobile to NULL via the purge command (which also clears any open reply reminder).
- **i18n strategy (AD-14):** Paraglide 2.29.3, locales `de` (base) and `en`; locale strategy cookie → preferred language → base locale; no URL prefixes. Every guest-facing string incl. email bodies and the FR-31 prepared reply text is a message in `messages/`; booking stores the locale active at submit and all its emails/prepared text render in it; keybox access and return instructions are DE/EN settings, not messages.
- **Email transport (AD-15):** nodemailer over authenticated SMTP to Infomaniak (`mail.infomaniak.com`, 587, STARTTLS), sender on sauna-luegisee.ch with From name "Sauna Luegisee"; `Reply-To` = admin contact address setting at send time; every email has HTML and plain-text parts rendered from the snapshot and the same messages, with `lang` and `Content-Language` matching the booking; "accepted" = SMTP server accepted. Outside production the transport is a local sink or log, never real SMTP.
- **Validation schemas (AD-16):** one schema per form in `src/lib/schemas`, shared by client (inline errors) and form action (before the command); error messages are i18n keys; booking schema trims email and normalises mobile to E.164; server result authoritative.
- **Deployment (AD-17):** one Infomaniak VPS Lite (1 vCPU, 2 GB RAM, 20 GB) for this app only; Docker Compose with `caddy` (publishes 80/443, automatic HTTPS for sauna-luegisee.ch, cert data on a persistent volume, access logs disabled) and `app` (multi-stage image on `node:26.13.0-alpine3.24`, `npm ci` from committed lockfile, non-root, port 3000 internal only, SQLite on a named volume, memory-limited — value pinned at first deploy); images built on the VPS with a 2 GB host swapfile; both services restart automatically after reboot; `ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`; `kit.paths.origin = 'https://sauna-luegisee.ch'` (no `ORIGIN` env). Docker log rotation size cap set in compose at first deploy.
- **Backups and secrets (AD-18):** SQLite in WAL mode with busy timeout; nightly host cron (`scripts/backup.sh`) takes a consistent online backup (backup API or `VACUUM INTO`) and uploads with `s3cmd` or `rclone` to Infomaniak Swiss Backup S3 (Switzerland); local copies bounded and transient; backup retention bounded so FR-28-purged data ages out; `GUEST_KEY_SECRET` and other env secrets kept in the operators' password manager and as an encrypted copy alongside the Swiss Backup upload; a restore including env secrets is tested before each season opens.
- **Logging (conventions):** plain lines to stdout/stderr collected by Docker; never log name, email, mobile, keybox code or password; log each send outcome by outbox row id; Caddy access logs off; login rate-limit entries short-lived.
- **Testing the core (AD-19):** every exported function of `src/lib/domain` and `src/lib/time` has unit tests with explicit `now`, including the PRD/UX worked examples (Lena, Jonas, Tom), the 28 March 2027 DST switch, a changeover raised from 15 to 30 min next to an existing booking, the collapsed arrival range, `classifyHeatChange` in every direction, and keybox-phase transitions; no DB or mail mocks.
- **Before first public deploy (Open questions, Deferred):** register sauna-luegisee.ch, point its A record at the VPS, choose the sender address (PRD OQ1), set SPF/DKIM/DMARC; set security headers in one place (HSTS, `frame-ancestors`, CSP allowing the inline theme script by hash); decide OS/base-image patching cadence; settle the secrets-file mechanism (`.env` permissions vs compose secrets). Deferred (not v1 build): CI pipeline, staging environment, external uptime monitoring, Paraglide 3 upgrade.

#### Resolved ambiguities (2026-11-08)

- **Urgent heat changes:** hot → cold start, a later earliest arrival and an earlier latest arrival are all urgent (PRD Glossary "heat change", AD-6, AD-21, EXPERIENCE.md).
- **Accessibility level:** build to the stricter UX floor, WCAG 2.2 AA with reflow at 320 px, 200 % text and text-spacing overrides; this satisfies NFR-1.
- **Small meaningful text:** `body-sm` and `segment` text that carries meaning uses weight 400, per DESIGN.md's own rule for text below 16 px.
- **Language preference storage:** cookie (AD-11).
- **Contact details after a conflict:** kept in sessionStorage; without JavaScript the guest is asked again. Accepted as progressive enhancement for FR-6.
- **Keybox email stuck 15 minutes:** adds a call-list trigger beyond the PRD (AD-21, user decision); stories follow AD-21.
- **Seasons in settings:** the Saison card edits the current or next season; once a season has ended, "Nächste Saison anlegen" creates a new season row. Past seasons stay for analytics and purge timing (AD-25, user decision).
- **Admin date strip range:** the days of the current or next season.
- **Operator-authored content:** the Impressum, the "So funktioniert's" text, the privacy statement and the access instructions are written by the operators; stories provide the pages and editable or static slots, not the wording.
- **Copy alignment:** the screen-reader text for a cold start reuses the catalogue's cold-start notice.
- **Block deletion:** still recomputes (AD-6); the impact dialog may report no effect.
- **Purge timing:** AD-25 (max of booking start and season end, plus 30 days) governs.
- **Before first deploy:** security headers/CSP, OS patching plan, secrets mechanism, app memory limit and Docker log rotation become stories.

### UX Design Requirements

**Design tokens**

UX-DR1: Light colour tokens — Implement the Lärche light palette as CSS custom properties from DESIGN.md frontmatter only (no hex outside it): background `#F5EEE2`, surface `#FFFCF6`, text `#2B2118`, muted `#665645`, primary `#76461C`, on-primary `#FFFFFF`, hot `#9A4A12`, cold-start `#2F6652`, taken `#6F6152`, error `#B42318`, on-error `#FFFFFF`, focus `#2E5C8A`, line (text 16 %), line-subtle (text 8 %), line-strong (text 55 %, ≥ 3:1), scrim (text 40 %). All text roles ≥ 4.5:1 and all control boundaries ≥ 3:1.

UX-DR2: Dark colour tokens — Implement every `-dark` twin: background `#1D1712`, surface `#2B231B`, text `#F3EADC`, muted `#BFAE97`, primary `#D9A066`, on-primary `#1D1712`, hot `#EBA265`, cold-start `#8FCBB2`, taken `#9A8B79`, error `#F59B8F`, on-error `#1D1712`, focus `#9CC3EA`, line (18 %), line-subtle (9 %), line-strong (40 %, ≥ 3:1), scrim-dark near-black `#0D0A08` at 60 % (never a light scrim over a dark page). Same contrast floors as light.

UX-DR3: Colour usage rules — `hot`/`cold-start` reserved for heat state only; `primary` only for the one main action per screen and the selected-day underline (never a state, never the active admin tab); `error` only for failures and needed action (never a cold start); `taken` identical for bookings and blocks; no gradients or tinted fills behind heat-state rows; `line` never the sole boundary of a control (use `line-strong`).

UX-DR4: Typography tokens — System sans stack only, no web fonts; implement all roles: brand 12/500/0.22em uppercase; date-heading 34/300; date-eyebrow 13/400/0.14em uppercase; strip-day 18/300; strip-weekday 11/500; slot-time 26/300; slot-time-taken 18/400; state-label 13/500/0.06em uppercase; notice 13.5/400; section-label 12/500/0.16em uppercase; field-label 13.5/500; field-error 13.5/500; name 16/400; summary-time 44/300; display 52/200 (only "Gebucht!"); body 16/300; body-sm 14/300; note 13.5/400; segment 15/300 and segment-selected 15/500; field 16/300 (prevents iOS zoom); button 16/500; switch 13/400 and switch-active 13/600. All clock times weight ≥ 300 with `tabular-nums`; meaning below 16 px at 400–500.

UX-DR5: Spacing, radius and size tokens — Scale 4·8·12·16·20·24·28 px; gutter 24, slot-gap 14, list-top 26, section-gap 20, target-min 44, field-height 48 (min), button-height 54 (min), hatch-band 12, content-max 560, admin-max 1040, detail-max 640, dialog-max 480. Radius 3 px on every row, segment group, button, badge, tag, card, dialog; 0 on date strip and field underlines; no pills, circles, soft shadows. Heights are minimums that grow with text.

UX-DR6: Elevation and border semantics — Flat layout on `background`; `surface` only for impact dialog, settings cards and focused skip link, with 1 px `line` border and no shadow. Border meanings: 2 px solid hot = hot; 2 px dashed cold-start = cold start; 1 px line + hatched left band = taken; 2 px primary bottom = selected day; 2 px text bottom = active admin tab; 2 px focus bottom = focused field; 1 px line-strong = control; 1.5 px error = call required/error.

UX-DR7: Icon set — Line icons on a 24×24 grid, round caps/joins, `currentColor`, 17 px / stroke 1.6 in rows and 20 px / stroke 2 elsewhere: flame, snowflake, lock, chevron left/right, check, mail, key, phone, sun, moon (plus an error icon). Always paired with text, `aria-hidden`.

**Components (visual spec from DESIGN.md + behaviour from EXPERIENCE.md)**

UX-DR8: App header — Brand "SAUNA LUEGISEE" left; language switch then theme switch right, each item 44×44; on every guest and admin page.

UX-DR9: Language switch — "DE | EN" as two links with accessible names "Deutsch" (`lang="de"`) / "English" (`lang="en"`), `hreflang`, `aria-current="true"` on active (switch-active type, text colour, 1.5 px underline offset 6 px; inactive muted). Switching reloads the same page in the other language, keeps the current day and form input, and stores the choice (language cookie).

UX-DR10: Theme switch — Sun/moon icon button, 44 px, two-state `<button aria-pressed>` with fixed name "Dunkles Design" / "Dark mode" (pressed in dark). First visit follows `prefers-color-scheme`; tapping switches and stores the choice in localStorage, applied before first paint (no flash); once stored there is no "follow device" option.

UX-DR11: Skip link — First focusable element on guest and admin day views: "Zu den Zeiten" / "Skip to times" (admin "Zu den Buchungen"); off-screen until focused, then top-left on surface with line-strong border; jumps past the date strip.

UX-DR12: Admin nav — Tab links under the header on every admin page: Übersicht, Buchungen, Blocks, Einstellungen, Auswertung, Abmelden (EN Overview, Bookings, Blocks, Settings, Analytics, Sign out) over a `line` baseline; active tab weight 600, text colour, 2 px text underline, `aria-current="page"`; never primary. Horizontal scroll on phones; capped at 1040 px with Abmelden far right on laptops. Übersicht carries two separate badges (phone icon + call-list count, mail icon + reply-reminder count) with hidden text "2 Anrufe offen" / "1 Antwort offen", each showing "0" when empty, never summed. Abmelden signs out at once.

UX-DR13: Date heading — One `h1` with uppercase eyebrow weekday and date ("Heute, 12. Januar" on today, else "Dienstag, 12. Januar"); 44×44 previous/next chevrons "Vorheriger Tag" / "Nächster Tag" right-aligned to the baseline, wrapping below at narrow widths, `disabled` (not hidden) at the first/last selectable day.

UX-DR14: Date strip — A `nav` of 44 px-wide day cells (weekday muted uppercase via CSS over day number) over a line-strong baseline, from today to the booking horizon (admin strip not limited by the horizon). Selected: weight 600, 2 px primary underline, `aria-current="date"`, scrolled into view. Cell name is the full date ("Mittwoch, 13. Januar"). Days outside a season are struck-through muted `<span>`s, not links. Tap updates the URL (`/day/{date}`) so Back works; horizontal scroll on phones with arrows as alternative.

UX-DR15: Start-time row — Grid `minmax(76px, max-content) 1fr auto` (time · state label + icon · chevron), notice spanning columns 2–3, padding 16/14, 3 px radius; lists every offered not-yet-passed start time in time order plus one taken row per booking or block; times in `<time datetime>`. Hot: 2 px solid hot border, flame, "SCHON HEISS"/"ALREADY HOT". Cold start: 2 px dashed cold-start border, snowflake, "KALTSTART"/"COLD START", notice gives arrival time. Taken: 1 px line border, lock, "BELEGT"/"TAKEN", taken colour, time 18/400 struck through, notice "bis 17:00"/"until 17:00", 12 px hatch only in the left band (never behind text), no chevron, not interactive, no name or reason. Free row is one link to the booking form; pressed fill line-subtle; focus ring. Kind-3-only start times show "Nur 60 Min." / "Bis 90 Min." in the notice.

UX-DR16: State badge — Heat state as a bordered tag (icon + uppercase label, 6/10 padding, 2 px solid for hot / dashed for cold start), never interactive, carrying the same notice text as the originating row; larger variant on the confirmation (button type, 10/14 padding).

UX-DR17: Heat-change line — "HEISS → KALTSTART": each state as icon + label in its heat colour, arrow muted and `aria-hidden` with hidden text "wird zu" / "becomes"; measured against the last-told notice; used in call-list entries and the impact mini row.

UX-DR18: Booking summary — Back link "‹ Di, 12. Januar" (name "Zurück zu Dienstag, 12. Januar", "‹" `aria-hidden`, 44 px hit area), chosen start time in summary-time 44/300 left and state badge right with its notice, over a hairline.

UX-DR19: Segmented control (duration) — `<fieldset>` + `<legend>` "DAUER", native radios visually hidden behind styled labels (arrow keys free), 44 px min, line-strong outline/dividers; options 60·90·120·150·180 each named with unit and end time ("90 Minuten, bis 19:30"). Selected: text fill, background text, weight 500, check icon. Unavailable durations are disabled radios, muted and struck through, with one visible note saying why ("120–180 Min. nicht möglich: nächste Buchung um 20:00.") linked via `aria-describedby`; note shows end time ("Minuten · bis 19:30"). Preselect 60 when offered, else the shortest offered duration.

UX-DR20: Segmented control (party size) — Same native-radio pattern, legend "PERSONEN", options 1–6, preselected 2.

UX-DR21: Text field — Visible `<label for>` above every input (field-label, muted, 8 px gap), never placeholder-as-label (placeholder only as example); underline only in line-strong; focus 2 px focus underline; error 2 px error underline with error-icon-prefixed message below, `aria-invalid`; purpose/note line in note type tied via `aria-describedby`. Booking form: Name (`autocomplete=name`), E-Mail (`type=email`, `autocomplete=email`, `autocapitalize=off`, `spellcheck=false`), Handy (`type=tel`, `autocomplete=tel`, accepts spaces, `+41`, `0041`, `07…`). Validate on blur only fields with content; field errors not announced live. On submit: summary at top ("2 Angaben fehlen oder stimmen nicht."), focus first invalid field, typed values kept. Name/email/mobile kept in sessionStorage for the browser session. Textarea variant (132 px min, vertical resize) for access instructions DE/EN.

UX-DR22: Primary button — Full width minus gutters, min 54 px, primary/on-primary, 1.5 px transparent border. Booking form label includes the time ("18:15 buchen"). One tap submits; while sending: label "Wird gebucht …", `aria-disabled="true"` (further taps ignored), focus stays, polite `role="status"` says "Wird gebucht …"; after ~15 s status shows "Das dauert gerade länger. Bitte warte noch, wir buchen nicht doppelt."; never claims failure while the result is unknown. Also used for sign-in and non-destructive impact-dialog confirms.

UX-DR23: Secondary button — Transparent, 1 px line-strong border, min 44 px; for safe actions ("Abbrechen", "Angerufen", "Text kopieren", "Erledigt", "Speichern"); `aria-disabled` while its request runs.

UX-DR24: Destructive button — Error fill / on-error, min 44 px; only for deletes: "Buchung löschen" at the end of booking detail (opens the impact dialog) and the confirming delete inside the dialog.

UX-DR25: Inline message — Bordered note (1.5 px currentColor, 3 px radius) with icon at the top of the content it refers to, staying until the cause is gone; error variant in error colour with error icon and `role="alert"` for form-level failures; info/confirmation in text colour with check icon and `role="status"` ("Gespeichert."). No auto-dismissing toasts.

UX-DR26: Loading line — "Lädt …" in note type, muted, in a polite status region at the top of the dimmed list after 1 s of day switching.

UX-DR27: Season notice — Replaces the start-time list outside a bookable season: date-heading with the dates and one body sentence, top hairline (copy per UX-DR52).

UX-DR28: Confirmation — Eyebrow date, "Gebucht!"/"Booked!" in display type, large state badge with the notice ("Schon heiss um 18:15." / "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein."), hairline, keybox sentence (or "Der Schlüsselcode ist schon unterwegs in dein Postfach." when past the 24-hour cutoff), details list (`dt` muted/`dd`) Wann, Personen, Absagen; link "Weitere Zeit buchen" / "Book another time". "Das hat sich gerade geändert." when the notice differs from what the form showed; revisits add "So stand es bei der Buchung. Änderungen schicken wir dir per Mail."

UX-DR29: Impact dialog — Native `<dialog>` via `showModal()` on surface with hairline and 3 px corners over scrim (scrim-dark in dark mode); bottom-anchored full width on phones, centred ≤ 480 px on laptops; scrolls inside within 90 dvh so buttons stay reachable. Order: title, "what" line, impact mini row, buttons (confirm first, "Abbrechen" secondary; stacked on phones, side by side right-aligned on laptops). Opens before booking/block delete, block save and pre-heat window save, with per-trigger copy (UX-DR56). Focus contained, background inert, Esc and scrim tap cancel, `aria-labelledby` title, `aria-describedby` consequence line, initial focus on "Abbrechen". Impact recomputed while open and on confirm; if changed, nothing happens, content is replaced with "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." and focus moves to the title. On close focus returns to the trigger; after successful delete to the page `h1`.

UX-DR30: Impact mini row — Hairline box: affected guest name and time ("Tom, 17:15:") in name type plus the heat-change line; consequence in notice type ("bekommt eine Mail." or "weniger als 24 h." + *Anruf nötig* marker), then "Neuer Hinweis: komm zwischen 16:35 und 16:45."; without an affected booking: "Kein Effekt auf andere Buchungen."

UX-DR31: Call list entry — List item with `h3` ("17:15 · Tom Brunner"): marker (*Anruf nötig* 1.5 px error border and text / *optional* line-strong border, muted text — always text); time in slot-time and name with muted date line ("Heute, Di 12. Januar"); heat-change line; "NEUER HINWEIS" over the notice to give; "zuletzt gesagt: …" muted; reason when from a refused email ("Schlüsselmail abgelehnt" / "Warnmail abgelehnt", keybox entries show the code); `tel:` link (phone icon, number as text, 44 px) and secondary "Angerufen", wrapping on narrow screens. Order: *Anruf nötig* first, then start time. Angerufen refused on stale notice → entry re-renders with new notice and focus moves to the refusal message inside it. After removal focus moves to the next entry's heading or the "Anrufliste" heading, polite status "Tom angerufen. Anrufliste: 0."

UX-DR32: Reply reminder — Dashed line-strong box with guest name, "Di 12. Januar, 16:00–17:00 · gelöscht" muted, email as text and `mailto:` link (mail icon) with subject and body prefilled in the booking's language, secondary "Text kopieren" (copies address, subject, body) and "Erledigt" (removes for all admins). Shown right after a deletion and on admin home until done. After removal focus moves to the next reminder's heading or the "Antworten" heading, polite status "Erledigt. Antworten: 0."

UX-DR33: Count badge — Number in a 1.5 px text box (min 24 px, tabular-nums) next to the "Anrufliste" and "Antworten" headings; zero shows "0"; changes announced via the call/reminder status.

UX-DR34: Change tag — Text-only uppercase tag in a 1 px text box: "HINWEIS GEÄNDERT" (current notice ≠ last-told) and "ALTER CODE 4711"; read as part of the row; never colour.

UX-DR35: Sub-group label — `h3` uppercase muted section-label above each day's rows in "Nächste Buchungen": "Heute · Di 12. Januar", "Morgen · Mi 13. Januar"; first has no top margin.

UX-DR36: Admin booking row — Grid `1fr auto 20px`, min 44 px, hairline between rows: time range + heat state (icon + label) on line 1; "Tom Brunner · 2 Personen" plus change tag on line 2; muted "Code 4711" after the keybox email went out, or "Alter Code 4711" tag if not the current code; chevron spanning both lines; tap opens booking detail.

UX-DR37: Admin day table (≥ 1024 px) — Columns time · name · party · email · mobile · notice · last-told notice · keybox code sent, `<th scope="col">` in section label, hairline rows, whole row links to booking detail.

UX-DR38: Booking detail — Capped at 640 px on laptops; back link "‹ DI, 12. JANUAR" (brand type, 44 px), eyebrow "DIENSTAG, 12. JANUAR", heading the time range; definition list Name, E-Mail, Handy, Personen, Dauer, Schlüsselmail (status "verschickt Mo 16:00 · Code 4711" / "geplant Fr 17:15" / "abgelehnt: {Grund}"); "Hinweis jetzt" and "Zuletzt gesagt" side by side with state label + icon + notice and the change tag if they differ; refused non-urgent emails listed; after a rule, destructive "Buchung löschen" (full width phones, auto width laptops) only for future bookings, else "Hat schon begonnen."

UX-DR39: Sign-in form — Centred 560 px column: hidden `username` field ("admin") for password managers, one visible password field (`autocomplete=current-password`, paste allowed), primary sign-in button; after success go to admin home or the requested page; wrong password message; after rate limiting the message plus button disabled until the minute is over.

UX-DR40: Block form — `/admin/blocks/new`: date, start time, end time (5-minute steps), reason as segmented control (Reinigung · Wartung · Privat); "Prüfen" opens the impact dialog ("Block speichern?"); overlaps and blocks inside a changeover refused with conflicting bookings listed. Blocks list shows upcoming blocks with delete (via impact dialog) and "Neuer Block".

UX-DR41: Settings card — One surface card per group with section-label heading, fields, notes and its own secondary "Speichern"; paired values in two columns inside the card; cards stacked with 20 px gap on phones, two columns up to 1040 px on laptops. Cards: Saison (Beginn · Ende), Betriebszeiten (Von · Bis), Wechselzeit (Minuten; "Gilt nur für neue Buchungen."), Buchungshorizont (Tage), Vorheizzeit (Kürzeste/Längste Zeit (Minuten)), Schlüsselbox-Code (Code; "Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben."), Anleitung DE/EN (textareas), Kontaktadresse (E-Mail), Passwort (Neues Passwort; "Alle anderen Admins werden abgemeldet."). Out-of-range values refused inline with value kept and focus to first error; pre-heat save goes through the impact dialog; shortening season/hours lists flagged bookings; success "Gespeichert." inside the card; after a keybox code change the card lists upcoming bookings whose keybox email carried the old code, each linking to booking detail, shrinking as they pass.

UX-DR42: Analytics panel (can follow) — One panel per question (FR-22–FR-25): question as heading in slot-time, one-line reading in body, bars as text-colour blocks with values printed beside them (`aria-hidden`) backed by a real table; cold-start figures in cold-start colour + snowflake, hot in hot colour + flame; season selector at top; panels side by side ≥ 1024 px; empty "Noch keine Daten für diese Saison." Panel questions: "Wann sollen wir putzen?", "Wie viel Holz verbrennen wir?" (labelled "Schätzung der angezündeten Feuer"), "Lohnt sich das?", "Bleiben Zeiten leer, weil sie Kaltstarts sind?".

UX-DR43: Footer — Muted links So funktioniert's · Datenschutz · Impressum · admin contact (`mailto:`), stacked vertically on phones, each 44 px high; on every guest page.

UX-DR44: Focus ring — 3 px focus-colour outline at 2 px offset on every interactive element (fields use the 2 px focus underline); never removed.

**Information architecture (surfaces and routes)**

UX-DR45: Guest routes — Calendar day view `/` (today) and `/day/{yyyy-mm-dd}`; booking form `/book/{date}/{hhmm}`; confirmation `/booked/{publicId}` (no guest data in URL); `/info`; `/privacy`; `/imprint`. Every guest page has app header and footer; every step has a URL and Back works between day, form and confirmation; a resubmitted form never creates a second booking. Unique `<title>` per route ("Di, 12. Januar · Sauna Luegisee", "18:00 buchen · Sauna Luegisee", "Gebucht · Sauna Luegisee").

UX-DR46: Admin routes — `/admin/login`, `/admin` (home: call list with count, reply reminders with count, next bookings today + tomorrow, flags for out-of-season/hours bookings and refused non-urgent emails, worker heartbeat warning), `/admin/day/{date}`, `/admin/booking/{id}`, `/admin/blocks`, `/admin/blocks/new`, `/admin/settings`, `/admin/analytics`. No public link to admin; every admin page has the admin nav; admin home `h1` "Übersicht" with `h2` "Anrufliste" / "Antworten" / "Nächste Buchungen".

UX-DR47: "So funktioniert's" page (`/info`) — DE/EN page reached from footer and confirmation covering location, how heating works (hot vs cold start, lighting the fire), the keybox, how to cancel (by email to the admins) and contact.

UX-DR48: Privacy statement page (`/privacy`) — DE/EN, reached from footer and booking form; operator contact, field purposes, 30-day retention after season end, no tracking (operator-authored text).

UX-DR49: Impressum (`/imprint`) — DE/EN legal operator details, reached from footer.

**Voice and microcopy**

UX-DR50: Voice rules — All copy in `messages/` DE and EN; German informal *du*, Swiss spelling (*heiss*); English same voice, not literal; every notice gives a clock time and never hedges; vocabulary *Zeit*, *Buchung*, *belegt* (never "Slot", "Reservation", "Status: confirmed"); at most one exclamation ("Gebucht!"), no emoji or marketing; no temperature claims or "probably warm" wording.

UX-DR51: Heat-state message catalogue — Hot "Ofen läuft. Komm um 18:15." / "The stove's going. Come at 18:15."; cold start "Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein." / "Nobody before you: …"; too little time "Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf."; arrival past "Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss."; taken "bis 17:00"; limited durations "Nur 60 Min. · …" / "Bis 90 Min. · …"; confirmation badge "Schon heiss um 18:15." / "Kaltstart: komm zwischen … und heiz ein."; with EN equivalents.

UX-DR52: Date formats and season/empty-state copy — Full "Dienstag, 12. Januar" / "Tuesday, 12 January", short "Di 12. Januar" / "Tue 12 January", admin "Heute, Di 12. Januar" / "Morgen, …". Before season, booking-open-not-started, after season / no season, day fully taken, today all past, day-switch status ("Dienstag, 13. Januar: 4 freie Zeiten"), admin empty states (call list, reminders, no bookings on day, no blocks) exactly per EXPERIENCE.md tables, DE and EN.

UX-DR53: Error and refusal copy — Invalid email, invalid mobile, submit summary, conflict on submit ("18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da."), start time began, network failure, submit slow, admin wrong password, rate limited, mark-called refused, action failed, already done / booking gone, impact changed, block overlaps bookings (listing them), block inside changeover — exactly per EXPERIENCE.md, DE and EN.

UX-DR54: Field labels and purpose lines (FR-9) — Name "Damit wir die Buchung an der Sauna zuordnen können.", E-Mail "Für die Bestätigung und den Schlüsselcode.", Handy "Nur falls wir dich kurzfristig anrufen müssen.", then "Mehr dazu im Datenschutz." link; section labels DAUER/PERSONEN/KONTAKT; EN equivalents.

UX-DR55: Admin strings — Nav labels, badge hidden text, home headings, call-list markers and entry strings, call/reminder statuses, booking-row tags, booking-detail terms, keybox email status, "Hat schon begonnen.", impact consequences and new-notice line, heat-change hidden text, flagged-bookings line, "Gespeichert.", "Bitte melde dich wieder an.", analytics empty — per EXPERIENCE.md Admin strings, DE and EN.

UX-DR56: Impact dialog copy per trigger — Delete booking "Buchung löschen?" · "Anna Meier · Di 12. Januar, 16:00–17:00" · destructive "Buchung löschen"; delete block "Block löschen?" · "Reinigung · Mo 11. Januar, 09:00–11:00" · destructive; save block "Block speichern?" · primary; save pre-heat "Vorheizzeit ändern?" · "30–40 → 40–50 Minuten · {n} Buchungen bekommen eine neue Ankunftszeit" · primary "Speichern"; cancel always "Abbrechen" / "Cancel".

UX-DR57: Settings labels, notes and validation copy — Card headings/labels/notes DE+EN per EXPERIENCE.md; old-code list line ("3 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:"); validation messages for pre-heat swapped, pre-heat out of range, changeover out of range, horizon out of range, season end before start, hours "Bis" before "Von", empty required field, invalid contact address.

**Emails**

UX-DR58: Email format — `multipart/alternative` with a complete `text/plain` part in the same content and order as HTML; HTML root has `lang`, `Content-Language` header matches the booking language, `<meta name="color-scheme" content="light dark">`; no wrapper background colours, and wherever a colour is set text and background are set together (no dark-on-dark under client inversion); no images or tracking pixels; keybox code as real text in a heading with spaced digits ("Code: 4 7 1 1"); admin contact as `mailto:`, phone as `tel:+41…`; clock times and dates only; signed "Sauna Luegisee".

UX-DR59: Email content and subjects — Confirmation ("Gebucht: Sauna Luegisee, Di 12. Januar, 18:00"; notice, "Ändert sich das, sagen wir dir Bescheid.", keybox date/time, "Absagen: schreib an {admin contact}"); keybox email ("Schlüsselcode für Di 12. Januar, 18:00"; code first, then current notice marked authoritative, then DE/EN instructions from settings); heat change good news ("Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss"); urgent hot → cold ("Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00"); later earliest arrival and earlier latest arrival ("Wichtig: neue Ankunftszeit für …") with their key lines; prefilled reply to cancelled guest ("Deine Sauna-Buchung ist gelöscht" + body) — DE and EN, every subject with weekday, date and time.

**State patterns**

UX-DR60: Day view load and day switching — Server-rendered day on first paint, usable in 3 s on 4G, no skeletons; on switch the list stays dimmed with `aria-busy="true"`, strip selection moves at once, "Lädt …" after 1 s in a polite status, on arrival status reads the day + free count (or empty line) and `document.title` updates.

UX-DR61: Season states — Before booking opens: season notice with season and booking-open dates, no date strip; booking open but season not begun: land on first season day with note above the strip, earlier strip days struck through; after season (or no season set): after-season notice, no strip, footer remains; a next season set by admin switches to the before-season state.

UX-DR62: Empty day states — Day fully taken / today all past: taken rows stay visible with a one-line empty message above them; past start times not shown.

UX-DR63: Booking conflict and stale states — Conflict on submit and start-time-passed: return to the refreshed day with the error message first in `main` (`tabindex="-1"`, focused on load), `<title>` prefixed "Fehler: ", taken time shown taken, new offers with their own heat state, contact details kept and prefilled on the next form. Stale form opened (taken or past at load): go straight to the day with the matching message.

UX-DR64: Submit failure and slowness — Network failure: inline error at top (focused, "Fehler: " title prefix), all input kept, button re-enabled, nothing booked. Slow (~15 s): "dauert gerade länger" status; idempotent submit prevents double booking.

UX-DR65: Heat edge states — Too little time to heat and arrival-time-past show their cold-start notices on row, form, confirmation and emails, remain bookable and never look like errors; heat state changed while on form → confirmation shows the notice at booking plus "Das hat sich gerade geändert."

UX-DR66: Admin states — Failed send (FR-14) → *Anruf nötig* entry with reason, other refusals on booking detail and as an admin-home flag (guests see nothing); flagged bookings line with links after season/hours shortening; old keybox code tags and list; admin action failed → inline error at the item, focus to it, item unchanged; done by another admin → refresh with "Schon erledigt." or "Diese Buchung gibt es nicht mehr." + link back; empty call list/reminders stay visible with "0" and the empty line; blocks list empty with "Neuer Block"; session ended → redirect to sign-in with "Bitte melde dich wieder an." and return after sign-in; rate-limited sign-in; past booking without delete; analytics without data.

UX-DR67: Interaction primitives — Tap to act only (no long-press, swipe-only or hover-only affordances); horizontal scroll only on date strip and admin nav on phones; native `tel:`/`mailto:` handoffs with number/address also shown as text; destructive actions always via impact dialog, no undo; full keyboard operation on admin laptop (Tab = reading order, Enter submits, Esc closes dialog, no custom shortcuts); motion ≤ 150 ms fades, none under reduced motion; banned: guest cancel/change buttons, colour-only states, auto-dismissing toasts, carousels, pull-to-refresh, captchas, consent/cookie banners, modal stacks deeper than one.

**Accessibility floor (WCAG 2.2 AA)**

UX-DR68: Reflow and one-hand use — Every guest flow works one-handed at 360 px with the primary button at the end of the form in scroll order; no horizontal page scrolling; works at 320 CSS px, 200 % text and WCAG text-spacing overrides without loss of content.

UX-DR69: Target sizes — Every interactive element ≥ 44 px (strip days, segments, language items, theme switch, arrows, admin tabs, `tel:` links); standalone links (back link, footer links, "Weitere Zeit buchen", reminder `mailto:`) with a 44 px hit area; adjacent targets ≥ 8 px apart; inline links in running text ≥ 24 px high.

UX-DR70: Screen-reader heat states — Icons `aria-hidden`; each free row is one link whose accessible name reads time, state and notice ("18:15, schon heiss. Ofen läuft, komm um 18:15. Buchen."); taken rows read "16:00 bis 17:00, belegt"; hot/cold never carried by border style or colour alone (icon + border style + label + colour, four ways).

UX-DR71: Landmarks, headings, titles, forms — One `h1` per page, unique `<title>` per route, date strip `nav` with `aria-current="date"`; persistent visible labels, `aria-describedby` purpose/error lines, `aria-invalid`, focus to first error on submit, segmented controls as native radios in a `fieldset`.

UX-DR72: Focus management and live regions — Native dialog focus containment and return to trigger with content scrolling at 200 % text; when an entry disappears focus moves to the next item or the section heading, never the page start; form-level errors `role="alert"`, field errors not live; day switches, busy states and count changes via polite `role="status"`; focus always visible.

UX-DR73: Forced colours and reduced motion — Under `forced-colors: active`: filled buttons keep their transparent 1.5 px border, selected segment uses `SelectedItem`/`SelectedItemText` plus the check icon, heat-state borders are real CSS borders (never shadows), icons `currentColor`, disabled days/segments `GrayText`, taken still reads via lock, label and struck time if the hatch vanishes. Under `prefers-reduced-motion`: no transitions and the date strip jumps instead of smooth-scrolling.

UX-DR74: Language attributes — `<html lang="de-CH">` or `lang="en"` per active language; any German string left in English mode (admin fallback) wrapped in `lang="de"`; emails set `lang` and `Content-Language`.

**Responsive and theme**

UX-DR75: Responsive breakpoints — Breakpoints 600 px and 1024 px. < 600: single column with 24 px gutters, strip and admin nav scroll, admin home stacks call list → reminders → next bookings, booking detail stacked, settings cards stacked, impact dialog bottom-anchored with stacked buttons. 600–1023: guest column capped at 560 px centred, strip shows all days when they fit; admin single column with wider rows. ≥ 1024: guest same capped column; admin two columns up to 1040 px (call list + reminders left, next bookings right), settings in two columns, bookings by day as admin day table, booking detail ≤ 640 px, impact dialog centred with side-by-side buttons, analytics panels side by side. Targets current iOS Safari, Android Chrome and current desktop browsers; no PWA or offline mode.

UX-DR76: Dark-mode behaviour — Light and dark from the same token roles; dark follows `prefers-color-scheme` until the theme switch stores an explicit choice, which then always wins (applied before first paint from localStorage); dark scrim in dark mode; contrast floors hold in both modes.

### FR Coverage Map

FR-1: Epic 1 - Browse availability within season and horizon
FR-2: Epic 1 - Heat state on every free start time
FR-3: Epic 1 - Arrival time on cold starts
FR-4: Epic 1 - Start times (three kinds, operating hours, changeover)
FR-5: Epic 1 - Make a booking
FR-6: Epic 1 - No double booking
FR-7: Epic 1 - Notice at booking
FR-8: Epic 1 - Booking window
FR-9: Epic 1 - Privacy information on the form
FR-10: Epic 2 - Confirmation email
FR-11: Epic 2 - Keybox email
FR-12: Epic 2 - Heat-change email
FR-13: Epic 3 - Heat changes after the keybox email go to the call list
FR-14: Epic 2 - Failed sends recorded (surfaced on the call list in Epic 3)
FR-15: Epic 3 - Shared admin sign-in
FR-16: Epic 3 - Booking list
FR-17: Epic 3 - Create a block
FR-18: Epic 3 - Delete a booking or block
FR-19: Epic 3 - Blocks never heat
FR-20: Epic 3 - Settings (incl. seasons, keybox code rotation)
FR-21: Epic 3 - Call list
FR-22: Epic 6 - When should we clean?
FR-23: Epic 6 - How much wood are we burning?
FR-24: Epic 6 - Is this worth repeating?
FR-25: Epic 6 - Are empty start times empty because they are cold starts?
FR-26: Epic 1 - German default, English alongside
FR-27: Epic 2 - Language per booking for emails
FR-28: Epic 4 - Retention and purge
FR-29: Epic 1 - Privacy statement page
FR-30: Epic 4 - Analytics record from the first booking
FR-31: Epic 3 - Reminder to answer a cancelled guest

### Copy not yet in the UX catalogue

The stories below need these strings, but EXPERIENCE.md does not define them yet. Each one must exist in `messages/` in DE and EN and follow the voice rules (NFR-10, UX-DR50): informal *du*, Swiss spelling (*heiss*, never *heiß*), the same voice in English rather than a literal translation, clock times instead of durations, no hedging. Every string with a count `{n}` needs singular and plural variants (Paraglide variants). Ideally they are added to the EXPERIENCE.md catalogue before the listed story starts. If they are not, the dev agent drafts them under these rules and flags them for operator review. Stories point to this section instead of inventing wording.

**Guest pages**

| # | Needed by | Strings (DE and EN unless noted) |
| --- | --- | --- |
| 1 | 1.4, 1.7, 1.8, 1.9 | EN `<title>` patterns: "Tue, 12 January · Sauna Luegisee", "Book 18:00 · Sauna Luegisee", "Booked · Sauna Luegisee"; EN titles for `/info`, `/privacy`, `/imprint`; EN error title prefix for "Fehler: " |
| 2 | 1.2, 1.9 | EN footer link labels for So funktioniert's · Datenschutz · Impressum |
| 3 | 1.5 | EN "Vorheriger Tag" / "Nächster Tag"; EN "Lädt …"; the "Heute" / "Today" strip link (copy and placement, 44 px target), which UX does not specify yet |
| 4 | 1.5 | Singular day-switch status ("1 freie Zeit" / "1 free time") |
| 5 | 1.4, 1.6 | EN screen-reader names for rows ("16:00 to 17:00, taken", "18:15, already hot. … Book.") |
| 6 | 1.7 | EN "Wird gebucht …" and the EN slow-submit status |
| 7 | 1.7 | EN duration option names ("90 minutes, until 19:30"); EN unavailable note ("120–180 min not possible: next booking at 20:00."); DE/EN variants of that note when a block or the end of operating hours is the reason |
| 8 | 1.7 | Singular submit summary ("1 Angabe fehlt oder stimmt nicht.") |
| 9 | 1.7 | EN back link and its accessible name ("Back to Tuesday, 12 January") |
| 10 | 1.8 | EN for "Das hat sich gerade geändert.", "So stand es bei der Buchung. Änderungen schicken wir dir per Mail." and "Der Schlüsselcode ist schon unterwegs in dein Postfach." |
| 11 | 1.8 | On-screen keybox sentence ("Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00." or similar); EN details terms for Wann · Personen · Absagen; EN "Absagen: schreib an …" |
| 12 | 1.7, 1.8 | Guest 404 page for an unknown `/booked/{id}`: heading and one line |

**Emails**

| # | Needed by | Strings (DE and EN unless noted) |
| --- | --- | --- |
| 13 | 2.1, 2.2, 2.3, 3.4 | EN body key lines for every email (the catalogue has EN subjects only): confirmation, keybox, good news, urgent hot → cold start, later earliest arrival, earlier latest arrival, and the prepared reply ("Hello Lena, …") |
| 14 | 2.1 | Confirmation variant when booked past the 24-hour cutoff ("the code follows in a moment") |
| 15 | 2.1 | Email detail labels: date, start, duration, party size |
| 16 | 2.2 | Keybox email: the marker that the current notice is the one that counts, and the instructions heading |
| 17 | 2.3 | Urgent later-earliest body with a collapsed range ("Nur 15 Minuten zum Einheizen: komm um 17:45 …") |

**Admin pages**

| # | Needed by | Strings (DE and EN unless noted) |
| --- | --- | --- |
| 18 | 3.1 | Sign-in page `h1` and `<title>`, password field label, button label ("Anmelden") |
| 19 | 3.1–3.8, 5.5, 6.1 | `<title>` for every admin route |
| 20 | 3.1 | Worker heartbeat warning with time ("Der Versand läuft seit {Zeit} nicht.") |
| 21 | 3.1 | Singular and plural badge hidden texts ("1 Anruf offen", "2 Antworten offen") |
| 22 | 3.2 | EN skip link "Skip to bookings" |
| 23 | 3.2 | Booking row party size in EN and singular ("1 Person" / "1 person", "2 people") |
| 24 | 3.2 | Schlüsselmail status for `in_flight`, `transient_failure` (retrying), `expired` and `cancelled` (the catalogue has sent, planned and refused only) |
| 25 | 3.2 | Label for refused non-urgent emails on booking detail (e.g. "Bestätigung abgelehnt: {Grund}") and the admin-home flag line for them |
| 26 | 3.2 | Out-of-season / out-of-hours flag text on the row, on detail and on out-of-season days appended to the admin strip; singular "1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig." (also 3.7, 3.8) |
| 27 | 3.2 | Admin not-found pages (unknown booking id, day not in any season and without bookings or blocks) |
| 28 | 3.3, 3.5, 3.7 | EN impact-dialog titles, what lines and confirm buttons ("Delete booking?", "Delete block?", "Save block?", "Change pre-heat window?", "Delete booking", "Save") |
| 29 | 3.4 | "Text kopieren" success status (e.g. "Kopiert.") and the no-clipboard fallback hint |
| 30 | 3.5 | Block form labels (date, from, to, reason legend); EN reason labels (Cleaning · Maintenance · Private use); EN "Neuer Block" / "Prüfen" |
| 31 | 3.5 | Block validation: end not after start, not on a 5-minute step, start already passed |
| 32 | 3.5 | Blocks list row format |
| 33 | 3.5, 3.7 | Singular "Dieser Block überschneidet 1 Buchung …" and "1 Buchung bekommt eine neue Ankunftszeit" |
| 34 | 3.6 | Call-list reasons for an expired keybox email, an overdue keybox email (still retrying, or held back because the keybox code or instructions are empty) and an expired urgent heat-change email; the keybox "code to give" line ("Code durchgeben: 4711") |
| 35 | 3.8 | EN "Nächste Saison anlegen"; season overlap error; read-only ended-season label; grouped old-code list heading after a second code change |
| 36 | 4.2 | Placeholder for purged contact fields ("gelöscht" / "deleted") |
| 37 | 5.5 | Readiness warning on admin home: heading and one line per item (keybox code missing, instructions DE/EN missing, contact address missing or placeholder, operator texts still placeholders, season dates or operating hours not confirmed, admin password not set, production env value missing) |
| 38 | 6.1, 6.2 | Readings ("Am meisten los: Samstag ab 17 Uhr.", the FR-24 reading); week label "ab Mo 4. Januar"; "not enough data for a comparison" line; season selector label; figure and table headers (bookings, booked hours, unique guests, repeat share, empty share, hot / cold start unbooked / booked) |

## Epic List

### Epic 1: Guests see the calendar and book
Guests open sauna-luegisee.ch on a phone, see the coming days with hot / cold start and arrival times for every free start time, and book the whole wagon in German or English, in light or dark mode. Includes project scaffold, the pure core, the time module, seeded default settings, and the info, privacy and Impressum pages.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-26, FR-29
**NFRs mainly addressed:** NFR-1, NFR-2, NFR-3, NFR-8, NFR-10

### Epic 2: Guests are kept informed by email
Every booking gets a confirmation; the keybox email arrives at the 24-hour cutoff with the authoritative notice; heat changes are emailed after the settle delay, in the booking's language. Includes the transactional outbox, the in-process worker with heartbeat, and Infomaniak SMTP delivery with refused sends recorded.
**FRs covered:** FR-10, FR-11, FR-12, FR-14, FR-27
**NFRs mainly addressed:** NFR-4, NFR-5, NFR-9

### Epic 3: Operators run the wagon from the admin portal
Admins sign in with the shared password, see bookings by day, create and delete blocks, delete bookings with an impact preview, manage settings incl. seasons and keybox code rotation, work the call list and reply reminders, and see a warning when the worker stops.
**FRs covered:** FR-13, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-31
**NFRs mainly addressed:** NFR-7

### Epic 4: Guest data is protected and the season is recorded
From the first booking an anonymous analytics record is kept; personal data is purged automatically 30 days after the season ends.
**FRs covered:** FR-28, FR-30

### Epic 5: Sauna Luegisee goes live on sauna-luegisee.ch
The app runs on its own Infomaniak VPS behind Caddy with HTTPS, is built on the box safely, is backed up nightly to Swiss Backup with a tested restore, is hardened for months of idle time, and opens to guests only after a clean launch readiness check.
**FRs covered:** none directly (enables all); **NFRs mainly addressed:** NFR-5, NFR-6, NFR-7, NFR-9

### Epic 6: Operators see the season analytics
The four April questions as admin views over the analytics records. May ship during the season.
**FRs covered:** FR-22, FR-23, FR-24, FR-25

Launch scope (mid-December 2026): Epics 1-5. Epic 6 follows during the season.

## Epic 1: Guests see the calendar and book

Guests open sauna-luegisee.ch on a phone, see the coming days with hot / cold start and arrival times for every free start time, and book the whole wagon in German or English, in light or dark mode. The epic lays the project scaffold, the page shell, the time module and the pure core (start times, heat state, arrival time, notice), seeds the default settings, and ships the info, privacy and Impressum pages. At the end of the epic a guest can find a time, book it without an account and see the notice they were given; emails follow in Epic 2.

### Story 1.1: Project scaffold

As a guest,
I want sauna-luegisee.ch to be built on a running, testable app that already answers at `/`,
So that every page I will use later rests on a base that is checked from the first day.

**Acceptance Criteria:**

**Given** an empty repository
**When** the project is scaffolded
**Then** it is created with `sv create` (SvelteKit 3.1.1, Svelte 5.57.3, TypeScript 6.0.3, Vite 8.3.6, `@sveltejs/vite-plugin-svelte` 7.3.1), `sv add paraglide` with `@inlang/paraglide-js` 2.29.3 (locales `de` base and `en`, strategy cookie → preferredLanguage → base locale, no URL prefixes), `@sveltejs/adapter-node` 6.0.1, Drizzle ORM 0.45.4 + drizzle-kit 0.31.11 on better-sqlite3 13.0.3, Vitest 4.1.12 and svelte-check 4.7.8, with the committed lockfile
**And** the Node version is pinned for development to 26.13.0 (`.nvmrc` and `engines` in `package.json`)
**And** the source tree follows the Structural Seed: `src/lib/{domain,time,schemas,paraglide,server/{env.ts,db,db/queries,commands,worker,mail}}`, `src/routes/(guest)`, `src/routes/admin`, `messages/de.json`, `messages/en.json`
**And** imports use `#lib/…` with explicit extensions, `$app/state` (never `$app/stores`), hook types from `@sveltejs/kit/hooks`, and `kit.paths.origin = 'https://sauna-luegisee.ch'`

**Given** the scaffolded project
**When** the database connection module is opened
**Then** better-sqlite3 opens the file at `DATABASE_PATH` in WAL mode with a busy timeout set
**And** `DATABASE_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and `GUEST_KEY_SECRET` are read only in `src/lib/server/env.ts`, which fails fast with a clear message when a variable needed at runtime is missing

**Given** the app needs to tell production from development
**When** `src/lib/server/env.ts` decides which variables are required
**Then** production means `NODE_ENV=production` (set in the Dockerfile in Epic 5); in production every variable above is required; in development `SMTP_*` and `MAIL_FROM` are optional and the mail transport is always the local sink, even if production-like SMTP values are present
**And** a committed `.env.example` lists every variable with a dev-only `GUEST_KEY_SECRET` value (marked as never for production) and no SMTP values, so `npm run dev` and `npm test` work after copying it; tests inject their own secret
**And** this rule is recorded in the README "Scaffold decisions"

**Given** the ESLint config in `eslint.config.js`
**When** `npm run lint` runs
**Then** `no-restricted-imports` (or equivalent) rules enforce the AD-1/AD-2 layer table: `src/lib/domain` imports only `src/lib/time`; `src/lib/time` and `src/lib/schemas` import nothing from the app; the db connection and schema are importable only by `src/lib/server/commands` and `src/lib/server/db/queries`; routes import commands for writes and `db/queries` for reads, never the db directly
**And** `Date.now`, `new Date()` and `process.env` are banned in `src/lib/domain` and `src/lib/time`
**And** a deliberately violating fixture import makes lint fail (verified once, then removed)

**Given** the four scaffold-time choices
**When** this story is done
**Then** each is decided and recorded with its reason in the repository README section "Scaffold decisions": (1) instants are stored and passed as UTC ISO 8601 text with seconds and `Z` (e.g. `2027-01-12T17:00:00Z`), used everywhere including the notice JSON; (2) Valibot is the validation schema library for `src/lib/schemas`; (3) the first admin password is set by a one-off CLI command (`npm run set-admin-password`, reads the password from stdin, stores only an argon2 hash) so no extra env variable is needed; the command and the hash column are built in Story 3.1; (4) migrations are generated with `drizzle-kit generate`, committed as SQL under `src/lib/server/db/migrations`, and applied by the app at boot before it serves requests
**And** `npm run dev` applies migrations on boot against a local SQLite file

**Given** the scaffolded app
**When** `npm run dev` starts and a browser opens `/`
**Then** a placeholder page from `src/routes/(guest)` is served with its text from `messages/`
**And** `npm test` runs Vitest with at least one passing test, and `npm run check` (svelte-check) and `npm run lint` pass

**Covers:** AD-1, AD-2, AD-14, AD-18 (WAL), NFR-8, Additional: starter template, pinned stack, layering rules, scaffold decisions

### Story 1.2: Page shell with DE/EN and light/dark

As a guest,
I want to open sauna-luegisee.ch and get a calm, readable page in my language and in light or dark mode,
So that I can trust the site and read it on the shore in glare or in the dark.

**Acceptance Criteria:**

**Given** DESIGN.md frontmatter
**When** the global stylesheet is built
**Then** every light colour token (background `#F5EEE2`, surface `#FFFCF6`, text `#2B2118`, muted `#665645`, primary `#76461C`, on-primary `#FFFFFF`, hot `#9A4A12`, cold-start `#2F6652`, taken `#6F6152`, error `#B42318`, on-error `#FFFFFF`, focus `#2E5C8A`, line 16 %, line-subtle 8 %, line-strong 55 %, scrim 40 % of text) and every dark twin (background `#1D1712`, surface `#2B231B`, text `#F3EADC`, muted `#BFAE97`, primary `#D9A066`, on-primary `#1D1712`, hot `#EBA265`, cold-start `#8FCBB2`, taken `#9A8B79`, error `#F59B8F`, on-error `#1D1712`, focus `#9CC3EA`, line 18 %, line-subtle 9 %, line-strong 40 %, scrim `#0D0A08` at 60 %) exists as a CSS custom property, and no hex value appears outside the token file
**And** typography roles (system sans stack, no web fonts; brand 12/500/0.22em uppercase through display 52/200 as listed in UX-DR4; clock times weight ≥ 300 with `tabular-nums`; meaningful text below 16 px at weight 400–500), spacing (4·8·12·16·20·24·28, gutter 24, target-min 44, field-height 48, button-height 54, content-max 560), radius 3 px (0 on the date strip and field underlines, no pills, no shadows) and the border semantics of UX-DR6 are tokens
**And** a contrast check documented in the README shows every text role ≥ 4.5:1 and every control boundary (line-strong) ≥ 3:1 against background and surface in both modes

**Given** any guest page
**When** it renders
**Then** the app header shows the brand "SAUNA LUEGISEE" on the left and the language switch then the theme switch on the right, each target 44×44
**And** the line icon set (flame, snowflake, lock, chevron left/right, check, mail, key, phone, sun, moon, error) exists as 24×24 `currentColor` components with round caps and joins, 17 px / stroke 1.6 in rows and 20 px / stroke 2 elsewhere, always `aria-hidden` and paired with text

**Given** a first visit without a language cookie and a browser preferring English
**When** the page loads
**Then** the page is in English with `<html lang="en">`; with a German or any other preference it is German with `<html lang="de-CH">`
**And** the language switch shows "DE | EN" as two links named "Deutsch" (`lang="de"`) and "English" (`lang="en"`) with `hreflang`, the active one with `aria-current="true"`, switch-active type, text colour and a 1.5 px underline offset 6 px, the inactive one muted

**Given** a guest on any guest page
**When** they tap the other language
**Then** the same URL reloads in that language, the language cookie (the only guest cookie, essential, no banner) stores the choice, and later visits on that device open in it
**And** no other cookie is set for guests

**Given** a first visit with no stored theme
**When** the page loads
**Then** the theme follows `prefers-color-scheme`
**And** the theme switch is a 44 px `<button aria-pressed>` with the fixed name "Dunkles Design" / "Dark mode", pressed in dark, showing moon in light and sun in dark

**Given** a guest taps the theme switch
**When** they reload or come back later
**Then** the stored choice in `localStorage` (the only localStorage key) wins over the device setting, applied by an inline script in `<head>` before first paint so there is no flash, and there is no "follow device" option afterwards

**Given** any guest page
**When** it renders
**Then** a skip link "Zu den Zeiten" / "Skip to times" is the first focusable element, off-screen until focused, then shown top-left on surface with a line-strong border, and moves focus to the start of `main`
**And** the footer shows So funktioniert's · Datenschutz · Impressum as muted links (EN labels per "Copy not yet in the UX catalogue"), stacked on phones with each link 44 px high, linking to `/info`, `/privacy`, `/imprint`, which exist as minimal stub pages (header, footer, one `h1`, unique `<title>`) so no footer link is broken; Story 1.9 fills them

**Given** the home page `/`
**When** it renders before the calendar exists
**Then** it has one `h1`, a unique `<title>` ending in "· Sauna Luegisee", a `main` landmark, the header and the footer, and all text comes from `messages/` in DE (informal *du*, Swiss spelling) and EN

**Given** any interactive element
**When** it receives keyboard focus
**Then** a 3 px focus-colour outline at 2 px offset is visible (fields: 2 px focus underline) and is never removed
**And** under `forced-colors: active` icons stay `currentColor` and borders are real CSS borders; under `prefers-reduced-motion` no transitions run; all motion elsewhere is ≤ 150 ms fades

**Given** the page at 320 CSS px width, 200 % text and WCAG text-spacing overrides
**When** it is viewed
**Then** nothing is cut off and there is no horizontal page scrolling; at 600 px and above the guest column is capped at 560 px and centred
**And** no third-party scripts, fonts, analytics or pixels are loaded

**Covers:** FR-26, NFR-1, NFR-8, NFR-10, UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR7, UX-DR8, UX-DR9, UX-DR10, UX-DR11, UX-DR43, UX-DR44, UX-DR45, UX-DR50, UX-DR67, UX-DR68, UX-DR69, UX-DR71, UX-DR73, UX-DR74, UX-DR75, UX-DR76, AD-11, AD-14

### Story 1.3: Time module and start-time core

As a guest,
I want the start times and their hot / cold start worked out correctly for every day, including the night the clocks change,
So that every time I am offered is really bookable and its heat state can be trusted.

**Acceptance Criteria:**

**Given** `src/lib/time`
**When** its unit tests run
**Then** it converts between UTC instants and Europe/Zurich wall-clock (via Temporal on the server) for operating hours, the 30-minute grid, calendar days, horizon and season bounds, and display formatting ("Dienstag, 12. Januar" / "Tuesday, 12 January", short "Di 12. Januar" / "Tue 12 January")
**And** tests cover Sunday 28 March 2027: 02:00–03:00 does not exist, a day has 23 hours, a 10:00 start is `2027-03-28T08:00:00Z`, and the grid of a 10:00–22:00 day is unchanged in wall-clock terms
**And** the horizon is counted in calendar days: with horizon 14, on 26 December the last bookable day is 9 January
**And** the module takes `now` as a parameter and never reads the clock

**Given** the migration for this story
**When** it runs
**Then** it creates `season` (non-overlapping start/end dates), `setting` (one typed row) with seeded defaults changeover 15 min, pre-heat window 30–40 min, booking horizon 14 days and operating hours 10:00–22:00 (placeholder, admins confirm), a seeded first season 9 January 2027 – 30 April 2027 (placeholder until admins set the exact dates, PRD OQ2), `booking` with the columns needed for reading (start instant, duration in minutes, recorded changeover, `created_at`, `season_id`, nullable `deleted_at`), and `block` (start, end, reason `cleaning`·`maintenance`·`private_use`)
**And** the seed is idempotent (re-running it does not duplicate rows)
**And** a dev-only fixture script can insert sample bookings and blocks for manual testing

**Given** the pure core in `src/lib/domain`
**When** offered start times are computed for a day from (bookings, blocks, settings, season, now)
**Then** kind 1 (every full and half hour), kind 2 (end of each booking plus the current changeover) and kind 3 (any time from which a booking would end exactly one changeover before an existing booking) are produced, each with the durations (60, 90, 120, 150, 180) that fit
**And** a duration is excluded if it would overlap a block, end less than one current changeover before the next booking, or run past the operating hours or the season; a start time less than one current changeover after a booking ends is not offered; no changeover is needed next to a block
**And** a start time only of kind 3 is offered only with the durations that end there; a start time also of kind 1 or 2 offers every duration that fits
**And** start times that have already begun at `now` are not offered; deleted bookings are ignored

**Given** a 15-min changeover, operating hours 10:00–22:00 and a single booking 17:00–18:00
**When** the core computes the day
**Then** 18:00 is not offered, 18:15 is offered and hot, 18:30 and 19:00 are cold starts
**And** 16:00 and 16:30 are not offered, 15:30 offers only 60 min, 15:45 (kind 3) offers only 60 min and 15:15 (kind 3) offers only 90 min

**Given** only a booking at 19:00
**When** the core computes the day
**Then** 17:45 is offered for 60 min and 17:15 for 90 min (kind 3), 17:30 offers only 60 min, 17:00 offers up to 90 min
**And** booking either 17:45 or 17:15 would make 19:00 hot (verified with the heat-state function)

**Given** bookings 17:00–18:00 and 19:00–20:00
**When** heat state is computed
**Then** the 19:00 booking is a cold start; a booking or free start time right after a block of any reason (including private use) is a cold start; heat state never depends on the chosen duration

**Given** existing bookings 17:00–18:00 and 18:15–19:15 made under a 15-min changeover and the changeover then raised to 30 min
**When** the day is computed
**Then** the 18:15 booking stays hot (back to back uses the changeover recorded on the later-made booking, by `created_at` then row id), 19:30 is not offered and 19:45 is offered and hot
**And** these and all other core functions have unit tests with explicit `now`, no DB or mail mocks

**Covers:** FR-2, FR-4, FR-8, FR-19 (core rule), NFR-3, AD-1, AD-8, AD-9, AD-19, AD-25 (season rows)

### Story 1.4: Guest sees a day's start times with hot / cold start

As a guest,
I want to see a day's free start times, each marked hot or cold start, alongside the taken times,
So that I can pick a time knowing whether the stove will already be going.

**Acceptance Criteria:**

**Given** a selectable day
**When** a guest opens `/` (today) or `/day/{yyyy-mm-dd}`
**Then** the day is server-rendered with one `h1` ("Heute, 12. Januar" on today, else "Dienstag, 12. Januar", eyebrow and date in one heading) and a unique `<title>` ("Di, 12. Januar · Sauna Luegisee"; EN pattern per "Copy not yet in the UX catalogue")
**And** the list shows every offered start time from the Story 1.3 core in time order plus one taken row per booking or block, times in `<time datetime>`, each row on the grid `minmax(76px, max-content) 1fr auto`, padding 16/14, radius 3 px
**And** hot rows have a 2 px solid hot border, flame and "SCHON HEISS" / "ALREADY HOT" with the notice "Ofen läuft. Komm um 18:15." / "The stove's going. Come at 18:15."; cold-start rows have a 2 px dashed cold-start border, snowflake and "KALTSTART" / "COLD START" (arrival time added in Story 1.6)
**And** taken rows show a 1 px line border, lock, "BELEGT" / "TAKEN", the start time 18/400 struck through in taken colour, "bis 17:00" / "until 17:00", a 12 px hatch only in the left band, no chevron, not interactive, read as "16:00 bis 17:00, belegt"
**And** start times with limited durations add "Nur 60 Min. · …" / "60 min only · …" or "Bis 90 Min. · …" / "Up to 90 min · …" to the notice
**And** no gradient or tinted fill sits behind heat-state rows and hot/cold is carried by icon, border style, label and colour together

**Given** today is 20 December, the season starts 9 January and the horizon is 14 days
**When** a guest opens `/`
**Then** the season notice replaces the list: "Die Saison beginnt am 9. Januar. Buchen kannst du ab dem 26. Dezember." / "Season opens 9 January. Booking opens 26 December.", with a top hairline and no start times

**Given** today is 28 December (booking open, season not begun)
**When** a guest opens `/`
**Then** they land on 9 January with the note "Die Saison beginnt am 9. Januar. Hier sind die ersten Tage." above the day

**Given** today is after the last season ends, or no season exists
**When** a guest opens `/`
**Then** "Die Saison ist vorbei. Danke fürs Kommen, bis nächsten Winter." / "The season is over. Thanks for coming, see you next winter." is shown without start times and the footer remains; if a next season exists, the before-season state applies instead

**Given** a URL date outside a season, beyond the horizon, in the past or malformed
**When** `/day/{date}` is requested
**Then** no start times are offered for it and the guest is redirected to the nearest selectable day (or the season notice), never an error page

**Given** the day load and its read queries
**When** the serialized page data is inspected
**Then** it contains only the view model (offered start times with durations and heat state, taken intervals as start/end, season state, and pre-formatted display strings), never names, emails, mobile numbers or block reasons, and the guest queries in `db/queries` never select those columns
**And** the calendar and (from Story 1.7) the book command call the same offer function

**Given** the client bundle
**When** `npm run build` completes
**Then** no client chunk references `Temporal` (a build check searches the client output and fails otherwise): client code never imports `src/lib/time`, the view model carries every date and time already formatted, and client-side formatting, if any, uses `Intl.DateTimeFormat` only, so iOS Safari needs no polyfill

**Covers:** FR-1, FR-2, FR-4, FR-8, NFR-1, NFR-2, NFR-3, NFR-10, UX-DR13 (heading), UX-DR15, UX-DR27, UX-DR51, UX-DR52, UX-DR61, UX-DR70 (taken and hot rows), AD-9, AD-26

### Story 1.5: Guest browses days

As a guest,
I want to move between the days I can book with a date strip and previous/next arrows,
So that I can quickly find a day that suits me.

**Acceptance Criteria:**

**Given** a selectable day inside the season and horizon
**When** the day view renders
**Then** a `nav` date strip shows 44 px-wide day cells from today to the end of the booking horizon (calendar days), each with a muted uppercase weekday (via CSS) over the day number, over a line-strong baseline, radius 0
**And** each cell's accessible name is the full date ("Mittwoch, 13. Januar"); the selected day has weight 600, a 2 px primary underline and `aria-current="date"` and is scrolled into view
**And** days outside a season are struck-through muted `<span>`s, not links; days beyond the horizon are not shown

**Given** a phone at 360 px
**When** the strip has more days than fit
**Then** it scrolls horizontally (smooth scroll, jump under `prefers-reduced-motion`) without scrolling the page; at 600 px and above all days show when they fit

**Given** the date heading
**When** it renders
**Then** 44×44 previous/next chevrons named "Vorheriger Tag" / "Nächster Tag" sit right-aligned to the heading baseline, wrapping below the heading at narrow widths
**And** they are `disabled` (not hidden) on the first and last selectable day

**Given** a guest on any day other than today
**When** they view the strip
**Then** a "Heute" / "Today" link with a 44 px hit area returns to today (or the first selectable day when today is not selectable); its placement and copy are listed in "Copy not yet in the UX catalogue" because UX does not specify it yet

**Given** a guest taps a strip day or an arrow
**When** the new day loads
**Then** the URL becomes `/day/{yyyy-mm-dd}` so Back returns to the previous day, the strip selection moves at once, the current list stays dimmed with `aria-busy="true"`, and after 1 s "Lädt …" / "Loading …" appears in note type in a polite `role="status"` region at the top of the list
**And** on arrival the status reads "Dienstag, 13. Januar: 4 freie Zeiten" / "Tuesday, 13 January: 4 free times" (singular "1 freie Zeit" / "1 free time"; or the empty line) and `document.title` updates, both taken pre-formatted from the server view model (no `src/lib/time` on the client)
**And** without JavaScript the links work as full page loads

**Given** the skip link "Zu den Zeiten"
**When** a keyboard user activates it on a day view
**Then** focus moves past the date strip to the start-time list

**Given** a day whose start times are all taken
**When** it renders
**Then** the taken rows stay visible with "An diesem Tag ist alles belegt. Schau dir einen anderen Tag an." / "Nothing free this day. Try another day." above them

**Given** today after the last start time has begun
**When** today renders
**Then** past start times are not shown, any taken rows stay, and "Für heute sind alle Zeiten vorbei. Morgen geht's weiter." / "Today's times are over. See you tomorrow." sits above them

**Given** the booking-open-but-season-not-begun state
**When** the strip renders
**Then** days before the season are struck through and the first season day is selected

**Covers:** FR-1, FR-8, NFR-2, NFR-3, UX-DR13 (chevrons), UX-DR14, UX-DR26, UX-DR52, UX-DR60, UX-DR61, UX-DR62, UX-DR67, UX-DR72, AD-9, AD-26

### Story 1.6: Guest sees the arrival time on cold starts

As a guest,
I want every cold start to tell me in clock times when to arrive to light the fire,
So that the sauna is hot when my time starts.

**Acceptance Criteria:**

**Given** the pure core
**When** a notice is computed
**Then** it is the canonical Notice value `{ heat: 'hot' | 'cold', earliest: instant | null, latest: instant | null }` with one canonical JSON serialization (hot → both null; collapsed range → `earliest` only)
**And** `noticeEquals` compares two notices and is the only notice comparison in the codebase
**And** "already past" and "minutes to heat" are derived at render time, never stored

**Given** a 30–40-min pre-heat window
**When** the arrival time of a cold start at 18:00 is computed with nothing before it
**Then** earliest arrival is 17:20 and latest 17:30, and the row reads "Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein." / "Nobody before you: come between 17:20 and 17:30 and light the fire."

**Given** a block ending at 17:25
**When** the arrival time of the 18:00 cold start is computed
**Then** it is 17:25–17:30

**Given** a booking 16:00–17:00 (recorded changeover 15 min)
**When** the arrival time of the 18:00 cold start is computed
**Then** it stays 17:20–17:30 (17:15 is earlier than 17:20)

**Given** a booking ending 17:30 with a 15-min changeover
**When** the arrival time of the 18:00 cold start is computed
**Then** earliest (17:45) is later than latest (17:30), so the notice holds only earliest 17:45 and the row reads "Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf." / "Only 15 minutes to heat: come at 17:45. It will still be warming up."
**And** it is still a free, bookable cold start and never styled as an error

**Given** the earliest-arrival clamp
**When** the booking ending in the window was made under an earlier, shorter changeover
**Then** the clamp uses that booking's recorded changeover

**Given** now is 17:35 and 18:00 is a free cold start with arrival 17:20–17:30
**When** the guest views the day
**Then** the row reads "Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss." / "Come as soon as you can and light the fire. It won't be fully hot at the start." and stays bookable
**And** with the collapsed range, the same text applies once the single arrival time has passed

**Given** the arrival time may begin before operating hours
**When** a 10:00 cold start is computed with operating hours from 10:00
**Then** the arrival time is 09:20–09:30

**Given** a free row
**When** a screen reader reads it
**Then** the accessible name gives time, state and the catalogue notice ("18:00, Kaltstart. Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein."), icons are `aria-hidden`, and no clock time is given as a duration anywhere

**Given** the core
**When** its unit tests run
**Then** they cover the examples above, the collapsed range, the past case (with explicit `now`), a block clamp, the recorded-changeover clamp and the 28 March 2027 DST day

**Covers:** FR-3, FR-2, NFR-3, NFR-10, UX-DR51, UX-DR65, UX-DR70, AD-1, AD-8, AD-19, AD-24

### Story 1.7: Guest books a start time

As a guest,
I want to tap a free start time, choose duration and party size, enter my name, email and mobile and book in one go,
So that the wagon is mine without an account or password.

**Acceptance Criteria:**

**Given** a free row on the day view
**When** the guest taps it
**Then** the whole row is one link to `/book/{date}/{hhmm}` (pressed fill line-subtle), and the form page has the `<title>` "18:00 buchen · Sauna Luegisee"
**And** the booking summary shows a back link "‹ Di, 12. Januar" (name "Zurück zu Dienstag, 12. Januar", 44 px hit area), the start time in summary-time 44/300 and the state badge (bordered tag, icon + uppercase label, 2 px solid hot / dashed cold start, not interactive) with the row's notice, over a hairline

**Given** the migration for this story
**When** it runs
**Then** `booking` gains party size, locale (`de`·`en`), name, email, mobile (E.164) as nullable contact columns, a random URL-safe public id (≥ 128 bits) and a submit token with a unique constraint

**Given** the duration control
**When** the form opens for 18:00 with a booking at 20:00 and 15-min changeover
**Then** a `<fieldset>` with legend "DAUER" / "DURATION" shows 60·90·120·150·180 as native radios behind styled labels (arrow keys work), min 44 px, line-strong outline and dividers, each named with unit and end time ("90 Minuten, bis 19:30")
**And** 120–180 are disabled radios, muted and struck through, with one visible note "120–180 Min. nicht möglich: nächste Buchung um 20:00." linked by `aria-describedby` (the variants for a block or the end of operating hours as the reason, and the EN text, per "Copy not yet in the UX catalogue")
**And** 60 is preselected when offered, else the only (shortest) offered duration (e.g. a kind-3 start time offering only 90 preselects 90); the selected segment has text fill, weight 500 and the check icon, and under forced colours uses `SelectedItem` plus the check icon

**Given** the party-size control
**When** the form opens
**Then** a `<fieldset>` "PERSONEN" / "PEOPLE" offers 1–6 as native radios with 2 preselected

**Given** the contact fields under "KONTAKT"
**When** the form renders
**Then** Name (`autocomplete=name`), E-Mail (`type=email`, `autocomplete=email`, `autocapitalize=off`, `spellcheck=false`) and Handy (`type=tel`, `autocomplete=tel`) each have a visible `<label for>` above (no placeholder-as-label), a line-strong underline, 2 px focus underline, and a purpose line tied via `aria-describedby`: "Damit wir die Buchung an der Sauna zuordnen können.", "Für die Bestätigung und den Schlüsselcode.", "Nur falls wir dich kurzfristig anrufen müssen." (EN equivalents)
**And** below the fields "Mehr dazu im Datenschutz." / "More in our privacy statement." links to `/privacy`; there is no consent checkbox, no account, password or verification step

**Given** one booking schema in `src/lib/schemas` (Valibot)
**When** used by the client and by the form action
**Then** it trims the email, accepts mobile input with spaces, `+41`, `0041` or `07…` and normalises it to E.164 (`079 123 45 67` → `+41791234567`), and returns i18n message keys
**And** on blur only fields with content are validated; an invalid email shows "Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie, z. B. name@beispiel.ch." and an invalid mobile "Bitte gib eine Handynummer an, unter der wir dich erreichen, z. B. 079 123 45 67." under the field with a 2 px error underline, error icon and `aria-invalid`, not announced live
**And** on submit with errors a summary at the top ("2 Angaben fehlen oder stimmen nicht."; singular variant for one, `role="alert"`) appears, focus moves to the first invalid field and all typed values stay; the server result is authoritative

**Given** the guest switches language on `/book/{date}/{hhmm}`
**When** the page reloads in the other language
**Then** name, email and mobile are restored from `sessionStorage`, and the selected duration and party size are kept (carried as query parameters such as `?d=90&p=3`, which are not guest data)

**Given** the primary button labelled "18:00 buchen" / "Book 18:00"
**When** the guest taps it
**Then** the label becomes "Wird gebucht …", `aria-disabled="true"` ignores further taps, focus stays and a polite status says "Wird gebucht …"
**And** after about 15 s the status reads "Das dauert gerade länger. Bitte warte noch, wir buchen nicht doppelt." and never claims failure while the result is unknown

**Given** a valid submit
**When** the form action runs
**Then** the book command runs in one `BEGIN IMMEDIATE` transaction, re-reads bookings, blocks, settings and season, calls the same core offer function as the calendar, and inserts the booking with the current changeover as recorded changeover, `created_at`, `season_id`, party size, locale active at submit, normalised contact data, public id and submit token
**And** the command returns `{ ok: true, publicId }` and the guest is redirected to `/booked/{publicId}`
**And** guest details never appear in a URL, cookie or redirect

**Given** this story's confirmation route `/booked/[publicId]`
**When** it is opened with a known public id
**Then** it shows "Gebucht!" / "Booked!" with date, start time, duration and party size (Story 1.8 adds the notice, the keybox sentence and the details list)
**And** an unknown or malformed public id returns a 404 page in the guest layout that reveals nothing about any booking

**Given** the same submit token posted twice (double tap, resubmit, Back + submit)
**When** the second request arrives
**Then** no second booking is created and the command returns `{ ok: true }` with the existing public id

**Given** two guests submit conflicting bookings at the same moment (e.g. 17:00–18:00 and 18:00–19:00 with a 15-min changeover)
**When** both commands run
**Then** exactly one succeeds; the other returns `{ ok: false, code: 'conflict' }` and the action `fail(409, { code, date })`
**And** that guest lands on the refreshed day with "18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da." first in `main` (`tabindex="-1"`, focused on load), `<title>` prefixed "Fehler: ", 17:00 shown taken and 18:15 offered hot
**And** name, email and mobile were kept in `sessionStorage` (written on input and submit; the only sessionStorage use) and prefill the next form they open; without JavaScript they are asked again

**Given** a guest submits after the start time began
**When** the command runs
**Then** it returns `past` and the guest lands on the day with "18:00 hat schon angefangen. Wähl bitte eine andere Zeit." with the same focus, title and retention treatment

**Given** a stale form is opened (start time taken or past at load)
**When** `/book/{date}/{hhmm}` loads
**Then** the guest goes straight to the day with the matching message

**Given** a network or server failure on submit
**When** the request fails
**Then** "Das hat nicht geklappt, die Buchung ist nicht gespeichert. Versuch es bitte nochmal." appears at the top (focused, `role="alert"`, title prefixed "Fehler: "), all input is kept and the button is re-enabled

**Given** a booking that would run past operating hours, the season end or the horizon, overlap a block, or end less than one current changeover before another booking
**When** it is posted (even with a crafted request)
**Then** the command refuses it with `conflict` or `invalid`; existing pairs made under an earlier, shorter changeover stay valid

**Given** a phone at 360 px
**When** the guest books a free time
**Then** the whole flow works one-handed, the primary button is last in scroll order, and a first-time guest can book in under one minute

**Covers:** FR-5, FR-6, FR-8, FR-9, FR-26, FR-27 (locale stored), NFR-1, NFR-2, NFR-7 (no guest data public), UX-DR9 (form input kept), UX-DR16, UX-DR18, UX-DR19, UX-DR20, UX-DR21, UX-DR22, UX-DR25, UX-DR45, UX-DR53, UX-DR54, UX-DR63, UX-DR64, UX-DR67, UX-DR68, UX-DR69, UX-DR70, UX-DR71, UX-DR72, UX-DR73, AD-2, AD-3, AD-11, AD-13, AD-16, AD-25 (season_id), AD-26

### Story 1.8: Guest sees the confirmation with the notice at booking

As a guest,
I want the confirmation to show my notice as it was when I booked and when the keybox code will come,
So that I know when to arrive and what happens next.

**Acceptance Criteria:**

**Given** the migration for this story
**When** it runs
**Then** `booking` gains `notice_at_booking` (immutable) and `last_told_notice`, both canonical Notice JSON, nullable at the database level so dev rows created before this migration stay valid; every booking made from this story on has both set
**And** the `setting` row gains the admin contact address, seeded with the clearly fake placeholder `platzhalter@sauna-luegisee.ch` until admins set it (flagged by the launch readiness check, Story 5.5)

**Given** the booking form
**When** it renders
**Then** it posts the displayed notice token (canonical Notice JSON) with the submit

**Given** a successful book command
**When** the booking is inserted
**Then** the core computes the booking's notice inside the same transaction and stores it as both `notice_at_booking` and `last_told_notice`

**Given** `/booked/{publicId}` after booking 18:00 as a cold start
**When** it renders
**Then** it shows the date eyebrow, "Gebucht!" / "Booked!" in display type (the only exclamation), the large state badge (10/14 padding) "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein." (hot: "Schon heiss um 18:15." / "Already hot at 18:15."), a hairline, the keybox sentence and a details list (`dt` muted / `dd`) Wann, Personen, Absagen ("schreib an" the admin contact address from the setting created by this story, as a `mailto:` link)
**And** the `<title>` is "Gebucht · Sauna Luegisee"
**And** too-little-time and arrival-past notices show with their catalogue text, not as errors

**Given** a booking on Tuesday 12 January 18:00 made on Thursday 7 January
**When** the confirmation renders
**Then** the keybox sentence says the code arrives on "Mo 11. Januar um 18:00" (24 hours of real time before the start)
**And** for a booking on Sunday 28 March 2027 10:00 the sentence says "Sa 27. März um 09:00" (DST switch)
**And** when booked after the 24-hour cutoff it says "Der Schlüsselcode ist schon unterwegs in dein Postfach."

**Given** the posted displayed notice differs from the notice at booking (e.g. the form showed KALTSTART and someone booked 17:00–18:00 so 18:15 is now hot)
**When** the booking is made
**Then** the booking is still made, the badge shows the notice at booking, and the line "Das hat sich gerade geändert." / "That just changed." appears

**Given** the guest revisits `/booked/{publicId}` later
**When** it renders
**Then** it shows the same confirmation with the notice at booking and the line "So stand es bei der Buchung. Änderungen schicken wir dir per Mail."

**Given** the confirmation
**When** the guest wants another time
**Then** "Weitere Zeit buchen" / "Book another time" (44 px hit area) links to the day of the booking; a link to "So funktioniert's" is present

**Given** an unknown or malformed public id
**When** `/booked/{id}` is requested
**Then** the 404 page from Story 1.7 is still shown (heading and line per "Copy not yet in the UX catalogue") and nothing about any booking is revealed
**And** the confirmation load returns only date, start time, duration, party size, notice at booking and keybox-email time, never name, email or mobile

**Covers:** FR-7, FR-10 (on-screen part), FR-11 (timing shown), FR-20 (admin contact setting), NFR-3, NFR-10, UX-DR16, UX-DR28, UX-DR45, UX-DR51, UX-DR65, UX-DR69, AD-3, AD-7, AD-9, AD-13, AD-24, AD-26

### Story 1.9: So funktioniert's, privacy statement and Impressum pages

As a guest,
I want to read how the wagon works, how my data is handled and who runs it,
So that I can arrive prepared and trust the operators with my details.

**Acceptance Criteria:**

**Given** the footer links
**When** a guest opens `/info`, `/privacy` or `/imprint`
**Then** the stub pages from Story 1.2 are replaced: each page has the app header, footer, one `h1`, a unique `<title>` ("So funktioniert's · Sauna Luegisee", "Datenschutz · Sauna Luegisee", "Impressum · Sauna Luegisee"; EN titles per "Copy not yet in the UX catalogue") and its content in DE and EN following the language switch

**Given** `/info`
**When** it renders
**Then** it has slots (messages in `messages/de.json` and `en.json`) for location, how heating works (hot vs cold start, lighting the fire), the keybox, how to cancel (by email to the admins) and contact, filled with operator-authored text
**And** until the operators supply it, each slot holds placeholder text that starts with the fixed marker `[PLATZHALTER]` in both languages, so the launch readiness check (Story 5.5) can find it

**Given** `/privacy`
**When** it renders
**Then** it has slots for operator contact, each field with its purpose (email for confirmation and keybox code, mobile for the short-notice call, name to identify the booking at the wagon), retention (deleted 30 days after the season ends), how long purged data can remain in off-box backups (period set in Story 5.3) and that no tracking or third-party analytics are used, with the same `[PLATZHALTER]` marker until filled
**And** it is reachable from the footer and from the booking form link

**Given** `/imprint`
**When** it renders
**Then** it has slots for the legal operator details in DE and EN, with the same `[PLATZHALTER]` marker until filled

**Given** the admin contact address setting created in Story 1.8
**When** any guest page renders
**Then** the footer shows the admin contact as a `mailto:` link with the address as visible text, 44 px high, after Impressum (this story adds no migration)

**Given** English mode
**When** any operator-authored German text has no English version yet
**Then** it is wrapped in `lang="de"`

**Covers:** FR-29, FR-26, FR-9 (link target), NFR-8, NFR-10, UX-DR43, UX-DR47, UX-DR48, UX-DR49, UX-DR74, AD-14

### Story 1.10: Epic 1 hardening (retro A1–A6)

As a guest,
I want the booking flow to recover from a lost response and every page to speak plainly,
So that I always reach my own confirmation and nothing misleads me or stays behind on a shared device.

Added after the Epic 1 retrospective (2026-11-12, findings F1–F6, action items A1–A6). Spec: `_bmad-output/implementation-artifacts/spec-1-10-epic-1-hardening.md`.

**Acceptance Criteria:**

**Given** a booking POST that went through but whose response was lost, with the pending `{path: '/book/D/T', token}` in `sessionStorage`
**When** the guest reloads or switches language and the form redirects to `/day/D?error=conflict&time=T`
**Then** the day page POSTs the token to `/booked`, gets `{href}`, replaces the location with `/booked/{id}?new=1` and clears the pending submit (A1)
**And** a token that matches no live booking gets a 404, the conflict message stays and the pending submit is cleared; a pending submit for another form path is not looked up; a reloaded form whose slot is still free submits the stored token; a malformed lookup body gets a 400 with no detail; the token goes only in a POST body

**Given** an unknown path such as `/nope/deeper`
**When** it is requested
**Then** a 404 renders inside the guest shell (header, footer with contact) in DE and EN, errors outside the guest layout get a root fallback error page, and `/favicon.ico` no longer 404s (A2)

**Given** an admin contact of `'  a@b.ch '`, `''`, `'   '` or null
**When** the confirmation renders
**Then** it gets `'a@b.ch'`, `null`, `null` or `null`, read like the footer (A3)

**Given** a refusal query on a day that is no longer selectable (`/day/2026-01-01?error=past&time=2330`)
**When** it redirects to the nearest selectable day
**Then** the redirect carries no query (A4)

**Given** a page whose skip target is `main`
**When** it renders
**Then** the skip link reads "Zum Inhalt" / "Skip to content"; day pages keep "Zu den Zeiten" (A5)

**Given** a booking that succeeds (redirect to `/booked/…`)
**When** the form or the resume lookup lands on the confirmation
**Then** the contact details and the pending submit are removed from `sessionStorage`, and the drafted privacy text names the session storage (A6)

**And** without JavaScript the booking flow is unchanged (A1 and A6 are progressive enhancements only)

**Covers:** FR-5, FR-6, FR-9, NFR-8, UX-DR11; retro A1–A6

## Epic 2: Guests are kept informed by email

Every booking gets a confirmation email; the keybox email arrives at the 24-hour cutoff with the authoritative notice; heat changes are emailed after the settle delay, all in the booking's language. The epic adds the transactional outbox, the in-process worker with heartbeat and Infomaniak SMTP delivery, and records refused and stuck sends so the call list (Epic 3) can surface them.

### Story 2.1: Guest receives a confirmation email

As a guest,
I want an email confirming my booking with my notice and how to cancel,
So that I have the details in my inbox and know what to do if plans change.

**Acceptance Criteria:**

**Given** the migration for this story
**When** it runs
**Then** it creates `outbox` (booking id, kind `confirmation`·`keybox`·`heat_change`, state `pending`·`in_flight`·`accepted`·`refused`·`transient_failure`·`expired`·`cancelled`, due instant, `claimed_at`, the snapshot columns `snapshot_notice` (canonical Notice JSON), `snapshot_keybox_code` (nullable), `snapshot_locale` and `snapshot_urgent` (nullable boolean), reason, outcome instant) with no contact data or rendered content, and `worker_heartbeat` (one row)
**And** the keybox and heat-change stories (2.2, 2.3) write these existing columns and add no snapshot migration of their own

**Given** a successful book command
**When** its transaction commits
**Then** exactly one `confirmation` row due now was inserted in the same transaction; a duplicate submit inserts nothing; a refused booking inserts nothing

**Given** the app starts
**When** `hooks.server.ts` init runs
**Then** one worker loop starts behind a module-level singleton (no second loop under dev HMR), and `in_flight` rows older than the in-flight timeout return to `pending` (at-least-once)
**And** the loop ticks about every minute, schedules the next tick only after the current one finishes, catches and logs its own errors and never exits
**And** each tick records the heartbeat through a command

**Given** a due `pending` confirmation row
**When** the worker claims it
**Then** the claim command, in one transaction, moves it to `in_flight` with `claimed_at` and freezes the snapshot (notice at booking, language)
**And** the email is rendered only from the snapshot and sent outside any write transaction
**And** the record-send-outcome command sets `accepted` when the SMTP server accepts it; an accepted confirmation never changes `last_told_notice`

**Given** the app was down for hours
**When** it boots
**Then** the first tick sends every due row it missed (idempotent catch-up)

**Given** production env (`NODE_ENV=production`, as decided in Story 1.1)
**When** the transport is built
**Then** nodemailer sends over authenticated SMTP to `SMTP_HOST` (`mail.infomaniak.com`), port 587 with STARTTLS, from `MAIL_FROM` on sauna-luegisee.ch with From name "Sauna Luegisee", and `Reply-To` set to the admin contact address setting (Story 1.8) at send time
**And** outside production the transport is a local sink (files or console) and never real SMTP, even if SMTP values are present

**Given** a booking made in English for Tuesday 12 January 18:00, cold start 17:20–17:30
**When** its confirmation email is rendered
**Then** subject is "Booked: Sauna Luegisee, Tue 12 January, 18:00" (DE: "Gebucht: Sauna Luegisee, Di 12. Januar, 18:00")
**And** the body gives date, start time, duration, party size, the notice at booking ("Cold start: come between 17:20 and 17:30 and light the fire."), "If that changes, we'll let you know." / "Ändert sich das, sagen wir dir Bescheid.", when the keybox code will arrive ("Mo 11. Januar um 18:00", or that it follows right away when past the cutoff) and how to cancel (write to the admin contact)
**And** all text comes from the Paraglide catalogue in the booking's stored language; the EN body lines, the past-cutoff variant and the detail labels are listed in "Copy not yet in the UX catalogue"

**Given** any guest email
**When** it is built
**Then** it is `multipart/alternative` with a complete `text/plain` part in the same content and order as the HTML; the HTML root has `lang` (`de-CH` or `en`), the `Content-Language` header matches, and `<meta name="color-scheme" content="light dark">` is set
**And** there are no wrapper background colours, every set colour sets text and background together, no images or tracking pixels, clock times and dates only, admin contact as `mailto:`, signed "Sauna Luegisee"

**Given** a send
**When** it is logged
**Then** the log line names the outbox row id and outcome, never name, email, mobile or keybox code

**Covers:** FR-10, FR-27, NFR-3, NFR-5 (sender and From), NFR-9, NFR-10, UX-DR58, UX-DR59, UX-DR74, AD-4, AD-5, AD-7, AD-14, AD-15, AD-23

### Story 2.2: Guest receives the keybox email at the 24-hour cutoff

As a guest,
I want the keybox code and the current notice by email the day before,
So that I can get in and know exactly when to arrive.

**Acceptance Criteria:**

**Given** the migration for this story
**When** it runs
**Then** the `setting` row gains the keybox code and the access and return instructions in DE and EN (seeded empty placeholders until admins set them)

**Given** a booking for Tuesday 12 January 18:00 made on 7 January
**When** the book command commits
**Then** a `keybox` row is inserted in the same transaction, due at the 24-hour cutoff `2027-01-11T17:00:00Z` (Mo 11. Januar 18:00 Zurich)
**And** for Sunday 28 March 2027 10:00 the row is due `2027-03-27T08:00:00Z` (Sa 09:00 Zurich, real elapsed time across the DST switch)

**Given** a booking made after its cutoff (e.g. at 15:30 for 18:00 today)
**When** the book command commits
**Then** the keybox row is due now and, with the confirmation due at the same time, the worker sends the confirmation first (drain order: due time, then kind `confirmation`, `keybox`, `heat_change`)

**Given** a due keybox row
**When** the worker claims it
**Then** the snapshot freezes the current notice, the keybox code current at that moment and the language
**And** the email subject is "Schlüsselcode für Di 12. Januar, 18:00" / "Keybox code for Tue 12 January, 18:00"; the code stands first as real text in a heading with spaced digits ("Code: 4 7 1 1"), then the current notice marked as the one that counts, then the access and return instructions in the booking's language (marker and instructions heading per "Copy not yet in the UX catalogue")

**Given** the keybox code setting is empty, or the access and return instructions in the booking's language are empty
**When** a keybox row is due
**Then** the claim command does not claim it: the row stays `pending`, no email is sent, and the worker logs one line per tick naming the row id and the missing setting (never a code)
**And** the AD-21 rule "keybox row not `accepted` 15 min after due" therefore puts the booking on the call list (Story 3.6), and once the setting is filled the next tick sends the email, still only up to the start time
**And** the launch readiness check (Story 5.5) lists the empty setting before launch

**Given** the keybox email is accepted
**When** the outcome is recorded
**Then** `last_told_notice` is set from the snapshot notice (not the notice at booking), and the snapshot is the record of the code the email contained

**Given** the keybox code setting changes after a keybox email was accepted (direct update of the setting in the test; the admin UI follows in Story 3.8)
**When** nothing else happens
**Then** the sent email is not resent and its snapshot keeps the old code

**Given** the app was down across a cutoff
**When** it comes back before the start time
**Then** the keybox email is still sent late; once the start time has passed an unsent row becomes `expired` and is never sent

**Given** the tick runs about every minute
**When** a cutoff passes while the app is up
**Then** the keybox email is sent within 15 minutes after the cutoff

**Given** a keybox row whose booking is soft-deleted (`deleted_at` set)
**When** the worker would claim it
**Then** it is `cancelled` instead; a deleted booking never receives a keybox email

**Given** the core
**When** keybox phase is computed
**Then** a booking is in the keybox phase once its keybox row is terminal (`accepted`, `refused`, `expired`), with unit tests for each transition of the AD-23 diagram: `pending` → `in_flight`; `in_flight` → `accepted`, `refused` or `transient_failure`; `transient_failure` → `in_flight`; `pending` or `transient_failure` → `expired` at the start time (never `in_flight` → `expired`)
**And** a test covers an `in_flight` row older than the in-flight timeout at boot after the start time: it returns to `pending` and becomes `expired` on the next tick

**Covers:** FR-11, FR-27, NFR-3, NFR-4, NFR-9, UX-DR58, UX-DR59, AD-4, AD-6 (keybox phase), AD-7, AD-9, AD-19, AD-23, AD-24

### Story 2.3: Guest is emailed when the heat state changes

As a guest,
I want an email when my booking turns hot or cold or my arrival time moves, but only once it has settled,
So that I arrive at the right time without being spammed by back-and-forth changes.

**Acceptance Criteria:**

**Given** the pure core
**When** `classifyHeatChange(lastTold, current)` runs
**Then** it returns `urgent` for hot → cold start, a later earliest arrival or an earlier latest arrival; `good_news` for cold start → hot; `none` otherwise (equal, earlier earliest or later latest arrival only widen the range)
**And** `affectedBooking` returns the first booking starting after a booking or block ends if it starts no later than one current changeover (the setting at computation time) plus the longer pre-heat end after that end; the earliest-arrival clamp itself still uses the recorded changeover (AD-8)
**And** unit tests cover every direction and the collapsed range

**Given** any command that recomputes a notice (book here; booking delete, block create/delete and pre-heat change in Stories 3.3, 3.5 and 3.7)
**When** it compares the recomputed notice with the booking's `last_told_notice`
**Then** it upserts an open `heat_change` row only when `classifyHeatChange(lastTold, current) ≠ none`; a difference that only widens the range enqueues nothing (clarification of AD-6: "heat change" means a classification other than `none`)

**Given** Jonas's booking Saturday 16 January 18:30, last-told "Kaltstart: komm zwischen 17:50 und 18:00", with 16:00–17:00 before it
**When** someone books 17:15–18:15
**Then** the book command, in the same transaction, recomputes the notice of its affected booking (18:30, now hot, `good_news`) and upserts exactly one open `heat_change` row for it due now + 10 min

**Given** the open heat-change row
**When** another change to the same booking happens within 10 minutes
**Then** the same row is updated with a new due time now + 10 min (settle delay restarts); never two open rows per booking

**Given** a due heat-change row
**When** the worker claims it
**Then** it rechecks the current notice against `last_told_notice`; if `classifyHeatChange(lastTold, current) = none` (which includes the equal case) it becomes `cancelled` and nothing is sent; otherwise the snapshot freezes notice, language and the urgent flag from `classifyHeatChange`
**And** a unit test covers a widening-only drift before the claim (e.g. last told 17:20–17:30, current 17:15–17:30): the row is `cancelled` and no email is sent

**Given** the good-news change above
**When** the email is sent
**Then** subject "Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss" / "Good news: Sat 16 January, 18:30 is already hot", body "Vor dir ist jetzt jemand in der Sauna. Komm am Sa 16. Januar einfach um 18:30, der Ofen läuft."
**And** on acceptance `last_told_notice` becomes the snapshot notice

**Given** a cold start Saturday 16 January 18:00 last told 17:20–17:30 and someone books 16:30–17:30
**When** the heat-change email is sent
**Then** it is urgent with subject "Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00" and gives the arrival time ("Nur 15 Minuten zum Einheizen: komm um 17:45 …"; the collapsed-range body is listed in "Copy not yet in the UX catalogue")
**And** templates for urgent hot → cold start ("Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00") and earlier latest arrival ("Wichtig: neue Ankunftszeit für …", "Wir heizen jetzt länger vor. Komm zwischen 17:10 und 17:20 und heiz ein.") exist in DE and EN and are rendered in tests from snapshots, ready for the deletion and pre-heat triggers of Epic 3
**And** every subject carries weekday, date and time

**Given** a booking whose keybox row is `in_flight` or terminal
**When** a heat change happens or the keybox row is claimed
**Then** open heat-change rows for it are `cancelled` and no new one is upserted; no heat-change email is sent after the keybox email

**Given** a booking whose start time passes with an unsent heat-change row
**When** the worker ticks
**Then** the row becomes `expired`

**Given** the tick runs about every minute
**When** the settle delay ends while the app is up
**Then** the heat-change email is sent within 15 minutes after it

**Covers:** FR-12, FR-27, NFR-4, NFR-10, UX-DR59, AD-1, AD-4, AD-6, AD-7, AD-19, AD-23, AD-24

### Story 2.4: Refused and stuck sends are recorded

As an operator,
I want every refused, failing or stuck guest email recorded with its reason,
So that we can phone guests whose code or warning did not get through.

**Acceptance Criteria:**

**Given** the SMTP server rejects a send permanently (5xx)
**When** the outcome is recorded
**Then** the row becomes `refused` with the reason, and `last_told_notice` is not updated

**Given** a temporary SMTP error, timeout or connection failure
**When** the outcome is recorded
**Then** the row becomes `transient_failure` with a backoff due time (intervals chosen and documented in the worker, e.g. 1, 2, 5, 10 then every 15 min) and is retried while before the booking's start time
**And** a row still unsent at the start time becomes `expired`

**Given** the migration for this story
**When** it runs
**Then** `outbox` gains `resolved_at` (set later by mark called in Story 3.6)

**Given** the pure core
**When** a booking's send problems are computed from its outbox rows and `now`
**Then** it reports call required with reason when the latest keybox row or latest urgent heat-change row is `refused` or `expired` with `resolved_at` unset ("Schlüsselmail abgelehnt" / "Warnmail abgelehnt"), or when a keybox row is not `accepted` 15 minutes after its due time (still being retried)
**And** it reports other refused rows (confirmation, good-news heat change) as non-urgent refusals shown with the booking
**And** a row with `resolved_at` set never raises an entry again, even if its state later changes (e.g. an overdue keybox row resolved by mark called that afterwards becomes `refused` or `expired`)
**And** unit tests cover each case including the 15-minute rule and resolved rows; the call-list display is built in Epic 3

**Given** an outcome arrives for a booking that was soft-deleted while the row was `in_flight`
**When** it is recorded
**Then** the row's state and reason are stored and nothing else changes (no `last_told_notice` write, no new rows)

**Given** a failed send
**When** it is logged
**Then** the line names the outbox row id, state and SMTP code, never contact data or the keybox code, and guests see nothing

**Covers:** FR-14, FR-11 (late send/expiry), NFR-4, NFR-9, AD-4, AD-7, AD-19, AD-21 (send-problem data), AD-23, Additional: logging convention

## Epic 3: Operators run the wagon from the admin portal

Admins sign in with the shared password, see bookings by day, delete bookings with an impact preview, answer cancelled guests, create and delete blocks, work the call list, and manage settings including seasons and keybox code rotation. The admin home warns when the worker stops. Every mutation goes through the command layer in one exclusive transaction (AD-2, AD-3), and every impact preview calls the same core functions as the command.

### Story 3.1: Admin signs in

As an operator,
I want to sign in to `/admin` with the shared password and land on an admin home that shows open calls, open replies and whether the worker is running,
So that only operators reach guest details and I can see at a glance whether anything needs doing.

**Acceptance Criteria:**

**Given** the migration for this story
**When** it runs
**Then** it adds the nullable `admin_password_hash` column to `setting`, creates `admin_session`, and adds the nullable `reply_done_at` column to `booking` (`deleted_at` exists since Story 1.3)

**Given** an operator at a shell on the dev machine or inside the production container (`docker compose exec app npm run set-admin-password`, Epic 5; the script and its dependencies ship in the production image)
**When** they run `npm run set-admin-password`
**Then** the command reads the password from stdin without echoing it, stores only its argon2 hash in `setting.admin_password_hash`, and prints a confirmation without the password
**And** it refuses an empty password or one shorter than 12 characters, storing nothing
**And** it refuses if a hash already exists unless `--reset` is passed (the recovery path when every admin has lost the password); a reset also deletes every `admin_session` row
**And** it never logs or echoes the password, and the password is never passed as a command-line argument or env variable

**Given** no admin password hash is set yet
**When** someone submits the sign-in form
**Then** sign-in fails with the wrong-password message and the app logs one line saying no admin password is set and naming `npm run set-admin-password`

**Given** a visitor who is not signed in
**When** they request any `/admin` route other than `/admin/login`
**Then** `hooks.server.ts` redirects them to `/admin/login` with the requested path as return target
**And** no admin data is loaded or serialized for that request
**And** there is no link to `/admin` from any guest page.

**Given** the sign-in page `/admin/login`
**When** it renders
**Then** it shows a centred 560 px column with the app header, a hidden `username` field with value "admin" for password managers, one visible password field (`autocomplete="current-password"`, paste allowed) with a visible label, and a primary sign-in button
**And** the page has one `h1` and a unique `<title>` (sign-in strings per "Copy not yet in the UX catalogue").

**Given** the correct shared password
**When** the admin submits the sign-in form
**Then** the sign-in command verifies it against the argon2 hash in `setting.admin_password_hash` (set by the CLI from this story), creates an `admin_session` row with a random URL-safe id of at least 128 bits that expires 30 days after its last use (each authenticated request extends it)
**And** the browser receives that id in a cookie that is `Secure`, `HttpOnly` and `SameSite`, the only cookie besides the language cookie
**And** the admin is redirected to the return target if it is a same-origin path starting with `/admin`, else to `/admin`.

**Given** a return target that is absolute, protocol-relative (`//evil.example`), outside `/admin`, or malformed
**When** sign-in succeeds
**Then** the admin is sent to `/admin` and the target is ignored.

**Given** a wrong password
**When** the admin submits
**Then** the form shows "Das Passwort stimmt nicht." / "That password isn't right." as an inline error message with `role="alert"`, focus moves to the password field, and the password is never echoed back in the form values.

**Given** 5 wrong passwords from one client address
**When** a further attempt arrives from that address within the same minute
**Then** the sign-in command refuses it without checking the password, shows "Zu viele Versuche. Versuch es in einer Minute wieder." / "Too many tries. Try again in a minute." and the button is disabled until the minute is over
**And** after that, at most one attempt per minute is accepted from that address until a correct password resets the counter
**And** attempts from other addresses are not affected, the attempt records are short-lived, and no log line contains the password
**And** attempt records are kept in an in-memory map owned by the sign-in command (single app instance; a restart resets the counters, accepted).

**Given** a signed-in admin whose session has expired or been deleted
**When** they load any admin page
**Then** they are redirected to sign-in with "Bitte melde dich wieder an." / "Please sign in again." and return to that page after signing in.

**Given** a signed-in admin
**When** any admin page renders
**Then** the admin nav sits under the app header with Übersicht, Buchungen, Blocks, Einstellungen, Auswertung, Abmelden (EN Overview, Bookings, Blocks, Settings, Analytics, Sign out) over a `line` baseline; the active tab has weight 600, text colour, a 2 px text underline and `aria-current="page"`, never primary
**And** on phones the nav scrolls horizontally; on laptops it is capped at 1040 px with Abmelden far right; every tab is at least 44 px high
**And** the admin portal follows the language switch, and any German string left untranslated in English mode is wrapped in `lang="de"`.

**Given** the admin nav
**When** it renders the Übersicht tab
**Then** it carries two separate count badges, phone icon with the call-list count and mail icon with the reply-reminder count, each with hidden text ("2 Anrufe offen" / "1 Antwort offen"), each showing "0" when empty and never summed
**And** the call-list count comes from a core function that derives the call list per AD-21 from non-deleted, not-yet-started bookings and their outbox rows (with unit tests for every trigger, "call required wins", and entries dropping at start time)
**And** the reply-reminder count comes from the query `deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL` (columns from Story 1.3 and this story's migration)
**And** the badge hidden texts have singular and plural variants per "Copy not yet in the UX catalogue".

**Given** a signed-in admin
**When** they tap Abmelden
**Then** the sign-out command deletes their session row at once, clears the cookie and shows the sign-in page.

**Given** a signed-in admin opens `/admin`
**When** the admin home renders
**Then** it has the `h1` "Übersicht" / "Overview", a single column on phones and a two-column layout up to 1040 px on laptops (left column for the call list and replies, right column for next bookings)
**And** if the last worker heartbeat is older than 5 minutes (or none exists), an error inline message at the top says the worker is not running and since when, with a clock time (copy per "Copy not yet in the UX catalogue"); with a fresh heartbeat no warning is shown.

**Covers:** FR-15, NFR-7, NFR-8, FR-27, UX-DR8, UX-DR12, UX-DR22, UX-DR25, UX-DR39, UX-DR44, UX-DR46, UX-DR53, UX-DR55, UX-DR66, UX-DR69, UX-DR71, UX-DR74, UX-DR75, AD-2, AD-3, AD-5, AD-10, AD-11, AD-20, AD-21, Additional: admin password bootstrap (scaffold decision 3)

### Story 3.2: Admin sees bookings by day

As an operator,
I want to see each day's bookings with the guest's contact details, the notice now, the notice we last told them and what their keybox email contained,
So that I know who is coming, what they were told and who to contact.

**Acceptance Criteria:**

**Given** a signed-in admin
**When** they open Buchungen (`/admin/day/{yyyy-mm-dd}`, default today or the first day of the next season)
**Then** a date strip shows the days of the current season, or of the next season if none is current, not limited by the booking horizon, with the same cell, selection, `aria-current="date"`, URL update and keyboard behaviour as the guest strip
**And** the strip appends every day outside that season that has a non-deleted future booking or block (e.g. after the season was shortened), each marked with the out-of-season flag text, so flagged bookings stay reachable
**And** a date heading with previous/next chevrons (disabled at the first/last day of the strip) and a skip link "Zu den Buchungen" / "Skip to bookings" as the first focusable element
**And** `/admin/day/{date}` accepts any date that lies in a season row or has a non-deleted booking or block (so past seasons can still be browsed); any other or malformed date returns the admin not-found page with a link back to Buchungen (copy per "Copy not yet in the UX catalogue").

**Given** a day with non-deleted bookings
**When** the day renders on a screen narrower than 1024 px
**Then** each booking is an admin booking row (grid `1fr auto 20px`, min 44 px, hairlines between rows): line 1 the time range and heat state (icon + label); line 2 "Tom Brunner · 2 Personen" plus change tags; a chevron spanning both lines; tapping the row opens booking detail
**And** at 1024 px and wider the day is an admin day table with columns time · name · party · email · mobile · notice · last-told notice · keybox code sent, `<th scope="col">` in section-label type, the whole row linking to booking detail.

**Given** a day with no bookings
**When** it renders
**Then** it shows "Keine Buchungen an diesem Tag." / "No bookings this day."

**Given** the admin switches day
**When** the new day is loading
**Then** the list stays dimmed with `aria-busy="true"`, the strip selection moves at once, "Lädt …" appears in a polite status region after 1 s, and on arrival the status reads the day and `document.title` updates.

**Given** a booking whose current notice is not equal to its last-told notice (by `noticeEquals`)
**When** its row, table row or detail renders
**Then** it shows the text tag "HINWEIS GEÄNDERT" / "NOTICE CHANGED" in a 1 px text box, never as colour only.

**Given** a booking whose keybox email was accepted
**When** its row renders
**Then** line 2 shows muted "Code 4711" with the code taken from that row's send snapshot
**And** if that code differs from the current keybox code setting, the tag "ALTER CODE 4711" / "OLD CODE 4711" is shown instead.

**Given** the admin opens a booking detail (`/admin/booking/{id}`)
**When** it renders
**Then** it is capped at 640 px on laptops and shows a back link "‹ DI, 12. JANUAR" to that day (44 px hit area), eyebrow "DIENSTAG, 12. JANUAR", the time range as heading, and a definition list Name, E-Mail, Handy, Personen, Dauer, Schlüsselmail
**And** the email and mobile are shown as text and as `mailto:` / `tel:` links
**And** Schlüsselmail shows "verschickt Mo 16:00 · Code 4711" (accepted, code from the snapshot), "geplant Fr 17:15" (pending, with its due time) or "abgelehnt: {Grund}" (refused), and a status for `in_flight`, `transient_failure`, `expired` and `cancelled` per "Copy not yet in the UX catalogue"
**And** "Hinweis jetzt" and "Zuletzt gesagt" are side by side, each with state label, icon and notice text from the heat-state catalogue, with the change tag when they differ
**And** refused non-urgent emails (confirmation, good-news heat change) are listed with their reason
**And** an unknown id returns a not-found page; row ids appear only in admin routes.

**Given** an admin home with bookings today or tomorrow
**When** it renders
**Then** the `h2` "Nächste Buchungen" / "Next bookings" lists them as admin booking rows under sub-group labels "Heute · Di 12. Januar" and "Morgen · Mi 13. Januar" (`h3`, uppercase muted, first without top margin)
**And** with none, the empty line "Keine Buchungen an diesem Tag." is shown under each label.

**Given** future bookings that fall outside the current season or the current operating hours of their day (the core's derived flag, never stored)
**When** the admin home, the day view or booking detail renders
**Then** the admin home shows "{n} Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig." (singular variant for 1) with a link per booking, and the row and detail show the flag text
**And** future bookings with a refused non-urgent email appear as a separate flag on the admin home with a link to the booking
**And** the row/detail flag text, the refused-email label and home flag line, and the singular count variant are listed in "Copy not yet in the UX catalogue".

**Given** any admin day or detail page
**When** its data is loaded
**Then** deleted bookings are excluded, and the page works at 320 px, 200 % text and in both themes.

**Covers:** FR-16, FR-14, FR-20, NFR-7, UX-DR11, UX-DR13, UX-DR14, UX-DR17, UX-DR26, UX-DR34, UX-DR35, UX-DR36, UX-DR37, UX-DR38, UX-DR46, UX-DR52, UX-DR55, UX-DR60, UX-DR66, UX-DR75, AD-7, AD-9, AD-13, AD-20, AD-23, AD-24

### Story 3.3: Admin deletes a booking with an impact preview

As an operator,
I want to delete a guest's future booking after seeing exactly what it does to the booking behind it,
So that a cancellation never surprises the next guest without us knowing whether they get an email or need a call.

**Acceptance Criteria:**

**Given** a booking detail of a booking whose start time has not passed
**When** it renders
**Then** after a rule it shows the destructive button "Buchung löschen" (full width on phones, auto width on laptops)
**And** for a booking whose start time has passed it shows "Hat schon begonnen." / "Already started." and no delete button.

**Given** the admin taps "Buchung löschen"
**When** the impact dialog opens
**Then** it is a native `<dialog>` opened with `showModal()` on `surface` with a hairline border and 3 px corners over the scrim (near-black `scrim-dark` in dark mode), bottom-anchored full width with stacked buttons on phones and centred at most 480 px wide with side-by-side right-aligned buttons on laptops, scrolling inside within 90 dvh
**And** it shows the title "Buchung löschen?", the what line "Anna Meier · Di 12. Januar, 16:00–17:00", the impact mini row, then the destructive "Buchung löschen" and the secondary "Abbrechen"
**And** focus starts on "Abbrechen", focus is contained, the background is inert, Esc and a scrim tap cancel, `aria-labelledby` points to the title and `aria-describedby` to the consequence line, and on cancel focus returns to the trigger.

**Given** bookings 16:00–17:00 (Anna) and 17:15–18:15 (Tom, hot, last told "Schon heiss um 17:15."), changeover 15 min, pre-heat window 30–40 min, Tom's keybox email already accepted
**When** the dialog opens for Anna's booking
**Then** the impact mini row reads "Tom, 17:15:" with the heat-change line "HEISS → KALTSTART" (arrow `aria-hidden`, hidden text "wird zu"), "weniger als 24 h." with the marker *Anruf nötig*, and "Neuer Hinweis: komm zwischen 16:35 und 16:45."
**And** the impact is computed by the same core functions as the command (affected booking, notice, `classifyHeatChange` against its last-told notice, keybox phase).

**Given** the same bookings but Tom's keybox email not yet in flight or sent
**When** the dialog opens
**Then** the consequence reads "bekommt eine Mail." with the new notice.

**Given** a booking with no affected booking, or whose affected booking's `classifyHeatChange(lastTold, current)` would be `none`
**When** the dialog opens
**Then** the mini row reads "Kein Effekt auf andere Buchungen."

**Given** the dialog is open
**When** a new booking alters the impact, either while open or by the time the admin confirms (block and settings changes assert the same in Stories 3.5 and 3.7)
**Then** the delete command compares the posted impact token with the freshly computed one, refuses with `stale` and deletes nothing
**And** the dialog content is replaced with the new impact and "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." and focus moves to the dialog title
**And** the dialog titles, what lines and buttons in EN are listed in "Copy not yet in the UX catalogue".

**Given** the admin confirms and the impact is unchanged
**When** the delete command runs in one `BEGIN IMMEDIATE` transaction
**Then** it sets `deleted_at` on the booking (the row is never removed) and cancels its `pending` and `transient_failure` outbox rows
**And** it recomputes the affected booking's notice: if `classifyHeatChange(lastTold, current) ≠ none` and that booking is not in the keybox phase and its keybox row is not `in_flight`, it upserts exactly one open `heat_change` row due now + 10 min (resetting an existing open one); in the keybox phase it enqueues nothing and the change appears on the derived call list; with `none` it enqueues nothing
**And** the deleted booking's guest is not emailed automatically
**And** the deleted booking disappears from the guest calendar, admin day view, next bookings and any call-list entry at once, and its start time is offered again with its new heat state.

**Given** Jonas's booking Saturday 16 January 18:30 with 16:00–17:00 before it, last-told notice "Kaltstart: komm zwischen 17:50 und 18:00" and his keybox email not yet sent
**When** someone books 17:15–18:15 (which upserts an open `heat_change` row for Jonas, Story 2.3) and an admin deletes that booking 5 minutes later
**Then** the delete command upserts nothing for Jonas (his notice is back to the last-told one, `none`), and when the worker claims the open row it finds `classifyHeatChange = none`, sets it `cancelled`, sends no email, and `last_told_notice` is unchanged (FR-12: book-then-delete inside the settle delay sends nothing).

**Given** the delete succeeded
**When** the page updates
**Then** the admin sees the day view of that booking with focus on the page `h1`.

**Given** a booking whose start time passes while the dialog is open
**When** the admin confirms
**Then** the command refuses with `past`, nothing changes, and the dialog shows "Hat schon begonnen."

**Given** a booking already deleted by another admin
**When** this admin opens its detail or confirms its deletion
**Then** the view shows "Diese Buchung gibt es nicht mehr." / "This booking no longer exists." with a link back to the day, and nothing changes.

**Given** the request fails for any other reason
**When** the admin confirms
**Then** an inline error "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." appears at the item with focus on it, and the booking is unchanged.

**Covers:** FR-18, FR-12, FR-13, UX-DR6, UX-DR17, UX-DR24, UX-DR29, UX-DR30, UX-DR53, UX-DR55, UX-DR56, UX-DR66, UX-DR67, UX-DR72, UX-DR73, UX-DR75, UX-DR76, AD-2, AD-3, AD-4, AD-6, AD-20, AD-23, AD-24

### Story 3.4: Admin answers cancelled guests

As an operator,
I want a reminder to write personally to each guest whose booking I deleted, with a prepared email in their language,
So that every cancelling guest hears back from us and no admin answers twice.

**Acceptance Criteria:**

**Given** the admin has just deleted a booking
**When** the day view appears after the delete
**Then** a reply reminder for that guest is shown at the top: a dashed `line-strong` box with the guest name, muted "Di 12. Januar, 16:00–17:00 · gelöscht", the email as text and as a `mailto:` link (mail icon, 44 px hit area), the secondary buttons "Text kopieren" and "Erledigt".

**Given** deleted bookings matching `deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`
**When** the admin home renders
**Then** the `h2` "Antworten" / "Replies" with its count badge (1.5 px text box, min 24 px, tabular-nums) lists one reminder per booking, oldest deletion first
**And** with none, the section stays visible with "0" and "Keine offenen Antworten." / "No replies waiting."
**And** the nav badge shows the same count.

**Given** a reminder for a booking made in English
**When** the admin taps the email link
**Then** their mail program opens a new email to the guest with subject "Your sauna booking is cancelled" and the prepared body in English (EN body per "Copy not yet in the UX catalogue") with the guest's first name (the first whitespace-separated token of the Name as entered) and the deleted booking's weekday, date and start time; a German booking gets "Deine Sauna-Buchung ist gelöscht" and "Hallo Lena, wir haben deine Buchung vom Di 12. Januar, 18:00 gelöscht. …"
**And** subject and body come from the `messages/` catalogue rendered in the booking's stored locale, correctly URL-encoded, and the guest data appears only in this admin-only `mailto:` link.

**Given** a reminder
**When** the admin taps "Text kopieren"
**Then** the address, subject and body are copied to the clipboard and a polite status confirms it
**And** without clipboard access the text is shown selectable instead with a short hint (status and hint per "Copy not yet in the UX catalogue").

**Given** a reminder
**When** the admin taps "Erledigt"
**Then** the mark-reminder-done command sets `reply_done_at` (the only writer of that column) and the reminder disappears for every admin
**And** focus moves to the next reminder's heading, or to the "Antworten" heading if none is left, and a polite status says "Erledigt. Antworten: 0." with the new count
**And** the count badges update.

**Given** another admin already marked it done
**When** this admin taps "Erledigt"
**Then** nothing changes, the view refreshes and shows "Schon erledigt." / "Already done."

**Given** a deleted booking whose contact data has been purged
**When** reminders are listed
**Then** it no longer appears (email is NULL).

**Given** the command fails
**When** the admin taps "Erledigt"
**Then** the inline "Das hat nicht geklappt …" error appears at the reminder with focus on it and the reminder stays.

**Covers:** FR-31, FR-27, UX-DR23, UX-DR32, UX-DR33, UX-DR52, UX-DR55, UX-DR59, UX-DR66, UX-DR67, UX-DR69, UX-DR72, AD-2, AD-11, AD-13, AD-14, AD-20

### Story 3.5: Admin creates and deletes blocks

As an operator,
I want to block time for cleaning, maintenance or private use, and remove a block again, after seeing its effect on the next booking,
So that nobody can book while the wagon is unavailable and guests are told when a block changes their arrival time.

**Acceptance Criteria:**

**Given** the `block` table created in Story 1.3 (start, end, reason)
**When** this story is built
**Then** it adds no migration and no other block table exists
**And** given a block saved through the admin form, the guest calendar shows it as a taken row ("BELEGT", "bis 11:00") without its reason, the booking form and book command refuse an overlapping booking, and guest read queries never select block reasons (regression check: the block wiring from Stories 1.4 and 1.7 is reused, not rebuilt).

**Given** blocks exist
**When** the core computes heat state
**Then** no block heats the wagon whatever its reason: a booking starting right after a block (including private use) is a cold start, and no changeover is required after a block: the next kind-1 start time at or after the block end is offered (block ends create no kind-2 start times, e.g. a block ending 11:10 lets the next booking start at 11:30).

**Given** a signed-in admin on Blocks (`/admin/blocks`)
**When** it renders
**Then** it lists upcoming blocks (date, time range, reason; row format per "Copy not yet in the UX catalogue") in start order, each with a delete action, and a "Neuer Block" button
**And** with no upcoming blocks it shows "Keine Blocks geplant." / "No blocks planned." and the button
**And** the admin day view shows that day's blocks as rows with their reason.

**Given** the block form (`/admin/blocks/new`)
**When** it renders
**Then** it has date, start time and end time in 5-minute steps with visible labels, and the reason as a segmented control Reinigung · Wartung · Privat with native radios in a `fieldset`
**And** an empty field, an end not after the start, or a time not on a 5-minute step is refused inline with the value kept and focus on the first error (shared schema; form labels, EN reason labels and these validation messages per "Copy not yet in the UX catalogue").

**Given** a block whose start has already passed
**When** the admin taps "Prüfen" or saves
**Then** it is refused with `past` and nothing is saved.

**Given** bookings Mo 18:00–19:00 (Anna) and Mo 19:30–20:30 (Ben)
**When** the admin checks a block Mo 18:30–20:00
**Then** it is refused with "Dieser Block überschneidet 2 Buchungen: Mo 18:00 (Anna), Mo 19:30 (Ben). Blocks löschen keine Buchungen." and no booking is changed.

**Given** back-to-back bookings 17:00–18:00 and 18:15–19:15 (15-min changeover recorded on the later-made one)
**When** the admin checks a block 18:00–18:15 or any part of that gap
**Then** it is refused with "Zwischen diesen zwei Buchungen ist kein Platz für einen Block."

**Given** a cold-start booking at 18:00 with last-told notice "come between 17:20 and 17:30" (pre-heat 30–40 min)
**When** the admin checks a cleaning block 16:00–17:25
**Then** the impact dialog "Block speichern?" shows "Reinigung · Mo 11. Januar, 16:00–17:25", the mini row with the later earliest arrival ("Neuer Hinweis: komm zwischen 17:25 und 17:30.") and whether the guest "bekommt eine Mail." or needs a call (*Anruf nötig*), and the primary "Block speichern"
**And** a block without effect shows "Kein Effekt auf andere Buchungen."

**Given** the admin confirms "Block speichern" with an unchanged impact
**When** the create-block command runs in one exclusive transaction
**Then** it rechecks overlap, changeover gap and past against fresh state, inserts the block, and for the affected booking upserts one open `heat_change` row due now + 10 min only when `classifyHeatChange(lastTold, current) ≠ none` and the booking is not in the keybox phase and its keybox row is not `in_flight` (in the keybox phase the call list carries it)
**And** if the impact changed it refuses with `stale` and the dialog shows the new impact with "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal."
**And** after saving, the admin returns to Blocks with "Gespeichert." in a status message.

**Given** a booking-delete impact dialog (Story 3.3) is open for a booking whose affected booking this block changes
**When** the block is saved before the delete is confirmed
**Then** the delete command refuses with `stale` and the dialog shows the new impact.

**Given** an upcoming block
**When** the admin taps delete
**Then** the impact dialog "Block löschen?" shows "Reinigung · Mo 11. Januar, 09:00–11:00", the mini row (or "Kein Effekt auf andere Buchungen."), destructive "Block löschen" and "Abbrechen"
**And** confirming deletes the block, recomputes the affected booking per AD-6 (upserting only when `classifyHeatChange ≠ none`) and stale-checks the impact; a block whose start has passed cannot be deleted; a block already deleted by another admin shows "Schon erledigt."

**Covers:** FR-17, FR-18, FR-19, FR-4, FR-12, FR-13, UX-DR15, UX-DR19, UX-DR21, UX-DR22, UX-DR24, UX-DR25, UX-DR29, UX-DR30, UX-DR40, UX-DR52, UX-DR53, UX-DR56, UX-DR66, AD-1, AD-3, AD-6, AD-8, AD-16, AD-19, AD-26

### Story 3.6: Admin works the call list

As an operator,
I want a call list of every guest who must or may be phoned, with the exact notice to read out,
So that guests whose keybox email already went out, or whose email failed, still hear about changes before they arrive.

**Acceptance Criteria:**

**Given** the derived call list (AD-21)
**When** the admin home renders
**Then** the `h2` "Anrufliste" / "Call list" with its count badge lists one entry per non-deleted booking whose start time has not passed, *Anruf nötig* entries first, then by start time
**And** with none, the section stays visible with "0" and "Niemand muss angerufen werden." / "Nobody needs a call."

**Given** Tom (17:15, keybox email accepted, last told hot) becomes a cold start after the booking before him is deleted
**When** the call list renders
**Then** his entry has the `h3` "17:15 · Tom Brunner", the marker *Anruf nötig* (1.5 px error border and text), muted "Heute, Di 12. Januar", the heat-change line "HEISS → KALTSTART", "NEUER HINWEIS" over "Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.", muted "zuletzt gesagt: Schon heiss um 17:15.", a `tel:` link with phone icon and the number as text (44 px), and the secondary "Angerufen"
**And** on narrow screens link and button wrap instead of overflowing
**And** the call-list "NEUER HINWEIS" text uses the confirmation-badge catalogue text ("Kaltstart: komm zwischen … und heiz ein." / "Schon heiss um …"), while the impact mini row (Stories 3.3, 3.5, 3.7) uses the "Neuer Hinweis: komm zwischen …" line; both come from one notice value.

**Given** a keybox-phase booking whose heat change is good news (cold start → hot)
**When** the call list renders
**Then** its entry is marked *optional* (`line-strong` border, muted text).

**Given** a booking whose latest keybox row or latest urgent heat-change row is `refused` or `expired`, or whose keybox row is still not `accepted` 15 minutes after its due time, with `resolved_at` unset
**When** the call list renders
**Then** it is *Anruf nötig* with the reason ("Schlüsselmail abgelehnt", "Warnmail abgelehnt", or the lines for an expired keybox email, an overdue keybox email and an expired urgent heat-change email per "Copy not yet in the UX catalogue"), and keybox entries show the current keybox code to give ("Code durchgeben: 4711", same section)
**And** when both triggers apply to one booking there is one entry, marked *Anruf nötig*.

**Given** a booking whose keybox email has not been sent and that has a heat change
**When** the call list is derived
**Then** it does not appear (that change goes by email).

**Given** an entry whose notice changes back to its last-told notice before anyone calls
**When** the call list renders again
**Then** the entry is gone; an entry whose start time has passed is gone too.

**Given** an entry displayed with notice N
**When** the admin taps "Angerufen" and the current notice still equals N
**Then** the mark-called command writes N (from the posted canonical notice token) as `last_told_notice`, sets `resolved_at` on that booking's refused and expired rows and on a keybox row that is not yet `accepted` and more than 15 minutes past due, and the entry leaves the list for every admin
**And** resolving the overdue keybox row goes beyond AD-21 as written (refused and expired rows only); this is a deliberate amendment of AD-21 to be recorded in the architecture spine, and a resolved row never re-raises the entry (Story 2.4)
**And** focus moves to the next entry's heading or the "Anrufliste" heading, and a polite status says "Tom angerufen. Anrufliste: 0." with the new count; the nav badge updates.

**Given** the notice changed since the entry was displayed
**When** the admin taps "Angerufen"
**Then** the command refuses with `stale` and writes nothing; the entry re-renders with the new notice to give and "Der Hinweis hat sich inzwischen geändert. Gib bitte diesen neuen Hinweis durch.", with focus on that message.

**Given** the entry was already cleared by another admin or the booking was deleted
**When** the admin taps "Angerufen"
**Then** the view refreshes with "Schon erledigt." and nothing is written.

**Given** the command fails otherwise
**When** the admin taps "Angerufen"
**Then** the inline "Das hat nicht geklappt …" error appears in the entry with focus on it, and the entry is unchanged.

**Covers:** FR-13, FR-14, FR-21, UX-DR17, UX-DR23, UX-DR31, UX-DR33, UX-DR52, UX-DR53, UX-DR55, UX-DR66, UX-DR67, UX-DR69, UX-DR72, UX-DR73, UX-DR75, AD-6, AD-7, AD-21, AD-23, AD-24

### Story 3.7: Admin changes operating hours, changeover, horizon, pre-heat window, instructions, contact and password

As an operator,
I want to change the everyday settings myself, each with clear limits and a preview where guests are affected,
So that the calendar follows how we actually run the wagon without breaking existing bookings.

**Acceptance Criteria:**

**Given** a signed-in admin on Einstellungen (`/admin/settings`)
**When** it renders
**Then** it shows one `surface` card per group, each with a section-label heading, labelled fields, notes and its own secondary "Speichern": Betriebszeiten (Von · Bis), Wechselzeit (Minuten; "Gilt nur für neue Buchungen."), Buchungshorizont (Tage), Vorheizzeit (Kürzeste Zeit · Längste Zeit (Minuten)), Anleitung DE / EN (two textareas, 132 px min, vertical resize), Kontaktadresse (E-Mail), Passwort (Neues Passwort; "Alle anderen Admins werden abgemeldet.")
**And** paired values sit in two columns inside a card; cards stack with 20 px gap on phones and form two columns up to 1040 px on laptops
**And** each card prefills the current values (never the password).

**Given** out-of-range values
**When** the admin saves a card
**Then** the shared schema refuses them inline with the value kept, `aria-invalid`, and focus on the first error: changeover not 0–60 in 5-min steps → "Bitte eine Zahl von 0 bis 60, in 5er-Schritten."; a pre-heat end not 15–90 in 5-min steps → "Bitte eine Zahl von 15 bis 90, in 5er-Schritten."; shortest > longest → "Die kürzeste Zeit darf nicht länger sein als die längste."; horizon not 1–60 → "Bitte eine Zahl von 1 bis 60."; "Bis" not after "Von" → "„Bis“ muss nach „Von“ liegen."; empty required field → "Bitte ausfüllen."; invalid contact address → "Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie." (EN equivalents)
**And** nothing in that card is saved, and other cards are unaffected.

**Given** a valid save of any card
**When** the settings command commits
**Then** "Gespeichert." appears as an info message inside that card with `role="status"`.

**Given** the changeover is raised from 15 to 30 min
**When** it is saved
**Then** existing bookings keep their times, recorded changeover and heat states, no outbox rows are created and no emails are sent
**And** new offers and new bookings use 30 min (e.g. after a booking ending 18:00 the next kind-2 start time is 18:30).

**Given** operating hours are shortened from 10:00–22:00 to 12:00–21:00 while a booking 20:30–21:30 exists
**When** they are saved
**Then** no booking is deleted or changed, no outbox rows are created, the card shows the singular "1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig." (variant per "Copy not yet in the UX catalogue") with a link per flagged booking, and the admin home flag lists it
**And** the guest calendar offers start times only within the new hours.

**Given** the pre-heat window is changed from 30–40 to 40–50 min
**When** the admin taps "Speichern" on the Vorheizzeit card
**Then** the impact dialog "Vorheizzeit ändern?" shows "30–40 → 40–50 Minuten · {n} Buchungen bekommen eine neue Ankunftszeit" (singular variant for 1), where n counts future non-deleted bookings with `classifyHeatChange(lastTold, recomputed) ≠ none`, with primary "Speichern" and "Abbrechen"
**And** on confirm the command recomputes all future non-deleted bookings in one transaction (cold start 18:00: 17:20–17:30 → 17:10–17:20, an urgent earlier latest arrival) and, for each booking with `classifyHeatChange ≠ none`, upserts one `heat_change` row due now + 10 min if it is not in the keybox phase and its keybox row is not `in_flight`; keybox-phase bookings appear on the call list
**And** if n changed since the dialog opened, the command refuses with `stale`, the dialog shows the new count with "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal.", and nothing is saved.

**Given** a booking-delete impact dialog (Story 3.3) is open
**When** a pre-heat window change that alters that dialog's impact is saved before the delete is confirmed
**Then** the delete command refuses with `stale` and the dialog shows the new impact.

**Given** the horizon is changed from 14 to 21 days
**When** it is saved
**Then** the guest strip and booking acceptance extend to 21 calendar days from today, and no existing booking changes.

**Given** the access and return instructions (settings from Story 2.2) or the contact address (setting from Story 1.8) are saved
**When** the next keybox email is claimed
**Then** it uses the new instructions in the booking's language and the new address as `Reply-To`; the footer contact link uses the new address; already sent emails are not resent.

**Given** a new password is saved
**When** the change-password command commits
**Then** the new argon2 hash replaces the old one, every other `admin_session` row is deleted, the current admin stays signed in, and the password is never echoed or logged
**And** other admins see "Bitte melde dich wieder an." on their next request.

**Given** the save request fails
**When** the admin taps "Speichern"
**Then** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." appears in that card with focus on it.

**Covers:** FR-20, FR-15, FR-12, FR-13, NFR-7, UX-DR6, UX-DR21, UX-DR23, UX-DR25, UX-DR29, UX-DR30, UX-DR41, UX-DR55, UX-DR56, UX-DR57, UX-DR66, UX-DR75, AD-3, AD-6, AD-8, AD-9, AD-10, AD-14, AD-15, AD-16

### Story 3.8: Admin manages seasons and rotates the keybox code

As an operator,
I want to set the season dates, open next winter's season and change the keybox code,
So that guests can book the right days and every keybox email carries the code that opens the box.

**Acceptance Criteria:**

**Given** a current season, or a next season if none is current
**When** the admin opens Einstellungen
**Then** a Saison card shows Beginn · Ende of that season with "Speichern"
**And** saving edits that season row in place; bookings keep their `season_id`.

**Given** season end before or equal to start, an empty field, or dates overlapping another season row
**When** the admin saves the Saison card
**Then** it is refused inline ("Das Ende muss nach dem Beginn liegen.", "Bitte ausfüllen.", or the season overlap message per "Copy not yet in the UX catalogue") with values kept and focus on the first error.

**Given** the current season is shortened so that 2 future bookings fall after the new end
**When** it is saved
**Then** no booking is deleted, both stay fully valid, the card shows "2 Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig." with links, and the admin home flags them
**And** the guest calendar stops offering days after the new end.

**Given** the last season has ended and no later season exists
**When** the admin opens Einstellungen
**Then** the Saison card shows the ended season read-only and a button "Nächste Saison anlegen" (EN label and the read-only label per "Copy not yet in the UX catalogue")
**And** submitting start and end creates a new season row; past season rows are kept unchanged
**And** the guest calendar switches from the after-season state to the before-season state with the new dates.

**Given** the Schlüsselbox-Code card
**When** the admin saves a new code (empty → "Bitte ausfüllen.")
**Then** the code setting is replaced, "Gespeichert." appears, the note reads "Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben.", no outbox rows are created and no email is resent
**And** every keybox email claimed afterwards snapshots and sends the new code.

**Given** 3 upcoming bookings whose accepted keybox emails carried the old code 4711
**When** the card renders after the change
**Then** it lists "3 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:" with one link per booking ("Di 12. Januar, 17:15 · Tom Brunner") to booking detail
**And** the list shrinks as their start times pass and disappears when empty; codes come only from the send snapshots
**And** after a second change, bookings with any code other than the current one are listed, grouped by their old code (group heading per "Copy not yet in the UX catalogue").

**Given** a save request fails
**When** the admin saves either card
**Then** the inline "Das hat nicht geklappt …" error appears in that card with focus on it.

**Covers:** FR-20, FR-1, FR-11, UX-DR34, UX-DR41, UX-DR55, UX-DR57, UX-DR61, UX-DR66, AD-4, AD-23, AD-25

## Epic 4: Guest data is protected and the season is recorded

From the first booking an anonymous analytics record is kept for every booking and every passed day, and every guest's name, email and mobile number are deleted automatically 30 days after their season ends. Both are idempotent worker jobs (AD-5) that catch up after downtime.

### Story 4.1: An anonymous analytics record is kept for every booking

As an operator,
I want an anonymous record of every booking and every passed day kept from the first booking on,
So that we can answer the April questions without keeping anyone's personal data.

**Acceptance Criteria:**

**Given** this story's migration
**When** it runs
**Then** tables `analytics_booking` (unique on booking id) and `analytics_day` (unique on date) exist with no name, email or mobile column
**And** `analytics_booking` also stores `start_kind` (1, 2 or 3), computed by the core at snapshot time from the day's non-deleted bookings: 1 if the start is on the full or half hour, else 2 if it starts exactly the booking's recorded changeover after another booking ends, else 3; Story 6.2 uses it so both sides of FR-25 count only kind-1 and kind-2 start times
**And** `GUEST_KEY_SECRET` is read only in `src/lib/server/env.ts`, and the app refuses to start without it (dev uses the `.env.example` value from Story 1.1; tests inject their own secret).

**Given** a non-deleted booking whose start time has passed and that has no analytics record
**When** the worker tick runs its scheduled jobs
**Then** the snapshot-analytics command writes one `analytics_booking` row with `season_id`, Zurich-local date, start `hhmm`, weekday and ISO week from `src/lib/time`, duration, party size, heat state at start, the booking's recorded changeover, and the guest key HMAC-SHA256(trimmed lowercased email, `GUEST_KEY_SECRET`)
**And** no plain hash of the email is stored anywhere.

**Given** bookings at 18:00 local on 27 and on 28 March 2027 (summer time starts in the night to 28 March)
**When** their records are written
**Then** the local date, `hhmm`, weekday and ISO week match Europe/Zurich wall-clock on both sides of the summer-time switch (unit-tested).

**Given** a booking deleted before its start time
**When** the job runs
**Then** it never gets an analytics record.

**Given** the same guest email in different case or with surrounding spaces on two bookings
**When** their records are written
**Then** both carry the same guest key.

**Given** a season day has passed and has no day record
**When** the job runs
**Then** it writes one `analytics_day` row with `season_id`, the operating hours in force at snapshot time, the day's blocks (times and reason), and every kind-1 or kind-2 start time that passed unbooked with its heat state, computed by the core with the settings in force at snapshot time
**And** "passed unbooked" is defined as: each kind-1 or kind-2 start time that the core offer function returns with at least one duration when evaluated with `now` set just before that start time, using the day's final non-deleted bookings and blocks and the settings at snapshot time; its heat state is the one returned at that point
**And** start times covered by a booking or block, or with no fitting duration (e.g. 16:00 before a 17:00 booking), are not counted as unbooked
**And** a unit test covers a day with a booked time, a blocked time and a time with no fitting duration, none of which is counted.

**Given** the app was down for two days
**When** it comes back and the worker ticks
**Then** all missing booking and day records are written once, in a catch-up, using settings current at snapshot time (accepted limitation)
**And** running the job again writes nothing new and raises no error (unique keys, insert-if-absent).

**Given** analytics records exist
**When** a booking is later purged or a setting changes
**Then** the records are unchanged, are never purged, and logs contain only row ids and counts.

**Covers:** FR-30, NFR-3, NFR-8, AD-5, AD-9, AD-12, AD-19, AD-22, AD-25

### Story 4.2: Personal data is purged automatically

As a guest,
I want my name, email and mobile number deleted automatically after the season,
So that the operators keep my data no longer than the privacy statement promises.

**Acceptance Criteria:**

**Given** a booking (deleted or not) in a season ending 31 March 2027
**When** the worker tick runs its scheduled jobs on or after 30 April 2027 (max(booking start, season's current end) + 30 days)
**Then** the purge command sets that booking's name, email and mobile to NULL and changes nothing else on the row.

**Given** a booking whose start lies after its season's current end (season shortened later)
**When** the purge time is computed
**Then** it is the booking start + 30 days, not the season end + 30 days.

**Given** a season end extended after bookings were made
**When** the purge time is computed
**Then** it uses the season's current end.

**Given** a deleted booking with an open reply reminder
**When** it is purged
**Then** the reminder disappears from admin home and the nav count drops (email is NULL).

**Given** purged bookings
**When** an admin views them on the day view or booking detail
**Then** the contact fields show the placeholder "gelöscht" / "deleted" (per "Copy not yet in the UX catalogue") without errors, and no `mailto:` or `tel:` links are rendered.

**Given** the purge already ran for a booking, or the app was down past its purge time
**When** the job runs
**Then** already purged bookings are skipped, overdue ones are purged in the catch-up, and repeated runs change nothing.

**Given** a purge run
**When** it completes
**Then** analytics records are untouched, outbox rows (which hold no contact data) are unaffected, and the log line contains only the count of purged bookings.

**Covers:** FR-28, FR-29, NFR-8, AD-5, AD-18, AD-20, AD-25

## Epic 5: Sauna Luegisee goes live on sauna-luegisee.ch

The app runs on its own Infomaniak VPS behind Caddy with HTTPS, is built on the box without endangering the running app, sends authenticated email from sauna-luegisee.ch, is backed up nightly to Swiss Backup with a tested restore that includes the env secrets, and is hardened so it can sit idle for months and come back on its own. A launch readiness check makes sure no setting or operator text is still missing or at its placeholder before guests are let in. No FR is delivered directly; this epic makes Epics 1–4 reachable by real guests and keeps their data safe (NFR-5, NFR-6, NFR-7, NFR-8, NFR-9).

### Story 5.1: The app runs on the VPS behind Caddy with HTTPS

As an operator,
I want the app running on its own VPS at https://sauna-luegisee.ch, built and restarted on the box,
So that guests can reach the calendar over HTTPS and the app survives builds and reboots without anyone touching it.

**Acceptance Criteria:**

**Given** the domain sauna-luegisee.ch is registered and a dedicated Infomaniak VPS Lite (1 vCPU, 2 GB RAM, 20 GB) is provisioned for this app only
**When** the operator sets the domain's A record (and AAAA, if IPv6 is used) to the VPS address
**Then** `sauna-luegisee.ch` resolves to the VPS from public resolvers before Caddy is started
**And** the host firewall accepts only SSH, 80 and 443 from outside; port 3000 is not reachable from the internet

**Given** the repository's `Dockerfile`, `docker-compose.yml` and `Caddyfile`
**When** `docker compose up -d --build` runs on the VPS with Docker Compose 5.7.0
**Then** a `caddy` service (`caddy:2.11.9-alpine`) publishes 80 and 443, obtains a certificate for sauna-luegisee.ch automatically, stores certificate data on a persistent volume, and reverse-proxies to `app:3000` on the internal compose network
**And** the `app` service runs a multi-stage image on `node:26.13.0-alpine3.24`, installed with `npm ci` from the committed lockfile, running as a non-root user, exposing port 3000 only on the compose network, with the SQLite database on a named volume and a memory limit whose value is pinned in `docker-compose.yml`

**Given** the site is up
**When** a browser opens `http://sauna-luegisee.ch/` or `https://sauna-luegisee.ch/admin`
**Then** plain HTTP is redirected to HTTPS and the admin login is only ever served over HTTPS
**And** the guest calendar loads with a valid certificate and `kit.paths.origin` is `https://sauna-luegisee.ch` (no `ORIGIN` env), so form actions are not rejected as cross-origin

**Given** Caddy's default logging
**When** guests and admins use the site
**Then** Caddy writes no access logs (no client addresses or URLs per request), and the app logs never contain name, email, mobile, keybox code or password

**Given** the host has a 2 GB swapfile enabled and persisted in `/etc/fstab`
**When** a new image is built on the VPS while the current app container keeps serving
**Then** the build completes without the kernel OOM-killing the running app (`docker inspect` shows `OOMKilled: false`, the app keeps answering during the build)
**And** switching to the new image (`docker compose up -d`) restarts only `app`, runs pending database migrations per the scaffold's migration workflow, and the database volume is untouched

**Given** both services declare a restart policy and the Docker daemon is enabled at boot
**When** the VPS is rebooted
**Then** `caddy` and `app` come back without manual steps and the calendar is reachable again

**Given** the secrets mechanism is decided at this deploy (either a `.env` file owned by root with mode 600, or compose secrets) and written down in the repository's deploy notes
**When** the app starts
**Then** `src/lib/server/env.ts` receives `DATABASE_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and `GUEST_KEY_SECRET`, the Dockerfile sets `NODE_ENV=production` (the production switch from Story 1.1), and secrets are not committed to git nor baked into the image
**And** `GUEST_KEY_SECRET` is generated once from a cryptographic random source (≥ 32 bytes), stored in the operators' password manager on the same day, and never regenerated (AD-22)
**And** the app refuses to start with a clear log line if a required variable is missing, rather than running with an empty secret

**Given** the app reads the client address from Caddy's forwarded header (`ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`)
**When** someone enters 5 wrong admin passwords from one address
**Then** the rate limit applies to that guest's real address and not to Caddy's internal address, so other admins on other addresses can still sign in

**Given** a fresh production database
**When** the operator runs `docker compose exec app npm run set-admin-password` (Story 3.1) once and types the shared password at the prompt
**Then** an argon2 hash of the shared password is stored, the plain password is not left in any env file, shell history or log, and sign-in at `/admin/login` works over HTTPS
**And** if the command is run again on a database that already has a password, it refuses instead of silently overwriting it (only `--reset` replaces it)

**Given** the app is deployed and reachable
**When** the operators consider opening it to guests (sharing the link, announcing the season)
**Then** they do so only after the launch readiness check (Story 5.5) runs clean on the VPS; until then the site is up but not announced

**Covers:** NFR-7, NFR-8, NFR-9, AD-10, AD-11, AD-17, AD-22, Additional Requirements (Deployment, Logging, Before first public deploy: A record, secrets mechanism, memory limit)

### Story 5.2: Emails reach mailboxes from sauna-luegisee.ch

As a guest,
I want the confirmation, keybox and heat-change emails to arrive in my inbox from a Sauna Luegisee address,
So that I get my keybox code and arrival time instead of finding them in spam or not at all.

**Acceptance Criteria:**

**Given** the operators have chosen the sender address (PRD OQ1, e.g. an address on sauna-luegisee.ch) and recorded the choice in the deploy notes
**When** the mailbox for it is set up in Infomaniak Mail Service on the domain
**Then** the app's `MAIL_FROM` is that address with From name "Sauna Luegisee", and `SMTP_HOST=mail.infomaniak.com`, `SMTP_PORT=587` (STARTTLS) and the SMTP user and password are set through the mechanism from Story 5.1

**Given** the DNS zone of sauna-luegisee.ch
**When** the operator publishes the mail records
**Then** an SPF record authorises Infomaniak's senders and ends in a fail or softfail qualifier, DKIM signing is enabled at Infomaniak with its public key published, and a DMARC record is published for the domain
**And** a received test message shows `spf=pass`, `dkim=pass` and `dmarc=pass` with the From domain aligned in its `Authentication-Results` header

**Given** production is configured
**When** a test booking is made in German and another in English with addresses at Gmail, Outlook.com, iCloud, Bluewin and GMX
**Then** the confirmation and keybox emails for each land in the inbox, not the spam or junk folder, in the booking's language, with HTML and plain-text parts
**And** a heat-change email triggered by creating or deleting a block next to a test booking also lands in the inbox
**And** replying to any of them addresses the admin contact address from settings (`Reply-To`)
**And** the test bookings are deleted afterwards via the admin portal

**Given** a mailbox places a test email in spam
**When** the operator checks the headers and the DNS records
**Then** the cause is fixed (missing or misaligned record, content trigger) and the test is repeated for that provider until it reaches the inbox, or the remaining risk is written down in the deploy notes

**Given** a wrong SMTP password is configured by mistake
**When** the worker tries to send
**Then** the failure is logged by outbox row id without guest data, the rows follow the Epic 2 outbox rules (not silently dropped), the worker keeps ticking and recording its heartbeat, and sending resumes once the credentials are corrected

**Given** a local development run (`NODE_ENV` not `production`, per Story 1.1)
**When** the app sends email
**Then** it uses the local sink or log transport and never the production SMTP server, even if production-like env values are present

**Covers:** NFR-5, FR-10, FR-11, FR-12, FR-27, AD-15, AD-23, Additional Requirements (Email transport, Before first public deploy: sender address, SPF/DKIM/DMARC)

### Story 5.3: Nightly backups go to Swiss Backup with a tested restore

As an operator,
I want the bookings backed up off the server every night and a restore proven before the season opens,
So that a dead VPS or a bad mistake never loses a guest's booking or the secret that ties analytics together.

**Acceptance Criteria:**

**Given** the database runs in WAL mode with a busy timeout
**When** the nightly host cron job runs `scripts/backup.sh`
**Then** it takes a consistent online backup with the SQLite backup API or `VACUUM INTO` while the app keeps serving, without stopping the app and without blocking app writes beyond the busy timeout
**And** it runs `PRAGMA integrity_check` on the copy and refuses to upload a copy that fails

**Given** a good local copy
**When** the script uploads it with `rclone` or `s3cmd` (not the AWS CLI) to the Infomaniak Swiss Backup S3 endpoint in Switzerland
**Then** the object is named with its date, the upload credentials are readable only by root on the host, and a failed upload exits non-zero with a log line and never deletes or overwrites the last good remote copy

**Given** backups accumulate
**When** the script finishes
**Then** at most a small fixed number of local copies (e.g. 2) remain on the VPS disk, so backups never fill the app's 20 GB disk
**And** remote copies older than a fixed retention period are removed, so personal data purged under FR-28 disappears from Swiss Backup at most that period after the purge; the period is written in the deploy notes for the operators' privacy statement
**And** the privacy statement (`/privacy`, Story 1.9) must say how long purged personal data can remain in off-box backups, using this period

**Given** the env secrets (`GUEST_KEY_SECRET`, SMTP password and the others)
**When** they are set or changed
**Then** an encrypted copy (e.g. `age` or `gpg` with a passphrase held in the operators' password manager) is uploaded alongside the database backups, and the secrets themselves are also stored in the operators' password manager
**And** the plain secrets never leave the VPS unencrypted

**Given** the backup job fails one night (no network, Swiss Backup down, disk full)
**When** the next night's run succeeds
**Then** the remote store again holds a copy no older than one day, and the failed night left no half-written object that a restore could pick up by mistake

**Given** a clean machine (a second VPS or a laptop) before the season opens
**When** the operator follows the restore steps in the deploy notes: download the latest database backup and the encrypted secrets, decrypt the secrets with the passphrase from the password manager, start the app with them
**Then** the restored app shows the same bookings, blocks, settings, seasons and analytics records as production, an admin can sign in with the current shared password, and the HMAC guest key computed for a known test email matches the stored analytics guest key
**And** the date of the successful restore test is recorded in the deploy notes, and the test copy is destroyed afterwards because it holds personal data

**Covers:** NFR-6, FR-24, FR-28, AD-18, AD-22, AD-25, Additional Requirements (Backups and secrets)

### Story 5.4: The server is ready for quiet months

As an operator,
I want the server hardened, patched on a plan and able to recover on its own,
So that the app can sit idle between seasons and still be safe and working when guests return.

**Acceptance Criteria:**

**Given** the CSP is configured through SvelteKit's `kit.csp` (hash or nonce mode), so SvelteKit's own inline hydration scripts are covered per page, with the inline theme script's hash added there; `Strict-Transport-Security`, `X-Content-Type-Options` and `Referrer-Policy` are set in exactly one place (Caddy or `hooks.server.ts`, not both)
**When** any guest or admin page is served
**Then** responses carry `Strict-Transport-Security`, a CSP with `frame-ancestors 'none'`, `default-src 'self'`, no third-party origins and no `'unsafe-inline'` for scripts, with the inline theme script allowed by its hash (UX-DR10), plus `X-Content-Type-Options: nosniff` and a restrictive `Referrer-Policy`
**And** no CSP header is set by Caddy
**And** guest day view, booking form, confirmation, admin home, impact dialog and settings work in current iOS Safari, Android Chrome and desktop browsers with no CSP violations in the console, and the theme is still applied before first paint with no flash

**Given** the inline theme script changes
**When** the build or test suite runs
**Then** a check fails if the CSP hash no longer matches the script, so a changed script never ships blocked

**Given** both services log to stdout/stderr
**When** the app runs for months
**Then** Docker log rotation in `docker-compose.yml` caps each service's logs at a fixed size and file count, so logs cannot fill the disk

**Given** the 20 GB disk holds images, volumes, logs and local backups
**When** the nightly backup script runs
**Then** it also checks disk usage and logs a warning line when usage passes a set threshold (e.g. 80 %), and the deploy notes include pruning old images after a rebuild

**Given** a patching plan is written in the deploy notes
**When** the plan is followed
**Then** host OS security updates install automatically (e.g. unattended upgrades) with any needed reboot covered by the reboot criterion below
**And** base images (`node:26.13.0-alpine3.24`, `caddy:2.11.9-alpine`) are bumped and rebuilt before each season opens and whenever a critical security advisory affects Node, Caddy or Alpine (the trigger), with the pinned tags updated in the repository

**Given** the VPS reboots unattended
**When** it comes back
**Then** `caddy` and `app` start without manual steps, the worker starts once, records a heartbeat within a few minutes, and keybox emails that became due during the downtime are sent late up to the start time (FR-11, NFR-9)
**And** the certificate is reused from the persistent volume rather than requested again

**Given** Caddy manages the certificate
**When** it approaches expiry during a quiet month
**Then** Caddy renews it automatically with no operator action, verified by the certificate's validity dates after renewal or Caddy's renewal log

**Given** a restored copy of the database from Story 5.3 running locally
**When** the `worker_heartbeat` time is set more than 5 minutes into the past and admin home is opened
**Then** admin home shows the worker warning, and the warning disappears after the worker's next tick records a fresh heartbeat (AD-5)

**Covers:** NFR-7, NFR-8, NFR-9, FR-11, UX-DR10, UX-DR46, UX-DR76, AD-5, AD-11, AD-17, Additional Requirements (Before first public deploy: security headers/CSP, OS patching, Docker log rotation)

### Story 5.5: Launch readiness check

As an operator,
I want one check that lists every setting and text still missing or left at its placeholder,
So that no guest gets a keybox email without a code or reads a privacy statement without our contact.

**Acceptance Criteria:**

**Given** the readiness function in `src/lib/server` (reading settings and seasons via `db/queries`, the message catalogues and the values from `src/lib/server/env.ts`)
**When** it runs
**Then** it returns one item for each of these that applies: keybox code empty; access and return instructions empty in DE or in EN; admin contact address empty or still the seeded placeholder `platzhalter@sauna-luegisee.ch` (Story 1.8); any `/info`, `/privacy` or `/imprint` message in DE or EN still containing the `[PLATZHALTER]` marker (Story 1.9); season dates still equal to the seeded placeholder season (Story 1.3) and not confirmed; operating hours still equal to the seeded 10:00–22:00 and not confirmed; no admin password hash set (Story 3.1); in production, `GUEST_KEY_SECRET` missing or equal to the dev-only value from `.env.example`, or any `SMTP_*` or `MAIL_FROM` value missing
**And** no item ever contains a secret value, the keybox code or the password
**And** unit tests cover each item and the clean case

**Given** a seeded value that is actually right (e.g. the operators really open 10:00–22:00)
**When** an admin saves the Betriebszeiten card or the Saison card, even unchanged
**Then** that value counts as confirmed: this story's migration adds nullable `setting.hours_confirmed_at` and `season.confirmed_at`, the seed leaves them NULL, the settings commands from Stories 3.7 and 3.8 set them on every save, and a season created with "Nächste Saison anlegen" is confirmed at creation

**Given** a shell on the dev machine or on the VPS (`docker compose exec app npm run readiness`)
**When** `npm run readiness` runs
**Then** it prints each open item on its own line and exits 1, or prints that everything is ready and exits 0

**Given** a signed-in admin with at least one open item
**When** the admin home renders
**Then** an error inline message at the top lists the open items, each linking to the settings card that fixes it where one exists (env and operator-text items name what to change instead), and it disappears once the check is clean (heading and item lines per "Copy not yet in the UX catalogue")

**Given** the first public deploy (Story 5.1) and every later season opening
**When** the operators prepare to open the site to guests
**Then** `npm run readiness` exits 0 on the VPS first, and the date of that clean run is recorded in the deploy notes

**Covers:** FR-11, FR-20, FR-29, NFR-7, UX-DR25, UX-DR46, UX-DR66, AD-2, AD-21, Additional Requirements (Before first public deploy)

## Epic 6: Operators see the season analytics

The operators answer the four April questions from the analytics records: when to clean, how much wood is burned, whether it is worth repeating, and whether cold starts stay empty. Admin views at `/admin/analytics` read only the analytics tables written since the first booking (FR-30), so the figures survive the FR-28 purge and do not change when settings change. May ship during the season.

### Story 6.1: Analytics page with season selector: when to clean and how much wood

As an operator,
I want an analytics page that shows when the wagon is used and how many fires were lit, per season,
So that we can plan cleaning and buy wood from numbers, not memory.

**Acceptance Criteria:**

**Given** a signed-in admin
**When** they open the "Auswertung" / "Analytics" tab
**Then** `/admin/analytics` shows an `h1`, a season selector at the top, and one analytics panel per question, with the admin nav marking "Auswertung" as active (`aria-current="page"`)
**And** without a session the route redirects to sign-in like every other admin route

**Given** several season rows exist
**When** the page loads without a season chosen
**Then** the current season is selected, or the most recent past season if none is current; choosing another season reloads the page for it with the season in the URL, so Back works and the choice can be bookmarked
**And** an unknown season in the URL shows the default season instead of an error page

**Given** the analytics panel component
**When** it renders a question
**Then** the heading is the question in plain words in slot-time type, followed by a one-line reading in body type, then bars as text-colour blocks with each value printed beside its bar (`aria-hidden`), backed by a real table (`<th scope>`) holding the same numbers for screen readers
**And** cold-start figures use the cold-start colour plus the snowflake and hot figures the hot colour plus the flame, never colour alone; under forced colours the bars and labels stay readable

**Given** analytics booking records for the selected season
**When** the panel "Wann sollen wir putzen?" / "When should we clean?" renders
**Then** it shows bookings and booked hours by weekday (Monday to Sunday), by hour of day, and by week of the season (FR-22)
**And** bookings count by their start hour, booked hours count in each clock hour they cover, both computed only from the stored local `hhmm`, duration and weekday columns, so a 28 March 2027 booking needs no time-zone conversion
**And** weeks are ordered by date and labelled with their start date (e.g. "ab Mo 4. Januar"), so a season running across New Year never sorts ISO week 1 before week 52
**And** its one-line reading names the busiest weekday and hour (e.g. "Am meisten los: Samstag ab 17 Uhr.")

**Given** analytics booking records for the selected season
**When** the panel "Wie viel Holz verbrennen wir?" / "How much wood are we burning?" renders
**Then** it shows cold-start bookings per week and the season total, labelled "Schätzung der angezündeten Feuer" / "Estimate of fires lit" (FR-23), using the heat state stored at each booking's start time

**Given** the page computes its figures
**When** queries run
**Then** they read only `analytics_booking` and `analytics_day` filtered by `season_id` and never the `booking`, `block` or `setting` tables, so purged personal data and later settings changes do not alter the figures (AD-12)

**Given** a season with no analytics records yet
**When** a panel renders
**Then** it shows "Noch keine Daten für diese Saison." / "No data for this season yet." instead of empty bars or a table of zeros

**Given** a 360 px phone and a laptop ≥ 1024 px
**When** the page is opened
**Then** on the phone panels stack in one column with no horizontal page scrolling (tables may scroll inside their panel), and on the laptop panels sit side by side within the 1040 px admin width
**And** all text is in the active language (DE default, EN alongside) in the plain voice, with any German fallback wrapped in `lang="de"`; the readings, week label, season selector label and figure/table headers are listed in "Copy not yet in the UX catalogue"

**Covers:** FR-22, FR-23, FR-30, AD-12, AD-25, UX-DR3, UX-DR4, UX-DR7, UX-DR12, UX-DR42, UX-DR46, UX-DR50, UX-DR55, UX-DR66, UX-DR71, UX-DR73, UX-DR74, UX-DR75, NFR-3

### Story 6.2: Is it worth repeating, and do cold starts stay empty

As an operator,
I want the season's totals, repeat guests, empty hours and the cold-start comparison on the analytics page,
So that we can decide whether to run the wagon again and whether cold starts put guests off.

**Acceptance Criteria:**

**Given** analytics records for the selected season
**When** the panel "Lohnt sich das?" / "Is this worth repeating?" renders
**Then** it shows the number of bookings, booked hours, unique guests, the share of guests who booked more than once, and the share of bookable hours that stayed empty (FR-24)
**And** unique guests count distinct stored HMAC guest keys, and the repeat share is guests with two or more bookings divided by unique guests; no email or contact data is read

**Given** each analytics day record holds its operating hours and blocks
**When** the empty share is computed
**Then** bookable time per day is the operating hours in force that day minus its blocks, used time is each booking's duration plus the changeover recorded on that booking after it, clipped to the bookable time of that day, and the empty share is bookable minus used over bookable
**And** a changeover that would run past the end of operating hours or into a block is not counted twice or outside bookable time
**And** a day with no bookable time (fully blocked) adds nothing and causes no division by zero

**Given** analytics day records with unbooked kind-1 and kind-2 start times and their heat state, and analytics booking records with their heat state
**When** the panel "Bleiben Zeiten leer, weil sie Kaltstarts sind?" / "Are times left empty because they are cold starts?" renders
**Then** it shows the count of start times that passed unbooked, split hot and cold start, next to the same split for booked start times (FR-25), each passed start time counted once
**And** the booked side counts only analytics booking records with `start_kind` 1 or 2 (Story 4.1), so both sides cover the same kinds of start time
**And** the one-line reading compares how often each kind was booked, e.g. "Kaltstart-Zeiten wurden etwa halb so oft gebucht wie heisse." / "Cold-start times were booked about half as often as hot times.", rounded to a plain phrase, never a raw percentage alone

**Given** the selected season has records but one side of the comparison is empty or too small to say anything (e.g. no hot start times at all, or fewer than a set minimum per side)
**When** the FR-25 panel renders
**Then** the table still shows the counts and the reading says plainly that there is not enough data yet for a comparison, instead of a misleading ratio or a division by zero

**Given** a season with no analytics records yet
**When** either panel renders
**Then** it shows "Noch keine Daten für diese Saison." / "No data for this season yet."

**Given** the panels use the analytics panel component from Story 6.1
**When** they render on a phone and a laptop
**Then** cold-start figures carry the snowflake and cold-start colour and hot figures the flame and hot colour, every bar is backed by the table, and percentages are shown with a real number and unit beside each bar
**And** every new string (readings, insufficient-data line, figure labels; listed in "Copy not yet in the UX catalogue") exists in `messages/` in German and English in the plain voice

**Covers:** FR-24, FR-25, FR-30, AD-12, AD-22, UX-DR3, UX-DR7, UX-DR42, UX-DR50, UX-DR55, UX-DR66, UX-DR75
