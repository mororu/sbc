---
title: "PRD: Sauna Booking Calendar"
status: final
created: 2026-11-08
updated: 2026-11-08
---

# PRD: Sauna Booking Calendar

## 0. Document Purpose

This PRD is for the operators and for the downstream BMAD steps: UX (`bmad-ux`),
architecture (`bmad-architecture`) and epics and stories. It turns the final product brief
(`../../briefs/brief-sauna-booking-2026-08-23/brief.md`) and its addendum into testable
requirements. It does not repeat their reasoning. Technical inputs such as stack, hosting and
data-model sketch live in `../../architecture-inputs.md` and stay out of this document.

Terms in §4 Glossary are used exactly as defined. Requirements are numbered FR-1 to FR-31.
§11 records how the fast-path draft's assumptions were confirmed or corrected on 2026-11-08.

## 1. Vision

A wood-fired sauna wagon stands at the public lake-shore swimming place in winter, and anyone
may use it. This product is its booking calendar. It is a mobile-first page where a guest
sees the coming two weeks, takes the whole wagon for one to three hours, and gets the keybox
code by email the day before.

The calendar does one thing an off-the-shelf scheduler cannot: **it tells every guest whether
the sauna will be hot when they arrive.** A wood stove needs 30–40 minutes from cold. Whoever
books straight after another guest walks into a heated wagon. Whoever books after a gap has
to come early and light the fire. The calendar works this out per booking, says it plainly
before booking, and tells the guest if a later booking or a deletion changes it.

The operators get an admin portal to block time and remove bookings. Its second job is
evidence: by April it shows whether the season was worth repeating.

## 2. Why Now

The first season opens in **January 2027**. Guests can book up to two weeks ahead, so the
calendar must take bookings by **mid-December 2026**, about six weeks from this PRD. The
wagon is still being built and the app has not been started. MVP scope (§8) is cut to fit
that date.

## 3. Target User

### 3.1 Jobs To Be Done

**Guests.** Anyone at the lake, almost always on a phone, often outdoors and cold, often
deciding the same day.
- Find a time the wagon is free and claim it without asking anyone.
- Know before going whether they will be lighting the fire, and when to come.
- Get in without meeting anyone: the code arrives on its own.
- Not have to create an account or remember a password.

**Operators.** A handful of neighbours who built the wagon and keep it running in their
spare time. In the app they act as admins.
- Take the wagon out of service for cleaning, maintenance or private use.
- Remove a booking when a guest emails to cancel, without having to work out who is affected.
- Reach the one guest whose sauna just went cold at short notice.
- Answer four questions in April: when to clean, how much wood was burned, whether to repeat
  the season, and whether cold starts are what leaves time empty.

### 3.2 Non-Users (v1)

- Groups larger than six, or anyone wanting to share the wagon with strangers. Bookings are
  exclusive.
- Anyone expecting to pay through the app.
- Operators of other sites. There is one wagon at one location.

### 3.3 Key User Journeys

The journeys are illustrative: names and scenes were drafted and confirmed, not narrated by
real guests. All examples use a 15-minute changeover and a 30–40-minute pre-heat window.

- **UJ-1. Lena books a cold start for tonight.**
  Lena is on the shore after a swim at 15:30 and wants the sauna this evening. Lena opens the
  link on a phone, lands on today in German, and sees 18:00 free and marked *cold start:
  nobody before you, come between 17:20 and 17:30 and light the fire*. Lena picks 18:00,
  chooses 90 minutes and 3 people, and enters a name, email and mobile number. The
  confirmation screen repeats the heat state. Because 18:00 is less than 24 hours away, the
  keybox email arrives at once. **Edge case:** while Lena is typing, someone else books
  17:00–18:00. Lena's submit is refused because 18:00 is now inside the changeover. The day reloads and offers 18:15,
  now hot, and 18:30, still a cold start.

- **UJ-2. Jonas's booking turns hot, then cold again.**
  Jonas booked Saturday 18:30 on Monday as a cold start. Saturday already has a booking
  16:00–17:00. On Wednesday someone takes the hot 17:15 start for 60 minutes, ending 18:15,
  and once that has held for the settle delay, Jonas gets an email: *your sauna is now
  already hot at 18:30*. On Thursday an admin deletes that booking at the guest's request.
  Jonas's booking is a cold start again, and Jonas gets an urgent email to come between 17:50
  and 18:00 and light the fire. Had the 17:15 booking been made and deleted within the settle
  delay, Jonas would have received nothing, because the notice would still have matched
  Jonas's last-told notice.

- **UJ-3. Sara gets the keybox email the day before.**
  Sara booked Sunday 10:00 a week ago. At 10:00 on Saturday an email arrives in the language
  Sara booked in. It contains the keybox code and instructions, and the authoritative heat
  state *as of now*: still a cold start, so come between 09:20 and 09:30.

- **UJ-4. Ruth deletes a booking and phones the guest behind it.**
  Ruth, an operator, gets an email at 11:00 asking to cancel today's 16:00–17:00 booking. Ruth
  signs in with the shared password, opens the booking and sees a warning before confirming:
  *the 17:15 booking (Tom) will change from hot to cold start, less than 24 hours away: phone
  call needed*. Ruth deletes it. Tom's booking appears on the call list with a tap-to-call
  number and the message to give: *cold start, come between 16:35 and 16:45*. Ruth calls,
  then marks the call done.

- **UJ-5. The operators decide in April.**
  At the end-of-season meeting someone opens the admin analytics on a laptop: bookings by
  weekday and hour, cold starts per week as an estimate of fires lit, unique and repeat
  guests, how much bookable time stayed empty, and whether the empty time was mostly time
  that would have been a cold start.

## 4. Glossary

- **Wagon**: the single sauna wagon. There is one, at one location.
- **Operator**: one of the neighbours who run the wagon. Acts in the app as an admin.
- **Admin**: anyone signed in with the shared admin password.
- **Season**: a date range in which the wagon can be booked. Set by an admin and kept as its
  own record, so past seasons keep their dates. First season: January–April 2027,
  exact dates to be set by the admins.
- **Operating hours**: the daily time range within which bookings may start and must end.
  Set by an admin. The same every day of the season.
- **Booking**: an exclusive reservation of the wagon by one guest. It has a start time, a
  duration of 60–180 minutes in 30-minute steps, a party size of 1–6, a language, and the
  changeover in force when it was made. A booking either exists or has been deleted; there
  is no other state.
- **Guest**: the person who made a booking, identified by name, email and mobile number. Not
  an account. Two bookings with the same email (compared case-insensitively) are the same
  guest for analytics.
- **Block**: an admin-created period in which the wagon cannot be booked, with a reason of
  *cleaning*, *maintenance* or *private use*. A block is not a booking and never heats the
  wagon, whatever its reason.
- **Changeover**: the break the wagon needs between two bookings, for the key return and
  handover. Default 15 minutes, set by an admin. Each booking records the changeover in force
  when it was made. Changing the setting affects only bookings made afterwards.
- **Back to back**: two bookings are back to back when the time between the first one's end
  and the second one's start equals the changeover recorded on whichever of the two was made
  later.
- **Start time**: a time within operating hours at which a booking may begin. There are three
  kinds:
  1. every full and half hour;
  2. the end of each booking plus one changeover (for example 18:15 after a booking that
     ends at 18:00);
  3. any time from which a booking would end exactly one changeover before an existing
     booking (for example 17:45 for 60 minutes, or 17:15 for 90 minutes, before a booking at
     19:00).

  A start time that is only of the third kind is offered only with the durations that end at
  that point. A start time that is also of the first or second kind offers every duration
  that fits.
- **Heat state**: either **hot** or **cold start**.
  - A booking or free start time is **hot** if and only if it is back to back with a booking
    before it (for a free start time, using the current changeover).
  - Otherwise it is a **cold start**. Any longer gap does not count as warm, and neither does
    a block.

  The heat state is derived from the bookings and is never stored as truth while a booking is
  in the future. It is recorded once, at the booking's start time, for analytics (FR-30).
- **Pre-heat window**: how long before a cold start the guest should arrive to light the
  fire, as a range. Default 30–40 minutes, both ends set by an admin. It is free and not part
  of the booking. It may begin before operating hours.
- **Arrival time**: for a cold start, the clock-time range in which the guest should arrive,
  shown as "come between 17:20 and 17:30". Its **earliest arrival** is the start time minus
  the longer end of the pre-heat window, moved later if needed to the end of any booking in
  the window plus that booking's changeover, or to the end of any block in the window. Its
  **latest arrival** is the start time minus the shorter end of the pre-heat window. If the
  earliest arrival is later than the latest arrival, there is less time to heat than the
  pre-heat window, and the arrival time is just the earliest arrival. For a hot booking there
  is no arrival time; the guest comes at the start time.
- **Notice**: what a guest needs to know about the wagon's state: the heat state and, for a
  cold start, the arrival time.
- **Last-told notice**: the notice the guest of a booking was most recently given, by the
  confirmation screen and email, a heat-change email, the keybox email, or an admin's phone
  call. An email updates it only if the mail service accepted the email.
- **Heat change**: a booking's current notice differs from its last-told notice in heat
  state, in an earliest arrival that is now *later*, or in a latest arrival that is now
  *earlier*. Changes in the other direction only widen the range and are not a heat change:
  they are harmless and not worth a message.
- **Affected booking**: for a booking or block, the first booking that starts after it ends,
  if that booking starts no later than one changeover plus the longer end of the pre-heat
  window after that end. Creating or deleting a booking or block can only cause a heat
  change in its affected booking.
- **Settle delay**: how long a booking's current notice must stay unchanged before a
  heat-change email is sent. 10 minutes. It restarts with every change.
- **Keybox code**: the code that opens the keybox holding the wagon key. Set and changed by
  an admin.
- **Keybox email**: the email with the keybox code and access instructions, sent 24 hours
  before the start time.
- **24-hour cutoff**: the point 24 hours of real time before a booking's start time.
- **Call list**: the admin view of bookings whose guest must or may be phoned (FR-21).
- **Booking horizon**: how many calendar days after today guests can book. Default 14, set
  by an admin: on 26 December, guests can book up to and including 9 January.

## 5. Features

### 5.1 Availability Calendar and Heat State

**Description:** The page opens with no sign-in. A guest moves between days up to the
booking horizon. Each day shows its start times. Taken time (bookings and blocks) is shown as
unavailable without names or reasons. Every free start time shows its heat state, and cold
starts show the arrival time. Realizes UJ-1.

#### FR-1: Browse availability
A guest can see every day from today to the end of the booking horizon that falls inside a
season, with each start time marked free or unavailable. Realizes UJ-1.

**Consequences (testable):**
- Days outside a season or beyond the booking horizon are not selectable.
- Before a season, the page says when it opens and from which date booking opens
  ("Season opens 9 January. Booking opens 26 December."). After the last season it says the
  season is over.
- Start times already past are not offered.
- An unavailable start time reveals nothing about who booked it or why it is blocked.

#### FR-2: Heat state on every free start time
Each free start time shows hot or cold start according to the heat state rule
in §4. Realizes UJ-1.

**Consequences (testable):**
With a 15-minute changeover:
- With a booking 17:00–18:00 and nothing else, 18:15 is offered and shows hot. 18:30 and
  19:00 show cold start. 18:00 is not offered.
- With bookings 17:00–18:00 and 19:00–20:00, the 19:00 booking is a cold start.
- With only a booking at 19:00, 17:45 is offered for 60 minutes and 17:15 for 90 minutes.
  Booking either one turns the 19:00 booking hot.
- A booking that starts right after a block of any reason is a cold start.
- A start time's heat state does not depend on the duration the guest later chooses.

#### FR-3: Arrival time shown on cold starts
Every cold start shows its arrival time as clock times ("come between 17:20 and 17:30"),
not as a duration. Realizes UJ-1, UJ-3.

**Consequences (testable):**
With a 30–40-minute pre-heat window:
- A cold start at 18:00 shows 17:20–17:30.
- If a block ends at 17:25, a cold start at 18:00 shows 17:25–17:30.
- If a booking ends at 17:30 with a 15-minute changeover, a cold start at 18:00 shows only
  17:45, and the text says how many minutes there are to heat ("only 15 minutes to heat: it
  will still be warming up").
- If the arrival time is already past when booking, the text says to come as soon as
  possible and that the wagon will not be fully hot at the start.

#### FR-4: Start times
Start times follow the definition in §4, within the operating hours an admin has set
(FR-20).

**Consequences (testable):**
- No start time is offered before the operating hours begin, and no booking may end after
  they end.
- No start time is offered less than one current changeover after a booking ends.
- No changeover is needed next to a block.

### 5.2 Booking

**Description:** The guest picks a start time, then a duration and party size, then enters
contact details. The form only offers durations that fit. Booking must take under a minute
on a phone outdoors. Realizes UJ-1.

#### FR-5: Make a booking
A guest can book a free start time by choosing a duration (60, 90, 120, 150 or 180 minutes)
and a party size (1–6), and entering a name, email address and mobile number. Realizes UJ-1.

**Consequences (testable):**
- Durations that would overlap a block, end less than one current changeover before the next
  booking, or run past the end of operating hours or of the season are not offered.
- An invalid email or mobile number is rejected with an inline message, without losing what
  was typed.
- A booking needs no account, password or verification step.

#### FR-6: No double booking
A new booking can never start or end less than one current changeover from another booking,
or overlap a block. Pairs of existing bookings made under an earlier, shorter changeover stay
valid. Realizes UJ-1.

**Consequences (testable):**
- Of two simultaneous attempts on conflicting time, exactly one succeeds.
- The other guest sees a clear message and the refreshed day, and keeps the entered contact
  details.

#### FR-7: Notice at booking
The confirmation screen shows the booking's notice at that moment, and that notice is stored
as the last-told notice. Realizes UJ-1.

#### FR-8: Booking window
Bookings are accepted from now until the end of the booking horizon, inside a season. A
start time can be booked until it begins; there is no minimum lead time. Realizes UJ-1.

#### FR-9: Privacy information
The booking form links to the privacy statement (FR-29) and says, in one line, why each field
is collected. This information is enough; there is no consent checkbox.

### 5.3 Guest Emails

**Description:** Every guest-facing email is sent in the language the booking was made in.
The confirmation states how things stand at booking. The keybox email states how they stand
24 hours before, and that state is authoritative. Before the keybox email, heat-change emails
keep the guest informed. After it, changes go to the call list. Realizes UJ-1, UJ-2, UJ-3.

#### FR-10: Confirmation email
On booking, the guest receives an email with the date, start time, duration, party size, the
notice at booking, a note that the notice can change and that the guest will be told, how to
cancel (by email to the admins), and when the keybox code will arrive.

#### FR-11: Keybox email
At the 24-hour cutoff, the guest receives the keybox email. It contains the current keybox
code, the access and return instructions, and the current notice. Realizes UJ-3.

**Consequences (testable):**
- A booking made after its 24-hour cutoff gets the keybox email immediately after the
  confirmation (UJ-1).
- If accepted by the mail service, its notice becomes the last-told notice.
- A deleted booking never receives a keybox email.
- If sending is delayed (for example after downtime), the email is still sent late, up to
  the start time.

#### FR-12: Heat-change email
Until a booking's keybox email has been sent, a heat change is emailed to the guest once
the notice has been stable for the settle delay. Realizes UJ-2.

**Consequences (testable):**
- At the moment of sending, the notice is compared again with the last-told notice. If they
  match, nothing is sent. Book-then-delete inside the settle delay sends nothing.
- No heat-change email is sent once the keybox email has gone out. The keybox email carries
  the current notice instead.
- Hot → cold start and a later earliest arrival are marked urgent and give the arrival time.
- Cold start → hot is also sent, as good news.
- Creating or deleting a booking or block can only cause a heat change in its affected
  booking. Settings changes are covered by FR-20.

#### FR-13: Heat changes after the keybox email go to the call list
When a booking whose keybox email has been sent has a heat change, no email is sent and the
booking appears on the call list (FR-21). Realizes UJ-4.

**Consequences (testable):**
- Hot → cold start and a later earliest arrival are marked *call required*.
- Cold start → hot is marked *optional*.
- If the notice changes back to the last-told notice before anyone calls, the entry leaves
  the call list.
- Until the keybox email has been sent, nothing goes on the call list: the pending keybox
  email will carry the current notice.

#### FR-14: Failed sends go to the call list
If the mail service refuses a keybox email or an urgent heat-change email, the booking goes
on the call list as *call required*, with the reason. The last-told notice is not updated.
Other refused emails are shown with the booking. Bounces that arrive later are out of scope.

### 5.4 Admin Portal

**Description:** One shared account for the operators, usable on a phone and on a laptop.
Admins see all bookings with contact details, block time, delete bookings and blocks, work
the call list, and change settings. Before anything that causes a heat change, the admin is
shown who will be affected and how. Realizes UJ-4, UJ-5.

#### FR-15: Shared admin sign-in
An admin signs in with the single shared password. Guests never sign in.

**Consequences (testable):**
- After 5 wrong passwords from one address, at most one attempt per minute is accepted.
- Changing the password signs out every other admin session.

#### FR-16: Booking list
An admin can see bookings by day with the guest's name, email, mobile number, party size,
current notice, last-told notice, and keybox-email status including the code it contained.

#### FR-17: Create a block
An admin can create a block with a start, an end and a reason (cleaning, maintenance or
private use).

**Consequences (testable):**
- A block overlapping an existing booking is refused, and the conflicting bookings are
  listed. Blocks never remove bookings.
- A block inside the changeover between two back-to-back bookings is refused.
- Before saving, the admin sees any heat change the block causes in its affected booking
  (a later earliest arrival), and whether it will be emailed or needs a call.

#### FR-18: Delete a booking or block
An admin can delete a booking or a block in the future. Realizes UJ-4.

**Consequences (testable):**
- Before deleting, the admin sees the affected booking (guest name), its heat change measured
  against its last-told notice, and whether it will be emailed (FR-12) or needs a call
  (FR-13).
- Deleting a booking cancels its pending emails and removes it from the call list.
- The deleted booking's guest is not emailed automatically: the guest asked for it, and an
  admin replies personally. FR-31 reminds the admin to do so.
- Bookings whose start time has passed cannot be deleted.

#### FR-19: Blocks never heat
No block heats the wagon, whatever its reason. A booking that starts right after a block is a
cold start, including after a private-use block. This is deliberately conservative, like the
gap rule: the private party may not have lit the stove.

#### FR-20: Settings
An admin can set the season start and end, the operating hours, the changeover, the booking
horizon, the pre-heat window, the keybox code, the access and return instructions in German
and English, the admin contact address shown to guests, and the admin password.

**Consequences (testable):**
- Allowed values: changeover 0–60 minutes; each end of the pre-heat window 15–90 minutes,
  with the shorter end not above the longer one; both in 5-minute steps; booking horizon
  1–60 days.
- A new changeover applies to bookings made afterwards. Existing bookings keep their times and
  their heat states, and no emails are triggered by the change.
- The keybox code can be changed at any time, so the operators can rotate it. Every keybox
  email uses the code that is current when it is sent. Emails already sent are not resent.
  There is no automatic rotation and no scheduling of future codes in v1.
- Shortening a season or the operating hours never deletes existing bookings. They stay fully
  valid (emails, heat state, analytics) and are flagged to the admins.
- A change to the pre-heat window can cause heat changes (later earliest arrivals). The admin
  sees how many bookings are affected before saving.

#### FR-21: Call list
An admin can see every booking on the call list with the guest's name, a tap-to-call mobile
number, start time, the notice to give, the last-told notice, and whether a call is required
or optional. The admin can mark an entry as called. Realizes UJ-4.

**Consequences (testable):**
- The call list is visible from the admin home screen with a count.
- Marking as called stores the notice the entry displayed as the last-told notice. If the
  notice changed since the entry was displayed, the action is refused and the entry is shown
  again with the new notice.
- Entries whose start time has passed drop off the list.

#### FR-31: Reminder to answer a cancelled guest
Deleting a booking creates a reminder for the admins to email that guest personally.
Realizes UJ-4.

**Consequences (testable):**
- Right after the deletion, the admin sees the reminder with the guest's name, email address,
  and the deleted booking's date and time.
- Tapping the email address opens a new email to the guest with a short prepared text in the
  booking's language, which the admin can edit before sending from their own mail program.
- The reminder stays on the admin home screen, next to the call list and with its own count,
  until an admin marks it done. It is shared by all admins, so one admin's reply clears it
  for everyone.

### 5.5 Season Analytics

**Description:** Four questions and nothing else, viewable by admins. The figures come from
the analytics records (FR-30), so they do not change when settings change, and they remain
available after personal data is deleted (FR-28). Realizes UJ-5.

#### FR-22: When should we clean?
Bookings and booked hours by weekday, by hour of day, and by week of the season.

#### FR-23: How much wood are we burning?
Cold-start bookings per week and per season, labelled as the estimate of fires lit.

#### FR-24: Is this worth repeating?
For the season: number of bookings, booked hours, unique guests, share of guests who booked
more than once, and the share of bookable hours (operating hours in force each day, minus
blocks) that stayed empty. The changeover after each booking counts as used, not empty.

#### FR-25: Are empty start times empty because they are cold starts?
For the season, counted per start time: each free start time of the first or second kind
that passed without being booked is counted once, as hot or cold start according to its heat
state when it passed. This split is compared with the same split for booked start times.

**Consequences (testable):**
- The view states its question in plain words and gives a one-line reading, for example
  "Cold-start times were booked about half as often as hot times".

#### FR-30: Analytics record
From the first booking, the system keeps an analytics record. **This is MVP scope even though
the views (FR-22 to FR-25) may follow.**

**Consequences (testable):**
- At each booking's start time, a record is kept of its date, start time, duration, party
  size, heat state, the changeover it was made under, and a one-way key derived from the
  guest's email.
- Each operating day records its operating hours, its blocks, and the free start times that
  passed unbooked with their heat state (for FR-25).
- Bookings deleted before their start time are not part of the analytics.
- The records contain no name, email or mobile number and survive the deletion in FR-28.

### 5.6 Language

#### FR-26: German default, English alongside
All guest-facing text (pages, errors, emails, keybox instructions) exists in German and
English. German is the default. A guest can switch language from any page, and the choice is
remembered on that device.

#### FR-27: Language per booking
Each booking stores the language it was made in, and every email for that booking uses it.
The admin portal also follows the language switch; admin-only text may stay German if time
runs short.

### 5.7 Data Protection

**Description:** The app collects personal data from the public, in Switzerland, so it falls
under the Swiss Federal Act on Data Protection (FADP/nDSG). The rules are kept simple:
collect only what has a stated purpose and delete it on a schedule.

#### FR-28: Retention
The name, email and mobile number of every booking, including deleted bookings, are deleted
automatically 30 days after the end of the season the booking belongs to. Only the analytics
records (FR-30) remain.

#### FR-29: Privacy statement
A public privacy statement, in German and English, names the operator contact, each field
with its purpose (email for confirmation and keybox code, mobile for the short-notice phone
call, name to identify the booking at the wagon), the retention period, and that no tracking
or third-party analytics are used.

## 6. Cross-Cutting Non-Functional Requirements

- **NFR-1 Mobile first.** Every guest flow works one-handed on a 360 px-wide phone screen.
  Tap targets are at least 44 px. Text contrast meets WCAG 2.1 AA, for reading outdoors in
  low light or glare.
- **NFR-2 Speed.** A first-time guest can book in under a minute. The calendar is usable
  within 3 seconds on a mid-range phone over 4G. There is no formal page-weight budget.
- **NFR-3 Time.** All times are Europe/Zurich wall-clock time, including the switch to summer
  time on 28 March 2027. The 24-hour cutoff is measured in real elapsed time; emails state
  clock times, never "same time tomorrow". The booking horizon is counted in calendar days.
- **NFR-4 Timeliness of emails.** Keybox emails are sent within 15 minutes after the 24-hour
  cutoff. Heat-change emails are sent within 15 minutes after the settle delay.
- **NFR-5 Deliverability.** Emails come from a sender on the project's own domain with
  standard authentication, so they reach common Swiss and international mailboxes rather than
  spam folders.
- **NFR-6 No lost bookings.** Bookings are backed up daily to a location off the server. A
  restore is tested before the season opens.
- **NFR-7 Admin security.** Admin pages are reachable only after sign-in, only over HTTPS,
  and the password is stored only as a strong hash. Guest contact details are never shown on
  public pages.
- **NFR-8 Privacy by default.** No third-party trackers or analytics. Only cookies essential
  for language choice and admin sessions.
- **NFR-9 Quiet off-season.** The app may sit idle for months between seasons. It comes back
  after a server restart without manual steps, its certificate renews automatically, and
  scheduled emails missed during downtime are sent when it is back (FR-11).
- **NFR-10 Plain voice.** Guest-facing text speaks like a neighbour, not a booking system:
  short, concrete and friendly, as in *"Nobody before you: come between 17:20 and 17:30 and
  light the fire"* or *"Already hot at 18:15."* Notices always give a clock time and never
  hedge. The same voice applies in German and English.

## 7. Non-Goals

- Payment of any kind. Handled outside the app, if at all.
- Guest accounts, guest sign-in, and guest self-service cancellation.
- Rescheduling, and bookings created by admins on a guest's behalf. A guest who wants a
  different time asks for the booking to be deleted and books again.
- A per-person booking limit. Deferred; email is collected from day one so it can come later.
- Email verification at booking. The keybox email is the verification for v1.
- Waiting lists, reminders beyond the keybox email, SMS or push notifications.
- More than one wagon or location.
- Sensors, a live temperature, or any claim about the actual wagon temperature. The heat
  state is a rule, not a measurement.
- No-show tracking, deposits or penalties.
- A native app.

## 8. MVP Scope

### 8.1 In Scope (live by mid-December 2026)

- Calendar with heat state and arrival time (FR-1 to FR-4)
- Booking (FR-5 to FR-9)
- Confirmation, keybox and heat-change emails, the call list, and the reminder for cancelled
  guests (FR-10 to FR-14, FR-21, FR-31)
- Admin sign-in, booking list, blocks, deletion, settings (FR-15 to FR-20)
- Analytics record (FR-30)
- German and English (FR-26, FR-27)
- Retention and privacy statement (FR-28, FR-29)

### 8.2 Can Follow During the Season

- Season analytics views (FR-22 to FR-25). FR-30 records the data from the first booking, so
  the views only need to exist by the April decision. Deferring them buys time for the
  December deadline.
  `[NOTE FOR PM: the analytics are the operators' reason to keep the app past April.
  Deferring the views is safe only because FR-30 ships in the MVP.]`

## 9. Success Metrics

**Primary**
- **SM-1: No unexpected cold sauna.** No guest reports arriving to a cold wagon after being
  told it would be hot, or being told to arrive earlier than was possible. Counted by the
  admins from complaints. Validates FR-2, FR-3, FR-11 to FR-14, FR-21.
- **SM-2: Cold starts still get booked.** How often cold-start times are booked compared with
  hot times (FR-25). No target for the first season: it sets the baseline, and the operators
  judge it in April. Validates FR-2, FR-3.

**Secondary**
- **SM-3: Fast booking.** No guest or admin reports booking as fiddly. Spot-checked by the
  operators on their own phones before launch, against the one-minute target. Validates FR-5,
  NFR-1, NFR-2.
- **SM-4: The April question is answerable.** The operators decide on next season using the
  analytics views, not memory. Validates FR-22 to FR-25, FR-30.

**Counter-metrics (do not optimise)**
- **SM-C1: Utilisation.** More bookings is not the goal. The wagon is run by volunteers, and
  every booking costs wood and cleaning. Counterbalances SM-2.
- **SM-C2: Share of hot start times.** Never loosen the heat rule to make more start times
  look hot. A wrongly promised hot sauna is worse than a fire lit for nothing. Counterbalances
  SM-2.

The outcome that matters most, that the first guest of a day actually lights the fire,
cannot be measured by the app. It is judged by whether anyone complains.

## 10. Open Questions

1. **Sender and domain.** The domain is not registered yet. Which domain and sender address
   will the emails come from? *Needed before launch, not before architecture.*
2. **Exact season dates.** When does the first season open and close? Admins can set and
   move them (FR-20), so this does not block the build.
3. **Admins.** How many operators share the password, and who changes it when people leave?
4. **Operations (not product).** Who stocks wood, who cleans, how often. Analytics provide
   the evidence; nothing in the app assigns these jobs.
5. **Hosting.** The shared beehiveJournal server or a separate one? Decided in architecture.

## 11. Assumptions Index

All assumptions from the fast-path draft were reviewed by the user on 2026-11-08. None remain
open. Two were corrected:
- The pre-heat window stays a range (default 30–40 minutes) instead of a single number. The
  arrival time is therefore shown as a range (§4, FR-3).
- Deleting a booking still sends the guest no automatic email, but now reminds the admins to
  reply personally (FR-31).

The rest were confirmed and are now plain statements in the text, including: the same
operating hours every day, the 10-minute settle delay, no minimum lead time, emailing
cold start → hot as good news, optional calls for cold start → hot, the settings ranges, a
manually rotated keybox code, a 15-minute email timeliness target, and analytics views that
may follow the launch.
