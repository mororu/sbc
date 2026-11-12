---
title: 'Story 1.6: Guest sees the arrival time on cold starts'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '5c7a3f7be5380b99df20604a72e581147a33b4cf'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cold-start rows show only "Kaltstart". Guests are not told when to arrive to light the fire, and no canonical notice value exists for later stories to store and compare.

**Approach:**
- Add the canonical Notice value (AD-24) to the pure core: its computation for free start times and existing bookings, one canonical JSON serialization, and `noticeEquals`.
- The day view renders each cold start's notice from the UX catalogue. "Too little time" and "already past" are derived at render time from the notice, the start time and `now`.

## Boundaries & Constraints

**Always:**
- `Notice = { heat: 'hot' | 'cold', earliest: Instant | null, latest: Instant | null }`.
  - Hot: both are null.
  - Cold: `earliest` = start − preheat max, moved later to the latest of these that ends at or before the start and after that point: a booking's end + **its recorded** changeover, or a block's end. `latest` = start − preheat min.
  - If `earliest >= latest` (collapsed; equal counts too, decided by the user on 2026-11-12), `latest` is null.
- The arrival time may fall before operating hours.
- `serializeNotice` gives exactly `{"heat":…,"earliest":…,"latest":…}` in that key order. `parseNotice` validates and round-trips it.
- `noticeEquals` is the only notice comparison in the codebase.
- "Past" and the minutes to heat are never part of a Notice.
- Copy is exactly as in EXPERIENCE.md, in DE and EN.
- The screen-reader text gives time, state and notice. No clock time is given as a duration.
- The pure layers (`domain`, `time`) get every input as a parameter, `now` included. Every exported core function is unit-tested.

**Ask First:** Any change to the heat rules of Stories 1.3/1.4. A new runtime dependency.

**Never:**
- No storing of notices, no `classifyHeatChange` and no emails (Story 1.7 and Epic 2).
- No error styling for a collapsed or past arrival time; such a time stays bookable.

## I/O & Edge-Case Matrix

Pre-heat 30–40 min; changeover 15; 18:00 cold start unless stated.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal | nothing before 18:00 | 17:20–17:30; "Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein." / "Nobody before you: come between 17:20 and 17:30 and light the fire." | N/A |
| Block clamp | block ending 17:25 | 17:25–17:30 | N/A |
| Booking outside the window | booking 16:00–17:00, recorded changeover 15 | 17:20–17:30 | N/A |
| Collapsed | booking ending 17:30, recorded changeover 15 | `{cold, 17:45, null}`; "Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf." / "Only 15 minutes to heat: come at 17:45. It will still be warming up." | N/A |
| Equal ends | block ending 17:30, 18:00 cold start | `{cold, 17:30, null}`; "Nur 30 Minuten zum Einheizen: komm um 17:30. …" | N/A |
| Block ends at start | block ending 18:00 | `{cold, 18:00, null}`; "Nur 0 Minuten zum Einheizen: komm um 18:00. …" (kept as per the PRD, decided by the user on 2026-11-12) | N/A |
| Recorded changeover | booking ending 17:30 made with changeover 5, current 15 | earliest 17:35 (collapsed) | N/A |
| Past | `now` 17:35, arrival 17:20–17:30 | "Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss." / "Come as soon as you can and light the fire. It won't be fully hot at the start."; still offered | N/A |
| Past, collapsed | `now` after the single 17:45 | the same "as soon as you can" text | N/A |
| Before hours | 10:00 cold start, hours from 10:00 | 09:20–09:30 | N/A |
| DST | 10:00 on Sun 28 Mar 2027 | earliest `07:20:00Z`, latest `07:30:00Z` | N/A |
| Hot | 18:15 after a booking ending 18:00 | `{hot, null, null}`; the row is unchanged from Story 1.4 | N/A |
| Limited cold | durations [60] | "Nur 60 Min. · Niemand vor dir: …" | N/A |
| Screen reader | cold 18:00 | "18:00, Kaltstart. Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein." | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/domain/start-times.ts`
  - `Settings` (line 34) lacks the pre-heat fields.
  - `lastBefore` (81), `freeHeat` (109) and `bookingHeat` (137) give the heat state.
  - `bookingEnd`, and `live` for deleted bookings.
  - `OfferedStartTime` (47) has `heat` only.
- `src/lib/server/db/queries/calendar.ts` -- `getSettings` (10) selects the setting row. The columns are `preheatMinMin` and `preheatMaxMin` in `schema.ts`, seeded at 30/40.
- `src/lib/server/day-view.ts`
  - `buildDayView` maps offers to free rows (~line 160). The cold branch has the comment "arrival time … arrives with Story 1.6".
  - `FreeRow` has `notice`, `srText` and `durations`. `durationLimit` builds the "Nur/Bis" prefix.
  - Messages use `m.*(…, { locale })`.
- `src/lib/time/zurich.ts` -- `addMinutes`, `minutesBetween`, `compareInstants`, `formatTime`.
- `messages/de.json`, `messages/en.json` -- `hot_notice` and `row_sr_cold` exist. A count needs singular and plural variants; `day_status` shows the pattern.
- Tests:
  - `src/lib/domain/start-times.test.ts` (explicit `now`).
  - `src/lib/server/day-view.test.ts`.
  - `src/lib/server/db/queries/calendar.test.ts`.
  - Every place that builds a `Settings` literal must add the new fields.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/domain/notice.ts` (+ tests, re-exported from `src/lib/domain/index.ts`) -- the core notice. This is AD-24.
  - Types: `Notice`, and `Preheat {minMin, maxMin}`.
  - `arrivalFor(start, bookings, blocks, preheat)` gives `{earliest, latest}`.
  - `freeNotice(start, bookings, blocks, settings)` uses `freeHeat`; `bookingNotice(booking, bookings, blocks, preheat)` uses `bookingHeat`.
  - `serializeNotice`, `parseNotice` (throws on invalid input) and `noticeEquals`.
  - The tests cover every matrix row except the copy rows, plus round-trip and equality.
- [x] `src/lib/domain/start-times.ts`, `getSettings`, test fixtures -- add `preheatMinMin` and `preheatMaxMin` to `Settings`. Add `notice: Notice` to `OfferedStartTime`, so the calendar and the book command share it.
- [x] `src/lib/server/day-view.ts` (+ tests) -- render the cold notice:
  - past (`now` > latest, or > earliest when collapsed) → the "as soon as you can" text;
  - collapsed → "Nur {n} Minuten …", where n is the whole minutes from earliest to start;
  - otherwise → the "between" text.

  Keep the `{limit} · {notice}` join, and build `srText` as time, state and notice. These are the row notices.
- [x] `messages/de.json`, `messages/en.json` -- add `cold_notice`, `cold_notice_short` (singular and plural) and `cold_notice_past`. The copy is the UX catalogue strings.
- [x] `README.md` -- describe the arrival-time rule and the notice value, and drop the "arrival time follows in 1.6" remark.

**Acceptance Criteria:**
- Given `grep` over `src` for notice comparisons, when it is run, then only `noticeEquals` compares notices.
- Given a collapsed or past cold start, when it renders, then it uses the normal cold-start styling and stays in the list as a free row.
- Given `npm run build`, then the client time guard passes.

## Spec Change Log

- 2026-11-12, after the first implementation:
  - **Trigger:** the implementer found two odd texts in the fixture data. A start 30 minutes after a block showed "zwischen 13:00 und 13:00", and a start directly after a block showed "Nur 0 Minuten zum Einheizen".
  - **Amended by the user:** an earliest arrival equal to the latest now collapses (`earliest >= latest`). The 0-minute case stays as the PRD says.
  - **Avoids:** a range whose two ends are the same time.
  - **KEEP:** the rest of the implementation.

## Design Notes

The clamp considers only items that end at or before the start. Items that end at or before `start − preheat max` never move `earliest`.

For an existing booking, `bookingNotice` uses the same arrival rule. Its neighbours' recorded changeovers apply; `bookingHeat` already uses the later-made booking's changeover. Story 1.7 stores the result as `notice_at_booking`.

Canonical JSON example: `{"heat":"cold","earliest":"2027-01-12T16:45:00Z","latest":null}`.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:**
- With `DEV_NOW` 12 Jan and fixtures, check:
  - cold rows show the arrival text in DE and EN;
  - a time just after the 17:00 fixture booking shows the collapsed text;
  - setting `DEV_NOW` late shows the "as soon as you can" text.

## Suggested Review Order

**Notice value (AD-24)**

- Entry point: arrival time from the pre-heat window, clamped by bookings and blocks, never after the start.
  [`notice.ts:39`](../../src/lib/domain/notice.ts#L39)

- Notices for free start times and for existing bookings, from the shared heat rules.
  [`notice.ts:69`](../../src/lib/domain/notice.ts#L69)

- One canonical JSON form, strict parsing, and the only comparison.
  [`notice.ts:88`](../../src/lib/domain/notice.ts#L88)

- Heat rules moved into their own module so the imports go one way.
  [`heat.ts:72`](../../src/lib/domain/heat.ts#L72)

- Offered start times now carry the notice for calendar and book command.
  [`start-times.ts:41`](../../src/lib/domain/start-times.ts#L41)

**Rendering**

- Past, too little time, or the normal range: chosen at render time.
  [`day-view.ts:159`](../../src/lib/server/day-view.ts#L159)

- Cold rows join the limit and the arrival text, screen-reader text included.
  [`day-view.ts:214`](../../src/lib/server/day-view.ts#L214)

**Peripherals**

- Pre-heat window read from the setting row.
  [`calendar.ts:17`](../../src/lib/server/db/queries/calendar.ts#L17)

- Copy from the UX catalogue, singular drafted.
  [`de.json:40`](../../messages/de.json#L40)

- Core tests: matrix rows, clamps, collapsed and equal ends, DST both ways.
  [`notice.test.ts:1`](../../src/lib/domain/notice.test.ts#L1)

- The arrival rule and the notice value for operators.
  [`README.md:103`](../../README.md#L103)
