---
stepsCompleted: [1, 2]
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

**Starter template — shapes Epic 1 Story 1.** The project is greenfield. Scaffold with SvelteKit 3 via `sv create` (TypeScript), then `sv add paraglide` (locales `de` base + `en`), with `@sveltejs/adapter-node`, Drizzle ORM + drizzle-kit on better-sqlite3, Vitest, ESLint with the import-boundary rules (AD-1, AD-2), and the source tree from the Structural Seed (`src/lib/{domain,time,schemas,paraglide,server/{env.ts,db,db/queries,commands,worker,mail}}`, `src/routes/(guest)`, `src/routes/admin`, `messages/de.json|en.json`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `eslint.config.js`, `scripts/backup.sh`). Scaffold-time decisions to settle in that story: instant storage form (ISO text or epoch ms, used everywhere incl. notice JSON), validation schema library, initial admin password bootstrap (seed command or first-run env), drizzle-kit migration workflow.

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
The app runs on its own Infomaniak VPS behind Caddy with HTTPS, is built on the box safely, is backed up nightly to Swiss Backup with a tested restore, and is hardened for months of idle time.
**FRs covered:** none directly (enables all); **NFRs mainly addressed:** NFR-5, NFR-6, NFR-7, NFR-9

### Epic 6: Operators see the season analytics
The four April questions as admin views over the analytics records. May ship during the season.
**FRs covered:** FR-22, FR-23, FR-24, FR-25

Launch scope (mid-December 2026): Epics 1-5. Epic 6 follows during the season.

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic {{N}}: {{epic_title_N}}

{{epic_goal_N}}

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story {{N}}.{{M}}: {{story_title_N_M}}

As a {{user_type}},
I want {{capability}},
So that {{value_benefit}}.

**Acceptance Criteria:**

<!-- for each AC on this story -->

**Given** {{precondition}}
**When** {{action}}
**Then** {{expected_outcome}}
**And** {{additional_criteria}}

<!-- End story repeat -->
