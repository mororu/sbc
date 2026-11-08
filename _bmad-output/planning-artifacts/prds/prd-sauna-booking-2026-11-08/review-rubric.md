# PRD Quality Review — Sauna Booking Calendar

## Overall verdict
This PRD is solid enough to build from in six weeks. It has a clear thesis ("it tells every guest whether the sauna will be hot when they arrive"), a precise Glossary that defines the heat rule exactly, worked examples, honest counter-metrics and a clean Non-Goals list. The weak point is at the edge of that thesis. The PRD tracks only *hot vs cold start*, but it also promises guests an arrival clock time, and nothing detects or communicates a change to that time. Changing the changeover setting breaks the FR-6 invariant and the "only the next booking" rule. The NOTE FOR PM sets a condition for deferring analytics ("data recorded from day one"), but no MVP requirement owns that condition. Fix those three and confirm the load-bearing assumptions, and this is ready for UX and architecture.

## Decision-readiness — strong
Decisions are stated as decisions, with what was given up. FR-19 makes blocks never heat "deliberately conservative... the private party may not have lit the stove". SM-C2 says "A wrongly promised hot sauna is worse than an unneeded match". §8.2 defers analytics with its risk named in a NOTE FOR PM, a real tension rather than a safe checkpoint. The Open Questions are genuinely open, and each says whether it blocks anything ("Needed before launch, not before architecture"; season dates do "not block the build"). Q4 correctly moves operations out of product scope.

The one soft spot is that the §8.2 NOTE FOR PM describes a condition but does not resolve it (see Strategic coherence). Also, Vision says the calendar "does one thing an off-the-shelf scheduler cannot", while the NOTE calls analytics "one of the two core differentiators". Pick one framing so a reader pushing back on deferring analytics knows how much weight they carry.

### Findings
- **low** Differentiator count inconsistent (§1 Vision vs §8.2 NOTE FOR PM). The Vision says "one thing" and the NOTE says "two core differentiators". *Fix:* Either name analytics as the second differentiator in §1, or reword the NOTE ("analytics are the operators' reason to exist past April").

## Substance over theater — strong
There is no furniture. There are two user groups, both driving FRs. The JTBD bullets map directly to features: "Remove a booking ... without having to work out who is affected" leads to the FR-18 warning, and "Reach the one guest whose sauna just went cold" leads to FR-21. The Vision is specific to this product and could not be swapped into another scheduler PRD. The NFRs have product-specific bounds (360 px, 44 px targets, WCAG AA "for reading outdoors in low light or glare", the DST date 28 March 2027, "24-hour cutoff is measured in real elapsed time"). NFR-10 Plain voice is unusually useful, with concrete example strings. The analytics are limited to "Four questions and nothing else".

NFR-9 "must not need care to stay up" is the only adjective-only NFR. It is acceptable at these stakes but could name what "care" excludes, such as manual certificate renewal or a manual restart after reboot.

### Findings
- **low** NFR-9 is unbounded (§6 NFR-9). "Must not need care to stay up" gives architecture nothing to check against. *Fix:* Add one or two concrete conditions, for example "survives a host reboot without manual steps; TLS renews automatically; the scheduled keybox send resumes after downtime (see FR-11)".

## Strategic coherence — adequate
The thesis is explicit and the features serve it: per-slot heat state (FR-2/3), notification when it changes (FR-12/13), the authoritative keybox email (FR-11), the admin delete warning (FR-18), and analytics that test whether cold starts deter bookings (FR-25, SM-2). The counter-metrics SM-C1 and SM-C2 are well chosen and tied to SM-2. The MVP is a problem-solving MVP, and the scope logic matches it.

It drops from strong to adequate because the guarantee the thesis promises is only half-modelled. Vision and JTBD promise the guest will "know ... how early to come", and FR-3/NFR-10 make that a clock time ("arrive from 17:20"). But the only stored and tracked value is hot/cold ("Last-told state ... The only heat-related value that is stored"). A later booking that ends inside an existing cold-start guest's pre-heat window changes their arrival time without any heat change, so no email or call is triggered. Example: Lena is told "arrive from 17:50" for an 18:30 cold start. Someone then books 17:00–18:00. That is legal, because 18:30 ≥ 18:00 + 15. Lena's arrival is now 18:15, and she would walk in on another party. This is exactly the failure SM-1's spirit is meant to prevent.

Also, the §8.2 deferral is "safe only if the underlying data is recorded from day one", but §8.1 has no requirement that records it. Most analytics can be derived from bookings and blocks. However, FR-24 "season × operating hours, minus blocks" and FR-25 "would have been hot" depend on the operating hours and changeover *as they were* on each day. FR-20 lets admins change both mid-season, and nothing requires keeping that history. Deleted bookings' fate is also unspecified ("A booking either exists or has been deleted"): are they hard-deleted, or kept and excluded?

### Findings
- **high** Arrival-time changes are not detected or communicated (§4 Glossary "Last-told state", "Heat change"; FR-3; FR-12; FR-13). FR-3 makes the arrival clock time depend on neighbouring bookings, but heat-change detection only compares hot/cold. A booking added after confirmation can end inside a cold-start guest's pre-heat window, so the guest arrives while another party is still inside. *Fix:* Choose one. (a) Forbid bookings that would end inside an existing cold start's pre-heat window. This makes the pre-heat window effectively reserved, and FR-5's duration filter needs a matching consequence. (b) Extend last-told state to "heat state + arrival time" and treat an arrival-time change as a heat change for FR-12/FR-13. Option (a) is simpler and matches "Free of charge and not part of the booking" less well, so say which was chosen.
- **high** The precondition for deferring analytics is not owned by any MVP requirement (§8.2 NOTE FOR PM; FR-20; FR-24; FR-25; FR-28). *Fix:* Add an MVP FR, for example "FR-30: Analytics record", requiring from the first booking: (1) deleted bookings kept as non-counting records, or explicitly hard-deleted; (2) a dated history of operating hours, changeover and season settings; (3) the one-way guest key from FR-28 computed at booking time. List it in §8.1.
- **low** SM-1 relies on complaints only (§9 SM-1). This is fine at these stakes, but the PRD could add that admins log call-list outcomes, which FR-21 "mark as called" already partly does. No fix required.

## Done-ness clarity — adequate
This is the strongest part of the PRD. The Glossary heat rule is exact ("hot if and only if a booking ends exactly one changeover before it"). FR-2 has worked numeric examples, and UJ-2 walks through the settle-delay logic precisely. The FRs without Consequences (FR-7, FR-8, FR-10, FR-16, FR-19, FR-22–24, FR-26, FR-27, FR-29) are mostly testable as written because they list concrete fields. The defects are a handful of rule interactions that an engineer will hit on day one, plus one internal contradiction in a UJ.

### Findings
- **high** Changing the changeover breaks FR-6 and the "next booking only" rule (FR-2 last consequence; FR-6; FR-12 "A change can only ever affect the next booking"; §4 "Next booking"; FR-20). FR-2 says existing bookings "keep their times" when the changeover changes. If the changeover rises from 15 to 20 minutes, existing pairs 15 minutes apart now violate FR-6 "can never have two bookings less than one changeover apart". Under the "exactly one changeover" rule, any change in either direction turns every currently hot booking into a cold start at once. That is a mass heat change, contradicting "can only ever affect the next booking", and FR-20 has no pre-confirmation warning even though §5.4 promises one "before anything that causes a heat change". *Fix:* Either (a) evaluate heat and spacing against the changeover in force when each booking was made (store it per booking), or (b) add an FR-20 consequence: changing the changeover shows the affected bookings and their heat changes before confirming, FR-6 applies only to new bookings, and the "next booking only" statements are qualified with "except settings changes".
- **medium** UJ-1's edge case contradicts the start-time rules (§3.3 UJ-1). "Someone else books 18:00 ... 18:30 is offered instead". Every booking is at least 60 minutes, so a booking at 18:00 ends at 19:00 or later and 18:30 cannot be free. The first new start time would be 19:15 at the earliest, and it would be *hot*, which is a better illustration of the thesis anyway. *Fix:* Rewrite the edge case, for example "18:00–19:00 is taken; the day reloads and offers 19:15, now marked hot".
- **medium** The pre-heat window is a range but the displayed arrival time is a single clock time, and its interaction with operating hours is unstated (§4 "Pre-heat window"; FR-3; UJ-3; NFR-10). The setting is "30–40 minutes", but FR-3 requires one clock time, and UJ-3 ("arrive from 09:20" for 10:00) implies the 40-minute end without saying so. Also, nothing says whether the pre-heat window may start before operating hours begin. That matters for UJ-3 if hours open at 10:00. There is also no statement that a cold start whose arrival time is pushed back by FR-3's second consequence still leaves too little time to heat. *Fix:* In FR-3, state that "arrive from" uses the window's upper bound (or store a single value). State whether the pre-heat window may precede operating hours. Decide whether the UI warns when less than the minimum heating time remains.
- **medium** FR-25 has no unit of measure for "empty bookable time that would have been hot" (FR-25). Under the Glossary, "hot" applies to a start *point*, not a span. How empty *time* is split into hot vs cold is undefined: per 30-minute grid slot, per minute, per first slot after a booking? *Fix:* Define the unit, for example "each free half-hour start time in operating hours counts once, classified by its heat state at that moment; the end-plus-changeover start time counts as hot".
- **low** FR-15 throttling has no bound (FR-15 "Repeated wrong passwords are slowed down"). *Fix:* Give a threshold, for example "after 5 failures from one IP, at most one attempt per minute".
- **low** FR-28 retention is stated twice, loosely (FR-28 "after a retention period" ... "30 days after the season ends"). It also doesn't say whether deleted bookings' personal data is purged sooner. *Fix:* State the 30-day rule once, and add "including deleted bookings" or a shorter period for them.
- **low** Block in a changeover gap is unspecified (FR-4 "No changeover is needed next to a block"; FR-17). A block placed in the 15-minute gap between two hot-adjacent bookings is allowed by FR-17, which refuses only overlap with bookings, yet the second booking stays "hot" by the Glossary rule. *Fix:* Either refuse blocks that sit inside a changeover, or state that this is acceptable.

## Scope honesty — adequate
Non-Goals (§7) does real work. It explicitly rules out self-cancellation, email verification, a per-person limit ("email is collected from day one so it can come later"), and "any claim about the actual wagon temperature. The heat state is a rule, not a measurement", which is a valuable guardrail. The [ASSUMPTION] tags sit on genuine inferences and are indexed.

Open-items density is the concern for a build-now PRD: 19 [ASSUMPTION] tags, 1 NOTE FOR PM and 5 Open Questions, after a revision pass that supposedly incorporated the user's answers. Most are low-risk defaults that are fine at neighbourhood stakes. A few are load-bearing for architecture and stories and should be confirmed or promoted to decisions before handoff:
- FR-12 settle delay of 10 minutes, together with NFR-4's 15 minutes
- FR-4 same operating hours every day, which shapes the settings data model
- FR-4 no changeover next to a block
- FR-17 blocks refuse rather than remove
- §3.3 "journeys ... have not been narrated by the user"

There are also leftover draft markers: "*Working title. Please confirm.*" (line 9) and `status: draft`.

### Findings
- **medium** Load-bearing assumptions remain unconfirmed after the revision pass (§11; FR-4; FR-12; NFR-4; FR-17). With roughly 6 weeks to launch, architecture will build on these. *Fix:* Ask the user to confirm the five listed above in one batch. Convert confirmed ones to plain statements and remove them from §11.
- **low** Non-goal missing for booking changes (§7). Guests cannot modify a booking, and admins cannot create or move a booking on a guest's behalf. That is implied by FR-5 and FR-18 but never stated, and a guest emailing "can I move to 19:00?" is likely. *Fix:* Add "Rescheduling, and admin-created bookings: a guest who wants a different time cancels by email and books again" to §7 (or add an admin-create FR if that is wanted).
- **low** Leftover draft markers (line 9 "Working title. Please confirm."). *Fix:* Confirm the title or drop the line.

## Downstream usability — strong
This PRD feeds bmad-ux, bmad-architecture and stories, and it is well set up for that. The Glossary is precise and used consistently in the FRs. The IDs are contiguous and unique: FR-1–29, UJ-1–5, NFR-1–10, SM-1–4, SM-C1–2. FRs carry "Realizes UJ-n" links, and SMs carry "Validates FR-n" links. §0 sends technical inputs to `architecture-inputs.md` instead of repeating them. Each UJ has a named protagonist and concrete times. The minor drift issues are listed below under Mechanical notes.

## Shape fit — strong
This is a public-facing consumer flow (guests) plus a small multi-operator admin tool. UJs with named protagonists are justified for the guest side and for the one admin moment that matters (UJ-4). UJ-5 is thin but harmless. The rigor is right for the stakes: there is no compliance theater, and the data protection section is a short FADP/nDSG treatment that leads to two concrete FRs. Nothing is over-formalized.

## Mechanical notes
- **Assumptions Index roundtrip:** all 19 inline tags are indexed, and every index entry appears inline. One wording drift: the §2 index entry adds "and the app is not yet started", which the inline tag does not say.
- **Glossary drift:**
  - "slot" (§1 "per slot", SM-2, SM-C2, UJ-4 context) is used informally for "start time" / "booking". Replace it or add it to the Glossary.
  - "settle delay" is used in FR-12, NFR-4 and UJ-2 but is not defined in §4. Add it to the Glossary.
  - "keybox code" is used in the Glossary and FR-20 but has no definition of its own. That is minor.
  - "neighbour-operators" / "operators" / "admins" / "Admin" are used interchangeably. The Glossary defines only Admin. Either add "Operator" or use "admin" in requirement text.
- **ID / cross-references:**
  - FR-7 and FR-8 have no "Realizes" link, though both realize UJ-1.
  - §0 says "Requirements are numbered FR-1 to FR-N". Replace this with FR-29.
  - §0 references the brief's addendum. It exists at `briefs/brief-sauna-booking-2026-08-23/addendum.md`, so the reference resolves.
- **Section order:** §3.3 UJs use Glossary terms (changeover, heat state) before §4 defines them. That is acceptable, but moving the Glossary ahead of the UJs would help readers pulling sections out alone.
- **Required sections:** all required sections are present for these stakes. There is no separate UX section, which is appropriate since bmad-ux follows.
