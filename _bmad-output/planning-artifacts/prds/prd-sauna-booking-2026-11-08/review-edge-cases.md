# Edge-Case Review: PRD Sauna Booking Calendar

Reviewed: `prd.md` (draft, 2026-11-08). Lens: adversarial edge cases. All timelines use a 15-minute
changeover, a 30–40 minute pre-heat window and a 10-minute settle delay unless stated otherwise.

## Verdict

The core heat rule is sound and most worked examples check out (FR-2 bullets, the Glossary
start-time examples, UJ-2, UJ-3 and UJ-4 are arithmetically correct). The weak points are where
the rule meets time and change. A changeover setting change breaks the PRD's own invariants
(FR-6's "never", and the "only the next booking" claim in the Glossary and FR-12). The arrival
time ("arrive from 17:20") is told to guests but is not tracked, so it can go stale without any
notice, and it ignores blocks. The handover between settle delay, keybox email and call list
around the 24-hour cutoff is not specified precisely enough to implement. "Mark as called" and
refused sends can leave the stored last-told state wrong in a way that hides an unexpected cold
sauna. And analytics depend on a heat state at start time that the Glossary says is never
stored. None of this needs a redesign. It needs about a dozen precise sentences before
architecture starts. One worked example (UJ-1's edge case) is wrong.

## Findings

### C-1 (critical) Changing the changeover breaks FR-6 and the "only the next booking" invariant

**Location:** FR-2 last bullet; FR-6; Glossary *Changeover*, *Next booking*; FR-12 last bullet; FR-20; §5.4 description.

**Timeline:**
- Saturday has A 16:00–17:00 and B 17:15–18:15 (B hot, last-told hot). Sunday has D 16:00–17:00
  and C 17:30–18:30 (C cold, gap 30, last-told cold).
- Friday 20:00 an admin changes the changeover from 15 to 30 minutes.
- B now starts 15 minutes after A ends. FR-6 says the wagon "can never have two bookings less
  than one changeover apart". FR-2 says existing bookings keep their times. Both cannot hold.
- B flips hot → cold (no booking ends exactly 30 minutes before 17:15). C flips cold → hot.
  This happens to every adjacent pair in the horizon at once: every hot booking turns cold and
  every 30-minute-gap booking turns hot. Bookings inside 24 hours all land on the call list
  as *call required*.
- FR-12 says "A change can only ever affect the next booking of the booking that changed", and
  the Glossary says only booking create/delete causes heat changes in a single neighbour. An
  architecture built on those sentences recomputes one neighbour per event and misses the
  settings-triggered mass change.
- §5.4 promises "Before anything that causes a heat change, the admin is shown who will be
  affected", but FR-20 has no preview for the changeover.
- Physically, B's guest walks into a wagon left 15 minutes earlier, yet is told to light the fire.
- Analytics (§5.5) recomputed with the new changeover also rewrite past weeks (see H-6).

**Fix:** Pick one: (a) the changeover applies only to start-time generation for new bookings,
and the heat rule for existing pairs uses the gap they were booked with (store the changeover
per booking, or define hot as "previous booking ends between 0 and N minutes before"); or (b)
the changeover can only be changed while no future bookings exist. In either case, amend FR-6
to say "at the time of booking", correct FR-12's last bullet, and add a preview listing the
affected bookings to FR-20.

### H-1 (high) The FR-3 arrival time ignores blocks

**Location:** FR-3 second consequence; FR-4 "No changeover is needed next to a block"; FR-19; Glossary *Next booking* ("Creating or deleting a block never causes a heat change").

**Timeline:** Saturday block 12:00–17:45, *private use*. Booking at 18:00 is a cold start
(FR-19). FR-3 only clamps on bookings, so the guest is told "arrive from 17:20" and walks into
the private party, or into maintenance. If the block is created *after* the booking, nothing is
recomputed or sent, because blocks "never cause a heat change".

**Fix:** In FR-3, clamp the arrival time to the later of (start − pre-heat) and the end of any
booking plus one changeover, or block end, inside the window. Treat a block that moves a
told arrival time as a notifiable change (see H-2).

### H-2 (high) The arrival time is told to guests but never tracked, so it goes stale silently

**Location:** FR-3; Glossary *Last-told state*, *Heat change*; FR-10, FR-11, FR-12.

**Timeline:** Booking B Saturday 18:00, cold, booked Monday. Confirmation says "arrive from
17:20". Wednesday a guest books 16:30 for 60 minutes (grid time; ends 17:30, 30 minutes before
B, which is a valid gap). B is still a cold start, so there is no heat change and no email. FR-3
now gives B 17:45, but the guest still holds 17:20 and arrives while the 16:30 party is in the
wagon. The same thing happens with 15:30 for 120 minutes, or with a pre-heat window setting
change. The keybox email only fixes it if the change happens before the cutoff.

**Fix:** Make the last-told value a pair (heat state, arrival time). Define a heat change as a
mismatch in either part. A later arrival time is urgent; an earlier one may be dropped.

### H-3 (high) "Mark as called" can store the wrong last-told state and hide a cold sauna

**Location:** FR-21 ("mark an entry as called, which updates the last-told state"); FR-13 third bullet.

**Timeline:**
- Today, Tom 17:15, last-told cold (keybox email yesterday). 11:00 a guest books 16:00–17:00,
  so Tom flips cold → hot after cutoff. The call list shows an *optional* entry.
- 11:08 a second admin deletes the 16:00 booking at the guest's request. Tom is cold again,
  which matches last-told, so the entry leaves the list (FR-13).
- 11:10 Ruth, on a page loaded at 11:05, phones Tom: "good news, it's already hot."
- 11:12 Ruth taps *called*. If that sets last-told to the *current* state (cold), the system
  sees no mismatch and Tom is never called again. Tom arrives at 17:15 to a cold wagon,
  which is exactly SM-1.

**Fix:** "Called" records the state the entry displayed (what the admin said), not the current
state. The request carries the displayed state and is rejected or re-flagged if the state
changed since the entry was rendered. Recompute the mismatch afterwards.

### H-4 (high) Refused sends: last-told semantics and keybox failure visibility are undefined

**Location:** FR-11 ("heat state in the keybox email becomes the last-told state"); FR-12 ("After sending, the last-told state is updated"); FR-14; FR-21.

**Timeline:**
- Sara, Sunday 10:00. Saturday 10:00 the keybox email is refused by the mail service (FR-14).
  Does last-told become "cold"? Either way, Sara has no code. FR-14 shows the failure only
  "with the booking" in the booking list. The admin home shows only the call-list count. On
  Sunday morning nobody looks, and Sara stands at a locked wagon.
- Jonas, Saturday 18:30, last-told hot. Wednesday the admin deletes the previous booking.
  Wednesday 10:10 the urgent cold email is refused. If "after sending" includes a refused
  send, last-told becomes cold, no mismatch remains, and nobody is prompted to call. FR-14's
  "so they can phone instead" relies on an admin happening to open that day.

**Fix:** Last-told updates only on a send the mail service accepted. Every refused keybox or
hot → cold email puts the booking on the call list (or a sibling "must contact" list in the
home-screen count), with the reason.

### H-5 (high) Settle delay, keybox email and call list overlap around the 24-hour cutoff

**Location:** FR-11; FR-12 ("its 24-hour cutoff has not passed"); FR-13; FR-18 first bullet; NFR-4.

**Timeline A (when is "cutoff not passed" checked?):** B Saturday 18:30 (cutoff Friday 18:30),
last-told hot. Friday 18:24 an admin deletes A, so B is cold. FR-18's preview says "will be
emailed (FR-12)", because the cutoff has not passed. The settle delay ends at 18:34, after the
cutoff. If the cutoff is checked at send time, FR-12 does not apply, and FR-13 talks about a
change "after its 24-hour cutoff", but this change happened before it. The keybox email is due
18:30 but may leave as late as 18:45 (NFR-4), or hours later after downtime (FR-11). Between
18:34 and the keybox send, the change belongs to neither rule, or to both. The preview was wrong.

**Timeline B (stale queued email):** B last-told cold. 18:15 A is created (B hot). At 18:25 the
settle delay ends, the mismatch is confirmed, and "now hot" is queued. 18:27 A is deleted (B
cold). 18:30 the keybox email says cold, so last-told is cold. 18:38 the queued "now hot" email
leaves (within NFR-4's 15 minutes). The guest's latest message says hot, and the stored
last-told depends on whether "after sending" overwrites it with hot.

**Timeline C (call list before the keybox email):** The same mismatch appears on the call list
at 18:34 as *call required*. Ruth phones. Then the keybox email at 18:40 restates the state
anyway. Or Ruth does not phone, the keybox email fixes it, and the entry must vanish.

**Fix:** (1) A heat-change email is re-checked against the current state at the moment of
sending, and never sent once the keybox email has gone out. (2) The call list only includes
bookings whose keybox email has been sent (or failed). Until then, the pending keybox email is
the notification. (3) The FR-18 preview uses the same rule.

### H-6 (high) Analytics need a stored heat state at start time; the Glossary forbids storing one

**Location:** Glossary *Heat state* ("Derived, never stored as truth") and *Last-told state* ("The only heat-related value that is stored"); §5.5 ("each booking's final heat state at its start time"); FR-23, FR-25; §8.2 note; FR-28.

**Timeline:** 10 January: A 16:00–17:00, B 17:15 (hot, no fire lit). 1 February: the changeover
goes to 20 (C-1). Recomputed, B is now cold, and FR-23 counts an extra fire in January.
Alternatively, in March an admin deletes A, a January booking, because the guest later says
they never came. B is retroactively cold. Data "recorded from day one" (§8.2) is not stable
unless the state is frozen at start.

**Fix:** At each booking's start time, snapshot heat state, last-told state and changeover into
an analytics record that survives FR-28 anonymisation. Amend the Glossary to allow this. Define
whether deleting a past booking is allowed and whether it affects analytics.

### M-1 (medium) UJ-1's edge case is arithmetically impossible

**Location:** UJ-1 edge case.

**Timeline:** Someone books 18:00. The minimum duration is 60, so that booking runs to at least
19:00, and the earliest next start is 19:15. 18:30 can never be offered. It would be offered if
the other guest booked 17:00–18:00: then 18:00 disappears, 18:15 shows hot and 18:30 shows cold.

**Fix:** "someone else books 17:00–18:00 … 18:15 (now hot) and 18:30 are offered instead."

### M-2 (medium) Short gaps and late bookings make the pre-heat promise impossible

**Location:** FR-3; FR-8 (no minimum lead time); NFR-10 example "Nobody before you"; Glossary *Pre-heat window* (a range).

**Timeline:**
- A 16:00–17:00. A guest books grid time 17:30, which is a cold start (gap 30 ≠ 15). FR-3 clamps
  arrival to 17:15, which gives 15 minutes for a 30–40 minute stove. The NFR-10 copy "Nobody
  before you" is false. Someone left 30 minutes ago and the stove is probably still warm.
- It is unclear whether "ends inside the pre-heat window" means within 40 minutes before, or
  between 40 and 30 minutes before. A 30-minute gap is in one reading and not in the other.
- At 17:55 a guest books 18:00 cold and is told "arrive from 17:20", which is already past.

**Fix:** Define the window as one number (or which bound is used in copy). Specify the copy when
the clamped arrival is shorter than the window ("only 15 minutes to heat"). Specify the copy
when the arrival time is in the past ("go now; it will not be fully hot at 18:00"), or set a
minimum lead time for cold starts.

### M-3 (medium) A single season setting drives retention: shortening it deletes live data, rolling it postpones deletion

**Location:** FR-20 ("Shortening the season … never deletes existing bookings"); FR-28 ("30 days after the season ends").

**Timeline:**
- The season is 4 Jan–30 Apr 2027. On 20 March the wagon breaks and the admin sets the end to
  15 Feb. Bookings on 22 to 28 March are kept (FR-20). Retention is 15 Feb + 30 days = 17 March,
  which is already past, so names, emails and mobiles are deleted, including the 22 March
  guests'. No keybox email can be sent and no call can be made.
- In May 2027, before 30 May, an admin enters next season, 3 Jan–28 Apr 2028. "The season" now
  ends in 2028, and the 2027 data is kept a year too long.

**Fix:** Retention runs per booking (for example 30 days after the booking's start, or after the
latest of the booking date and the season end at the time). Seasons are stored as a list or as
a snapshot, not one mutable pair.

### M-4 (medium) The settle delay is a fixed window, not a debounce

**Location:** FR-12 first bullet; UJ-2 ("within a few minutes").

**Timeline:** Jonas's last-told state is cold. 10:00 A is created (hot). 10:06 A is deleted
(cold). 10:08 A′ is created (hot). If the delay counts from the first change, at 10:10 the state
is hot ≠ cold, so "now hot" is sent 2 minutes after the last flip. 10:12 A′ is deleted, and an
urgent "cold" email follows at 10:22. That is the flapping the delay exists to stop.

**Fix:** The settle delay restarts on every change for that booking. The email is sent when the
state has been stable for 10 minutes and differs from last-told.

### M-5 (medium) The opening day and the booking horizon conflict before the season

**Location:** §5.1 description ("opens … on the first day of the season if the season has not started"); FR-1; FR-8; §2.

**Timeline:** Go-live is 15 Dec 2026, the season starts 4 Jan 2027, and the horizon ends 29 Dec.
The page opens on 4 Jan, which FR-1 says is not selectable. No day is bookable until 21 Dec.
§2's "take bookings by mid-December" is only true if the season starts by about 29 Dec. After
the season ends, the page opens on today, which is outside the season, and what it shows is
undefined.

**Fix:** Define the before-season view ("Bookings open on 21 Dec"), the after-season view, and
whether the horizon is counted from today or from the season start.

### L-1 (low) Bookings left outside shortened operating hours or season have no defined status

**Location:** FR-20 third bullet; FR-4; FR-5; FR-24.

**Timeline:** Hours are cut to close at 20:00 and a 19:00–21:00 booking remains. Does it still
get its keybox email? Does it still generate the 21:15 kind-2 start (outside hours, so
presumably not)? Does FR-24 count its hours against bookable hours? The FR-4 invariant "no
booking may end after they end" is violated by design.

**Fix:** State that kept bookings stay fully valid (emails, heat, analytics) and are flagged
only. FR-24 uses the hours in force on each day.

### L-2 (low) DST: 24 elapsed hours is not "the day before at the same time"

**Location:** NFR-3; FR-10 ("when the keybox code will arrive"); UJ-3; Glossary *Booking horizon*.

**Timeline:** Booking on Sunday 28 Mar 2027 at 10:00 CEST (08:00 UTC). The cutoff is Saturday
27 Mar 09:00 CET, not 10:00. A confirmation email saying "Saturday at 10:00" is an hour off. A
horizon of "14 days" as 336 hours shifts the last bookable start by an hour across the switch.
Any later season starting before 31 Oct would also hit the repeated 02:00–03:00 hour.

**Fix:** State that the confirmation email gives the computed wall-clock time, and that the
horizon is counted in calendar days.

### L-3 (low) The user journeys contradict FR-3 and their own titles

**Location:** UJ-1 ("come 30–40 minutes early"); UJ-2 title ("with one email").

UJ-1 states a duration, but FR-3 and NFR-10 require a clock time ("arrive from 17:20"). UJ-2's
title says one email, but its narrative sends two: the hot email on Wednesday and the urgent
cold email on Thursday.

**Fix:** Align the wording.

### L-4 (low) The FR-18 preview and pending notifications for deleted bookings

**Location:** FR-18 first bullet; FR-12; FR-21.

**Timeline:** B's last-told state is cold. 10:00 A is created, so B is hot and a "now hot" email
is pending until 10:10. 10:05 the admin deletes A. The preview compares current state against
the post-delete state and says "hot → cold, will be emailed", but against last-told there is no
change and nothing is sent. Separately, if B itself is deleted at 10:05, nothing says the
pending email to B, or B's call-list entry, is cancelled. FR-11 covers this only for the keybox
email.

**Fix:** The preview compares against last-told. Deleting a booking cancels its pending emails
and removes it from the call list.

### L-5 (low) Start times that are several kinds at once

**Location:** Glossary *Start time* ("offered only with the durations that end at that point"); FR-4 ("only exists to …").

**Timeline:** A ends 16:00 and C starts 19:00. 16:15 is kind 2 (A + 15) and kind 3 (150 minutes
before C). The Glossary restricts it to 150 minutes, while FR-4 ("only exists") allows 60, 90,
120 and 150.

**Fix:** State in the Glossary that the duration restriction applies only to times that are
exclusively kind 3.

### L-6 (low) The settings have no defined ranges

**Location:** FR-20; Glossary *Changeover*, *Pre-heat window*.

A changeover of 0 makes "hot" mean back-to-back. A changeover of 20 produces drifting starts
(:20, :50, :10…). The pre-heat window is a range, but FR-3 needs one number. A changeover
longer than the pre-heat window makes FR-3's clamp unreachable. Operating hours past midnight
are undefined.

**Fix:** Give the allowed values (for example a changeover of 5–60 in 5-minute steps, and a
single pre-heat number for copy) and validate them.

### L-7 (low) Blocks next to or inside a changeover gap

**Location:** FR-4 ("No changeover is needed next to a block"); FR-17; FR-19.

**Timeline:** A 16:00–17:00 and B 17:15 (hot). An admin creates a 17:00–17:15 *maintenance*
block, for example to clean the stove. FR-17 allows it because there is no overlap. B stays hot
by rule, though the stove may be out. Also, a block starting exactly at 17:00 overlaps A's key
return.

**Fix:** State whether a block between A and its next booking cancels the hot state (which
would make block creation a heat-changing action), or forbid blocks inside a changeover gap.

## Counts

Critical 1 · High 6 · Medium 5 · Low 7
