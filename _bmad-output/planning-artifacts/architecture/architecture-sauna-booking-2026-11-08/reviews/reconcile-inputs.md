---
review: reconcile-inputs
target: ../ARCHITECTURE-SPINE.md (+ .memlog.md)
inputs:
  - ../../../prds/prd-sauna-booking-2026-11-08/prd.md
  - ../../../ux-designs/ux-sauna-booking-2026-11-08/EXPERIENCE.md
  - ../../../architecture-inputs.md
date: 2026-11-08
summary: 0 critical, 7 high, 8 medium, 10 low
---

# Reconcile: spine vs inputs

Scope: requirements or quiet constraints that the spine does not govern (AD or convention), does not defer, and cannot safely leave to the code because two independent builders could diverge. Contradictions between the spine and its inputs, or inside the spine, are included. Pure UI detail with no cross-unit risk is left out.

Already covered and not flagged: heat-state derivation, outbox, settle delay and recheck, the keybox-email stop, last-told notice ownership, the 24-hour cutoff in real time, DST, cookies plus theme in `localStorage`, the HTML and plain-text email with `lang`/`Content-Language`, the i18n catalog including the FR-31 text, retention as a worker job, off-box backups and restore test, Caddy auto HTTPS and restart after reboot, unguessable confirmation ids, no PII in logs, and the beehive backup-retention lesson (AD-18 plus Deferred).

---

## High

### H1. Where guest contact details live across a conflict, a language switch and a second booking is never decided, and the spine's own convention contradicts AD-11 and AD-13

- **Input:** EXPERIENCE.md, Component Patterns, Text field ("Name, email and mobile are kept for this browser session only, so a conflict or a second booking does not re-ask"). Also App header ("Switching reloads the same page in the other language, keeps the current day and form input") and State Patterns, Conflict on submit. PRD FR-6 ("keeps the entered contact details").
- **Problem:** The Form action errors convention says a booking conflict "redirects to the refreshed day with an error message key, keeping contact details". A SvelteKit redirect cannot carry `fail()` values. The only server-side ways to carry them are a cookie or flash session (AD-11 allows exactly two cookies), the URL (AD-13 forbids guest data in URLs) or a server-side guest session (that needs a third cookie). The only compliant option is client-side `sessionStorage`, which needs JavaScript. The spine does not say whether the guest flow must work without JS. One builder will add a flash cookie, another will use `sessionStorage`, a third will render the day inside the form action's `fail()` response. The language-switch requirement to keep form input hits the same gap.
- **Fix:** Add a convention or extend AD-11. Guest contact details persist only in the browser's `sessionStorage` (no cookie, no server copy, no URL). The booking form fills from it, and the details are written on input and on submit. A conflict or past-start refusal is either (a) a `fail(409, { code, date })` that the form page handles by navigating client-side to the refreshed day with the message, or (b) a redirect where the details come from `sessionStorage`. Pick one. State that JS is required for the details to survive, or that the no-JS path re-asks. Then fix the Form action errors row to match.

### H2. A retried booking submit is treated as a conflict, so a guest whose booking succeeded is told someone else took the time

- **Input:** EXPERIENCE.md, State Patterns, Submit slow ("The idempotent submit guarantees no double booking"). Errors ("Bitte warte noch, wir buchen nicht doppelt"; "Network or server failure ... nothing is booked yet. Please try again"). Interaction Primitives ("A resubmitted form never creates a second booking").
- **Problem:** AD-3 handles resubmission through the conflict check: "A resubmitted booking form is refused by the same check". Suppose the first POST commits but its response is lost, and the guest presses "try again" as the UX tells them to. The retry gets `conflict` and shows "Someone just took 18:00". Meanwhile the guest already has a booking, a confirmation email and maybe a keybox email. The guest may then book another time and end up with two bookings. The UX wants idempotency. The spine only gives conflict refusal.
- **Fix:** Extend AD-3 or add a convention. The booking form carries a random submit token generated when the form renders (≥128 bits). The `booking` row stores it with a unique constraint. If a submit's token already exists, the command returns `{ ok: true, publicId }` of the existing booking, and the route redirects to its `/booked/[publicId]`. Only a different token gets `conflict`.

### H3. Call-list entries from refused emails can never be cleared

- **Input:** PRD FR-14 and FR-21 ("The admin can mark an entry as called"). EXPERIENCE.md, Call list entry ("Entries leave the list when called ..."), UJ-3 failure path.
- **Problem:** AD-21 derives refusal entries from "bookings whose latest keybox or urgent email outbox row is recorded as refused". AD-7 says "mark called" writes only the last-told notice. Nothing in the spine removes a refused-send entry after the admin phones the guest, so it stays on the list, with its count, until the start time. Builders will each invent something different, such as a column on the outbox row, deleting the row or a new outcome value.
- **Fix:** Amend AD-21 and AD-7. "Mark called" also records a `called_at` (or `acknowledged_at`) on the refused outbox row that produced the entry, inside the same command. AD-21 then excludes refused rows that have been acknowledged. Add the field to the outbox outcome model. Also state whether a heat-change entry and a refusal entry for the same booking show as one entry or two, and that one "Angerufen" clears both.

### H4. The reply reminder is stored in two ways inside the spine

- **Input:** PRD FR-31 and FR-28. The spine itself.
- **Problem:** AD-20 says the reply reminder is "the state `reply_done_at` on the deleted booking itself", and the memlog agrees. But the Naming convention lists a `reply_reminder` table, the ER diagram has `BOOKING ||--o| REPLY_REMINDER`, and AD-12 purges "any copy kept for reply reminders". Builders will diverge on schema and on what the purge touches.
- **Fix:** Follow AD-20. Remove `reply_reminder` from the Naming row and the ER diagram, and drop "any copy kept for reply reminders" from AD-12. Alternatively, make the table canonical and change AD-20, but then it must hold no contact data.

### H5. Season records are undefined: whether a change creates or edits a season, and which season a booking belongs to. Bookings outside every season after a shortening escape the FR-28 purge

- **Input:** PRD Glossary, Season ("kept as its own record, so past seasons keep their dates"). FR-20 ("Shortening a season ... never deletes existing bookings ... stay fully valid (emails, heat state, analytics)"). FR-28 ("30 days after the end of the season the booking belongs to"). FR-1 (before, between and after seasons). EXPERIENCE.md, Settings card "Saison" (one Beginn/Ende pair), After season ("If an admin has already set a next season ...").
- **Problem:** The spine has a `SEASON` entity ("contains (by date)") but also lists "season" under business settings edited through FR-20. Several things are left open:
  - When editing the season card amends the current season and when it creates the next one.
  - Whether seasons may overlap.
  - Which season a booking left outside the shortened season belongs to.

  Membership "by date" means such a booking belongs to no season. AD-12 purges "every booking of that season", so it is never purged, which is a privacy violation. Its analytics record also has no season to group under.
- **Fix:** Add an AD on seasons:
  - Seasons are rows that never overlap.
  - The settings command edits the current or next season and creates a new row only when the last season's end has passed. Alternatively, make "new season" an explicit action.
  - Each booking stores its `season_id` at booking time. Shortening the season never changes it.
  - The purge and the analytics grouping use `season_id`, not the date.
  - A season's end can never be moved earlier than its last booking for purge purposes. Alternatively, the purge uses max(season end, last booking date) + 30 days.

### H6. AD-8 builds second-kind start times from the recorded changeover, but FR-4 and FR-6 require the current changeover

- **Input:** PRD FR-4 ("No start time is offered less than one current changeover after a booking ends"). FR-6 ("A new booking can never start or end less than one current changeover from another booking"). Glossary, Heat state ("for a free start time, using the current changeover") and Back to back ("recorded on whichever of the two was made later", which for a new booking is the current value).
- **Problem:** AD-8 says start times of the second kind use the recorded changeover. Take an existing booking recorded at 15 minutes after the setting moved to 30. The calendar would offer end + 15, the FR-6 check (current changeover) would refuse it, and the offer would show "hot" against a rule that says it is not back to back. AD-3's phrase "changeover spacing using the recorded changeover" can also be read as the existing booking's value. Only the earliest-arrival clamp ("plus that booking's changeover") and back to back between two existing bookings use a recorded value.
- **Fix:** Reword AD-8. Free start times of every kind, the hot state of a free start time, and the spacing of a new booking against existing ones use the current changeover, which becomes the new booking's recorded value. The recorded changeover is used only for back to back between two existing bookings, for the earliest-arrival clamp, and for analytics. Reword AD-3 the same way. Add an AD-19 test case: the changeover goes from 15 to 30 with an existing booking in place.

### H7. Nothing stops public pages from shipping guest data or block reasons to the browser

- **Input:** PRD FR-1 ("An unavailable start time reveals nothing about who booked it or why it is blocked"). NFR-7 ("Guest contact details are never shown on public pages"). EXPERIENCE.md, Start-time row, Taken row ("bis {end}" only).
- **Problem:** SvelteKit serializes the `load` result into the page, so data can reach the client without being rendered. AD-1 takes `(bookings, blocks, ...)` and routes "read db via query helpers". No rule says what a public route may return. A builder who passes booking rows or core output to the page leaks names, emails and block reasons in the HTML or JSON. The same question applies to `/booked/[publicId]`: should it show the guest's name and email to anyone holding the link?
- **Fix:** Add a convention or extend AD-13. Public (`(guest)`) loads return only a view model: free start times with their notice and offered durations, taken intervals as `{start, end}`, and season state. The guest query helpers never select contact columns or block reasons. `/booked/[publicId]` shows date, time, duration, party size and notice only, with no contact data. Add a test that the serialized public payload contains no booking or block fields beyond these.

---

## Medium

### M1. The shape of a notice is not defined, yet it is stored, compared, rendered and sent back by forms

- **Input:** PRD Glossary (Notice, Last-told notice, Heat change). FR-21 ("refused if the notice changed since the entry was displayed"). EXPERIENCE.md ("Das hat sich gerade geändert" when the notice differs from what the form showed), and the variants "only N minutes to heat" and "arrival already past".
- **Problem:** The domain, DB columns, mark-called form, impact previews and email templates all exchange a notice, but the spine never says what one is. Unsettled points include whether a single-time arrival is stored as earliest = latest or latest = null, and whether "already past" is part of the stored notice or derived at render time. Divergent shapes break heat-change comparison and the `stale` check.
- **Fix:** Add a convention. `Notice = { heatState, earliestArrival | null, latestArrival | null }` as UTC instants, with null for hot. A single-time arrival has earliest = latest. "Already past" and "minutes to heat" are derived at render time. The last-told notice is stored as these three columns on `booking`. Forms that need a stale check post the displayed notice in this shape, and the core compares with one `noticeEquals` and one `isHeatChange`.

### M2. Which notice each email carries, and which notice is recorded as told when it is accepted

- **Input:** PRD FR-10 (confirmation carries "the notice at booking"), FR-11 (keybox carries the "current notice"), Glossary, Last-told notice ("updates it only if the mail service accepted the email").
- **Problem:** AD-4 says every email is "rendered at send time from current data". For the confirmation, that would put the current notice in it, not the notice at booking, if a change happened between commit and drain. AD-7 says record-send-outcome writes the last-told notice on acceptance, but not which value. A builder who recomputes it at record time can store a notice the guest never saw, because the SMTP send runs outside the transaction. That is exactly what AD-7 is meant to prevent.
- **Fix:** Amend AD-4 and AD-7. Each kind renders a defined notice: the confirmation renders the notice stored at booking, and keybox and heat-change emails render the current notice computed at render time. The worker passes the rendered notice to record-send-outcome, which stores it on the outbox row (like the keybox code) and writes that value as the last-told notice. The confirmation never changes the last-told notice.

### M3. Urgency of an "earlier latest arrival" heat change is not classified, and UX and PRD differ

- **Input:** EXPERIENCE.md, Emails as surfaces ("Heat change, urgent: Hot → cold start, a later earliest arrival, **or an earlier latest arrival**") and the "Wir heizen jetzt länger vor" email. PRD FR-12 and FR-13 list only hot → cold and a later earliest arrival as urgent or call required. FR-14 links call-required to refused urgent emails.
- **Problem:** AD-6 sets call required for "hot → cold start or later earliest arrival" and optional for "cold start → hot". It says nothing about an earlier latest arrival, which a pre-heat window change can cause. Three things diverge: the email subject, the call-list marker, and whether a refusal goes to the call list.
- **Fix:** Add a pure-core `heatChangeUrgency(lastTold, current) → urgent | good_news` to AD-1 and AD-6. Following the UX, an earlier latest arrival counts as urgent, so it means call required after the keybox email and the call list on refusal. Confirm this with the PM because it extends FR-13 and FR-14.

### M4. Outbox delivery semantics and drain order are open

- **Input:** PRD FR-11 ("immediately after the confirmation"), FR-12 ("No heat-change email is sent once the keybox email has gone out"), NFR-9 (catch-up after downtime).
- **Problem:**
  - **Crash between send and record:** AD-5 sends outside the transaction and records afterwards. A crash or redeploy (SIGTERM) between SMTP acceptance and the record means a resend, which duplicates the email, or a loss, if the row was claimed first. The spine does not choose between at-least-once and at-most-once.
  - **Drain order:** order within a tick is undefined. A keybox email can go out before its confirmation, and a heat-change and a keybox email due in the same tick can both be sent.
- **Fix:** Add to AD-5:
  - Delivery is at-least-once, so a rare duplicate is acceptable, or a claim step with a timeout. Pick one and handle SIGTERM by finishing the current send.
  - Drain rows by due time. Within a booking, order confirmation, then keybox, then heat change.
  - A heat-change row is evaluated only after any due keybox row of the same booking has been processed in that tick.

### M5. Analytics day records need the settings in force on that day, which the spine does not keep

- **Input:** PRD FR-24 ("operating hours in force each day"), FR-25 ("heat state when it passed"), FR-30. NFR-9 (downtime).
- **Problem:** AD-12 writes the day record "after each operating day", and AD-5 catches up after downtime. Free start times and their hot state depend on the current changeover and operating hours. Suppose an admin changes them during the day, or before a delayed catch-up job runs. The record then reflects later settings, and the spine says analytics must not drift when settings change. No settings history exists.
- **Fix:** Amend AD-12. Either (a) the day job runs shortly after each day ends, and a settings change to changeover or hours first snapshots any unrecorded past days (or the elapsed part of today) with the old values, or (b) settings changes append a dated settings-history row that the day job reads. Option (a) is simpler with one worker.

### M6. Reply-To for guest emails is undecided, so replies may land in an unread sender mailbox

- **Input:** PRD FR-10 ("how to cancel (by email to the admins)"), FR-20 (admin contact address shown to guests), §10 OQ1 (sender address). EXPERIENCE.md, confirmation key line ("Absagen: schreib an {admin contact}").
- **Problem:** Guests will reply to the confirmation or keybox email to cancel. AD-15 fixes only the SMTP sender. Whether a reply reaches the admin contact or the sending mailbox is an operational choice with direct product impact on the cancel flow and FR-31. Builders will differ.
- **Fix:** Add to AD-15: `Reply-To` is the admin contact setting at send time, and the From display name is "Sauna Luegisee". Keep the From address under the open question.

### M7. `GUEST_KEY_SECRET` is said to be backed up with the database, but it lives in env, which AD-18 does not back up

- **Input:** PRD FR-24 (unique and repeat guests across seasons), NFR-6. architecture-inputs §3 ("Backups must leave the machine").
- **Problem:** AD-22 says the secret "is backed up with the database (AD-18)". It is an env value, and AD-18 backs up only the SQLite file. The Deferred item on secrets handling leaves env on the VPS. If the VPS is lost, the secret goes with it, and guest keys break across seasons, which is exactly what AD-22 prevents. The same applies to SMTP and Swiss Backup credentials needed for a restore.
- **Fix:** Correct AD-22 and AD-18. Name where the secret and the other env values are kept off-box (for example the operators' password manager, or an encrypted file next to the backup), and add "restore uses the stored secret" to the pre-season restore test.

### M8. The deferred Paraglide strategy could break "German default" and the language-link design

- **Input:** PRD FR-26 ("German is the default"). EXPERIENCE.md, App header ("DE | EN are two links ... `hreflang` set ... reloads the same page in the other language").
- **Problem:** Paraglide's default strategy order includes the browser's preferred language, which would serve English to English-language browsers on first visit. That contradicts the German-default rule. "Cookie only vs URL prefix" is deferred, but it changes every route, every link in emails, and what the DE | EN links point to (`hreflang` implies alternate URLs, while cookie-only implies a cookie-setting request).
- **Fix:** Add to AD-14: the first visit is always `de`, with no Accept-Language detection. Then either decide cookie-only (language links hit a small endpoint that sets the cookie and redirects back, with no `hreflang`) or keep the deferral but write the default rule and "no URL prefix" into the spine, since the source tree already assumes no prefix.

---

## Low

### L1. AD-13 forbids guest data in any URL, but the FR-31 `mailto:` carries it

- **Input:** EXPERIENCE.md, Reply reminder.
- **Problem:** The prefilled `mailto:` link holds the guest's email, name and booking date. Read literally, AD-13 forbids that.
- **Fix:** Scope AD-13 to http(s) URLs served by the app. Admin-only `mailto:` and `tel:` links are allowed.

### L2. AD-12 and AD-22 normalize the email differently

- **Problem:** AD-12 says "lowercased email" and AD-22 says "trimmed, lowercased".
- **Fix:** Point AD-12 to AD-22.

### L3. The page language and the email `Content-Language` value are not fixed

- **Input:** EXPERIENCE.md, Accessibility Floor (`<html lang="de-CH">`).
- **Problem:** The Paraglide locale is `de`. The `lang` and `Content-Language` value (`de-CH` or `de`) and the Intl date locale are not fixed, so pages and emails may differ.
- **Fix:** Add to the conventions: locale `de` maps to `de-CH` for `lang`, `Content-Language` and Intl, and `en` maps to `en`.

### L4. Admin session lifetime and the post-sign-in return URL are not defined

- **Input:** EXPERIENCE.md ("Signed out / session ended ... return to the page after sign-in").
- **Problem:** No session lifetime (idle or absolute) is set. The return target, if taken from the query string, is an open redirect.
- **Fix:** Add to AD-10: a session lifetime (for example 30 days sliding), and the return target accepted only as a same-origin `/admin` path.

### L5. Security headers are not covered

- **Input:** PRD NFR-7.
- **Problem:** HSTS, `frame-ancestors`/X-Frame-Options (against clickjacking the admin delete) and a CSP are not mentioned. A CSP must allow AD-11's inline theme script by hash.
- **Fix:** Add a convention in Caddy or `hooks.server.ts`, or defer it explicitly.

### L6. The mobile number's stored format is not defined

- **Input:** EXPERIENCE.md, Text field (accepts `+41`, `0041`, `07…`), and `tel:+41…` links.
- **Problem:** Without a stored format, the call list's `tel:` links may break.
- **Fix:** Add to the conventions: the AD-16 schema normalizes the number to E.164 for storage and keeps the display form separately or formats it at render time.

### L7. "Flagged bookings" are not marked as derived or stored

- **Input:** PRD FR-20. EXPERIENCE.md, Flagged bookings.
- **Problem:** The spine doesn't say whether bookings left outside a shortened season or hours are computed or stored.
- **Fix:** One line in AD-1 or AD-21: they are derived on each request from the current settings and are never stored.

### L8. The host-cron backup runs against a live SQLite file in a container volume

- **Problem:** Journal mode (WAL) and `busy_timeout` are not stated, so app writes may fail with SQLITE_BUSY while the backup runs.
- **Fix:** Add to the conventions: WAL mode and a busy timeout set at connection, and the backup uses the SQLite online backup API or `VACUUM INTO`.

### L9. Client IP addresses are kept without a stated retention period

- **Input:** PRD FR-28 and FR-29 (data protection).
- **Problem:** Client IP addresses sit in the rate-limit store and in Caddy access logs, which also contain `/booked/{publicId}` URLs. They are personal data under the FADP and have no stated retention.
- **Fix:** Disable or trim Caddy access logs (tie this to the log-rotation item in Deferred) and keep rate-limit entries in memory or short-lived.

### L10. Heat-change timing edges are unstated

- **Problem:** The due time of the first heat-change row (now + settle delay is implied but only stated for re-enqueue) is not written down. Neither is what happens to a heat-change row that falls due after the start time during downtime catch-up (send or drop).
- **Fix:** State both in AD-6. The first enqueue is due at now + settle delay. Rows past the start time are recorded as `skipped`.
