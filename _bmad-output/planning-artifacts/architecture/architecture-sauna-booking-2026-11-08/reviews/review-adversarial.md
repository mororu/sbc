---
review: adversarial (spine as adversary: two compliant units that still build incompatibly)
target: ../ARCHITECTURE-SPINE.md
domain: ../../../prds/prd-sauna-booking-2026-11-08/prd.md
date: 2026-11-08
---

# Adversarial review — ARCHITECTURE-SPINE (Sauna Luegisee)

**Verdict:** The paradigm holds up (pure core, a single command layer, outbox, derived call list), but the spine leaves the outbox lifecycle, the notice's data shape, changeover spacing, season identity and the reply-reminder entity loose enough that two units can each follow every AD and still disagree on who the guest was told what, and when. Close the 3 critical and 7 high holes before writing epics.

**Counts:** Critical 3 · High 7 · Medium 6 · Low 4

Calibration: one VPS, one process, one SQLite file, at most a few hundred bookings a season. Every fix below is a sentence or a column, not a new component.

---

## Critical

### C1 — Send outcome records what is true at record time, not what the email contained

- **Units:** Outbox worker & email (U-A) vs guest booking flow / admin delete / settings keybox rotation (U-B).
- **How both comply:** AD-5 says the SMTP send happens outside the write transaction and the outcome is recorded afterwards through a command. AD-4 says rows hold no rendered content and are rendered at send time. AD-7 says record-send-outcome writes the last-told notice on acceptance. AD-4 says the keybox row records "the keybox code it contained".
  - U-A renders a keybox email at 09:59:58 with notice N1 = cold start, 09:20–09:30, and code 4711. SMTP takes 3 s.
  - Meanwhile U-B's book command commits a back-to-back booking (the notice is now N2 = hot) and enqueues a heat-change row. Or an admin rotates the code to 8822.
  - U-A calls `recordSendOutcome(rowId, accepted)`. The command does what AD-2 tells every command to do: "loads state, calls the pure core, writes". It recomputes the notice (N2) and reads the current code (8822), then stores them as last-told and as the code contained.
  - The heat-change row now finds N2 = N2 and is skipped. The booking list says the guest got 8822. The guest was actually told cold start and 4711. This is exactly the SM-1 failure.
- **Also:** the confirmation email (FR-10, "notice at booking") vs AD-4 "rendered from current data". The template author can render either one, and nothing pins which one becomes last-told.
- **Fix (tighten AD-4/AD-7):** the worker renders from an explicit **send snapshot**: `{ notice, keyboxCode? , urgent? }`, computed by the pure core in one read. It persists the snapshot on the outbox row before the SMTP call (`told_notice`, `keybox_code`, `urgent`). `recordSendOutcome` writes the last-told notice **from the row's snapshot**, never from a recomputation. The confirmation email renders the booking's last-told notice as set by the book command (its snapshot is that value).

### C2 — Changeover spacing: AD-3 and AD-8 contradict FR-6 and each other

- **Units:** Guest calendar / start-time offer (U-A, `domain`) vs book command conflict check (U-B, `commands`).
- **How both comply:** AD-8: "Back to back, conflicts and start times of the second kind use the recorded changeover … free start times use the current setting." AD-3: "changeover spacing using the recorded changeover". FR-6 says a *new* booking must keep the **current** changeover from every other booking.
  - The changeover is raised from 15 to 30 minutes. An existing booking ends at 18:00 (recorded 15).
  - U-A treats kind-2 start times as free start times, so it uses the current changeover: it offers 18:30, not 18:15.
  - U-B checks spacing with "the recorded changeover" of the existing booking (15). A stale tab or a hand-made POST for 18:15 is accepted.
  - The new booking records 30. The gap is 15 ≠ 30, so by the Glossary rule it is **cold start**, although it starts 15 minutes after a guest left a hot wagon. FR-6 is violated, and so is the PRD rule that kind-2 times sit one changeover after the end.
  - A third reading also complies: "recorded" means the larger of the two bookings' recorded values. Its result differs from both of the above.
- **Fix (rewrite AD-8 as one table):**
  - New booking vs any existing booking: spacing ≥ **current** changeover (FR-6). Applies to conflict checks, kind-2 and kind-3 offers, and duration offers alike.
  - Back to back between two existing bookings: the changeover recorded on the **later-made** one (see L2 for what "later" means).
  - Arrival-time earliest bound: the recorded changeover of the booking ending in the window.
  - Existing pairs are never re-checked.
  - The book command validates through the same domain function that produced the offer (see M1).

### C3 — Reply reminder has two owners and two shapes; contact data can survive the purge

- **Units:** Admin delete & reply reminder (U-A) vs retention purge (U-B).
- **How both comply:**
  - AD-20 says the reminder "is the state `reply_done_at` on the deleted booking itself", and that contact data exists only on `booking`.
  - The Naming convention lists a `reply_reminder` table. The ER diagram has `BOOKING ||--o| REPLY_REMINDER`. AD-12 tells the purge to erase "any copy kept for reply reminders".
  - U-A follows the naming convention and the ER diagram. It creates `reply_reminder(booking_id, name, email, locale, done_at)`, because FR-31 has to show name and email after the delete, and the delete-booking command owns the reminder.
  - U-B follows AD-20, which says no copy exists. It clears `booking` only.
  - Result: the reply reminder keeps personal data after the FR-28 purge, and the home-screen count comes from a table that AD-20 says does not exist.
- **Fix:** pick AD-20's shape. Delete `reply_reminder` from Naming and the ER diagram, and delete "any copy kept for reply reminders" from AD-12. State it plainly: a reminder is `booking.deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`. Only the delete-booking and mark-reminder-done commands write `reply_done_at`. The purge clears contact data on `booking` and nowhere else, because nowhere else holds any.

---

## High

### H1 — "Keybox email sent" has three meanings; the phase boundary is undefined

- **Units:** Call list & reminders (U-A, AD-21) vs outbox worker heat-change step (U-B, AD-6).
- **How both comply:**
  - AD-6 switches on "the keybox email has been **accepted**". AD-21 switches on "the keybox email was **sent**". FR-13 says "has been sent".
  - Suppose U-A reads "sent" as "a keybox row exists that is no longer pending" (accepted, refused or skipped), and U-B reads it as accepted. Then the keybox email is refused, and the notice later turns cold:
    - U-B sends a heat-change email, since the keybox was not accepted.
    - U-A puts a heat-change entry on the call list, since the keybox was sent.
    - The guest gets an email *and* a call, and the last-told notice is written by both.
  - The reverse reading leaves the booking on neither path.
  - A second split: after the keybox due time has passed but before acceptance (worker lag, SMTP outage), one unit treats the booking as "post-cutoff" and the other as "pre-keybox".
- **Fix (tighten AD-6, align AD-21):** define one derived predicate in `domain`, `keyboxPhase(booking, outboxRows) ∈ { before, told, failed }`, from the latest keybox row:
  - `told` = accepted.
  - `failed` = refused or expired (H7).
  - Everything else is `before`.
  - Heat-change emails go only in `before`. Heat-change call-list entries apply only in `told`. `failed` yields a call-required entry for the failure itself (H2).
  - The call list, the booking list and the worker all call this one predicate.

### H2 — Refused-email call-list entries can never leave the list; urgency is not recorded

- **Units:** Call list mark-called (U-A) vs worker record-outcome (U-B).
- **How both comply:**
  - AD-21 includes "bookings whose latest keybox or urgent email outbox row is recorded as refused". Mark called writes only the last-told notice (AD-7). After the call, the refused row is still the latest row, so the entry reappears for good: U-A cannot clear it without writing outbox (a write AD-2 does not list for mark called).
  - "Urgent" is decided at send time by comparing the notice with the last-told notice. The outbox row stores only kind `email.heat_change`. U-A, needing to know whether a refused heat-change row was urgent, recomputes against today's last-told notice and can get a different answer than U-B did.
  - "Other refusals are flagged on the booking": U-A derives the flag from outbox, while U-B adds a `booking.send_problem` column. That makes two owners.
- **Fix:**
  - Store `urgent` on the row (part of the C1 snapshot).
  - A refused entry leaves the call list when a later row of the same kind is accepted, or when mark called records `call_resolved_at` on the outbox row. That is a write by the mark-called command, so add it to AD-7/AD-21.
  - "Flagged on the booking" means *derived from outbox*. There is no flag column.
  - Product aside: a refused keybox entry must show the keybox code on the call list, since the call replaces the email.

### H3 — The notice has no canonical shape

- **Units:** Book command / record-outcome (writers of the last-told notice) vs call-list UI + mark-called stale check (U-B) vs analytics.
- **How both comply:**
  - AD-7 says the last-told notice "is stored on the booking", with no shape given.
  - One unit stores `last_told_heat_state`, `last_told_earliest`, `last_told_latest` as instants. Another stores JSON with wall-clock `"17:20"` strings.
  - For the collapsed case (earliest after latest, so "the arrival time is just the earliest arrival"), one stores `latest = earliest` and another stores `latest = null`. The domain comparison "latest arrival now earlier" then gives different answers.
  - Mark called's "notice unchanged since display": the form posts what it displayed, perhaps `"16:35–16:45"` in Zurich time or a JSON blob, and the command compares that with instants. Different serialisations make every mark-called come back `stale`, or never.
- **Fix (new convention):**
  - `Notice = { heatState: 'hot' | 'cold_start', earliestArrival: Instant | null, latestArrival: Instant | null }`. Both arrival bounds are null iff hot. A collapsed range is stored as `earliest = latest`.
  - Persist it as three columns wherever a notice is stored: booking last-told, outbox snapshot.
  - Mark called posts an opaque `noticeToken` produced by `domain.serializeNotice`. The command compares tokens and nothing else.

### H4 — Heat-change enqueue: the initial due time, the trigger and the scope are unpinned

- **Units:** Admin delete/blocks and guest booking (enqueuers) vs settings pre-heat change vs worker.
- **How both comply:**
  - AD-6 fixes due = now + settle **only** when a pending row already exists. The create-block author enqueues the first row due *now*. The worker sends at the next tick, so a block created and deleted within a minute can email the guest, which breaks the settle rule (UJ-2).
  - AD-4 says to enqueue on "a change that **can** alter a notice". One unit enqueues for the affected booking whenever one exists. Another enqueues only if the preview shows a heat change against the last-told notice. That difference changes whether the settle timer restarts (Glossary: "it restarts with every change").
  - For a pre-heat window change there is no "affected booking". One unit enqueues for every future booking. Another enqueues only for bookings whose notice moved. FR-20's preview counts something a third way.
- **Fix (tighten AD-4/AD-6):**
  - Every heat-change enqueue upserts the single pending row with due = now + settle delay.
  - Trigger: book, delete booking, create block and delete block enqueue for the domain's `affectedBooking` (computed on post-change state), whether or not it shows a heat change.
  - A pre-heat window change enqueues for every future non-deleted booking whose current notice differs between old and new settings. That same set is the number shown in the FR-20 preview.
  - Changes to operating hours, season, changeover and keybox code enqueue nothing.

### H5 — Season identity: settings edit in place vs a season record; bookings orphaned by shortening

- **Units:** Settings (U-A) vs retention purge + analytics grouping (U-B).
- **How both comply:**
  - The Config convention lists "season" among DB settings edited via FR-20. The ER diagram and Glossary make the season its own record, with `SEASON ||--o{ BOOKING : "contains (by date)"`.
  - U-A edits the single season row's dates in place: FR-20 says "set the season start and end". That loses last year's dates and silently regroups past analytics.
  - U-B finds a season's bookings by date range. FR-20 allows shortening a season while existing bookings stay valid. A booking on a date beyond the new end then belongs to no season: it is never purged (FR-28 violation) and is missing from season analytics. Shortening the season *start* behind existing bookings has the same effect.
- **Fix (new AD):**
  - Seasons are rows. Settings creates a new season or edits the upcoming/current one; a past season is never edited.
  - Each booking and each analytics row stores `season_id`, set at write time.
  - Purge date per season = max(season end, last booking date in it) + 30 days, keyed by `season_id`.

### H6 — The analytics day record is computed with the settings current at job time, not those in force

- **Units:** Settings (U-A) vs analytics day job (U-B).
- **How both comply:**
  - AD-12 says the day record holds "operating hours **in force**" and the free start times that passed unbooked, with their heat state. Settings storage is deferred and has no history.
  - An admin changes the changeover from 15 to 30, or the hours, at 20:00. The day job at 00:05, or three days later after downtime catch-up per AD-5, recomputes kind-2 free start times and their heat state with the new values. That yields different times than guests were actually offered.
  - A block created or deleted on time that has already passed (FR-17 does not forbid past creation, FR-18 forbids only past deletion) rewrites history in the same way.
- **Fix (tighten AD-12):**
  - The worker writes a `day_open` snapshot of the settings in force (hours, changeover, pre-heat window) at the start of each operating day. The day job computes from that snapshot plus the final bookings and blocks.
  - Blocks cannot be created or deleted for time already passed.
  - `analytics_day` is unique on date and `analytics_booking` on booking id; catch-up inserts once.

### H7 — The delivery lifecycle has no in-flight, transient-failure or expired state

- **Units:** Outbox worker (U-A) vs admin delete / call list / booking list (U-B).
- **How both comply:**
  - The outcome enum is pending, accepted, refused, cancelled, skipped. The SMTP transient-failure policy is "owned by the worker alone".
  - U-A adds `failed` + `attempts`, or leaves the row pending forever while SMTP is down. Either way, the call list (AD-21 reads only `refused`) never shows the booking, and a guest can reach the start time without a code and without a call.
  - A keybox email dropped after the start time is recorded as `skipped` (U-A), which is the same value as "no heat change" (U-B cannot tell the two apart in the FR-16 status).
  - Delete during send: the delete command cancels "pending" rows, including the one currently in SMTP. The worker then records `accepted` over `cancelled`, or is refused, depending on the author.
  - Tick re-entrancy: AD-5 says "about every minute". With `setInterval` and a 90-second SMTP timeout, two ticks can drain the same row and send it twice.
- **Fix (tighten AD-5 + Outbox convention):**
  - Outcomes: `pending · sending · accepted · refused · cancelled · skipped · expired`.
  - The worker claims a row (`pending → sending`, with the C1 snapshot) in a short transaction before SMTP. Cancel affects only `pending`. Record-outcome always writes the real result over `sending`.
  - Transient errors return the row to `pending` until the deadline: start time for keybox and heat-change rows, 24 h for confirmation. After the deadline it becomes `expired`. A keybox row still undelivered 2 hours before start counts as `failed` in H1.
  - Ticks are single-flight: the next tick is scheduled only after the current one finishes.
  - On boot, `sending` rows are reset to `pending`. A rare duplicate email is accepted as the price.

---

## Medium

### M1 — The book command checks conflicts but not that the slot is actually offered
- **Units:** Guest calendar (offer) vs book command.
- AD-3 lists only spacing and block overlap.
  - A kind-3 slot, 17:45 for 60 minutes, whose following booking was deleted after display is no longer a start time at all, yet passes the conflict check.
  - The same goes for durations other than the kind-3 ones, and for the horizon, season, hours and the "not past" rule.
- **Fix:** the command accepts (start, duration) only if `domain.offeredStartTimes(state, settings, now)` contains it. That one function also serves the calendar and the conflict check.

### M2 — The notice changed between display and submit
- **Units:** Booking form vs book command.
- The guest saw "hot". A deletion made the slot cold before the submit. The command records the new notice and confirms. The confirmation screen shows cold, and nothing flags the change. Another author applies the Impact-preview convention and refuses with `stale`.
- **Fix:** state the rule. Recommended: accept, and render the confirmation with an explicit "changed since you looked" line (the posted `noticeToken` differs).

### M3 — Drain order within a tick
- **Units:** Worker vs mail templates (FR-11 "immediately after the confirmation").
- For a late booking, the keybox and confirmation rows are both due now. Without an ordering rule, the keybox can arrive first. A due heat-change row can also be drained before a due keybox row for the same booking (see H1).
- **Fix:** drain by due time, then by kind rank confirmation < keybox < heat_change. Within one booking, a later rank waits until earlier rows are no longer pending.

### M4 — Heat-change classification has no single owner
- **Units:** Email template (urgent vs good news) vs call list (required vs optional).
- AD-1 lists "heat change" but not its class. A latest arrival that becomes *earlier* is a heat change (Glossary), yet neither FR-12 nor FR-13 classifies it. One unit calls it urgent; another calls it optional.
- **Fix:** `domain.classifyHeatChange(lastTold, current) → none | urgent | good_news`. Urgent means call required, good news means optional. Earlier latest arrival is urgent (the guest must come earlier).

### M5 — Analytics time fields
- **Units:** Snapshot job vs analytics views.
- The snapshot stores a UTC instant. The views run `GROUP BY strftime('%H', start)` in SQL, which is UTC, so every hour shifts by 1–2 h and moves on 28 March 2027. That arguably still complies, because the view does not "convert", it just groups.
- **Fix:** analytics rows store Zurich-local `date`, `start_hhmm`, `weekday` and `iso_week`, computed by `src/lib/time` at snapshot. The views group on those columns only.

### M6 — Out-of-hours / out-of-season flags and the domain's treatment of such bookings
- **Units:** Settings (FR-20 "flagged to the admins") vs the domain's start-time calculation.
- One unit stores a flag column at settings change. Another derives it per request.
  - Kind-2/3 start times next to a booking that now lies outside the hours may still be offered by one implementation and not by the other.
- **Fix:** the flag is derived (current settings vs the booking), never stored. Start times are always clipped to the current hours and season. Existing bookings outside the hours still count for conflicts and heat state.

---

## Low

- **L1 — Guest-key normalisation wording.** AD-12 says "one-way key from the lowercased email". AD-22 says HMAC of the *trimmed*, lowercased email. Point AD-12 at AD-22, and normalise (trim, lowercase) once in the booking schema so the stored and hashed forms match.
- **L2 — "Made later" ordering.** Back-to-back depends on which booking was made later. Pin it to `created_at` (instant), with row id as tie-break, and make it an input to the domain.
- **L3 — Purged representation.** Purge writes `NULL`, so the contact columns must be nullable. Admin views and the FR-31 reminder must handle purged rows (a reminder disappears once its email is null; see C3).
- **L4 — Snapshot idempotency keys.** AD-5 promises idempotent ticks but names no keys. Use a unique `analytics_booking.booking_id` and a unique `analytics_day.date`. The purge marks `season.purged_at`, so catch-up runs it once.
