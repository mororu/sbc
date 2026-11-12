---
title: 'Story 1.5: Guest browses days'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '5b966b63eed2d888b223761bc167742a66bac24c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The day view shows a single day. A guest can only reach another day by typing a URL, and a fully taken or past day shows no explanation.

**Approach:** Extend the server view model with a date strip, previous/next targets, a "today" target, an empty-state line and a day-switch status line, all pre-formatted. Render them as links, so the page works without JavaScript. With JavaScript, SvelteKit's client navigation adds the at-once strip selection, the dimmed busy list, the delayed "Lädt …" and the arrival status.

## Boundaries & Constraints

**Always:**
- Plain links to `/day/{date}`, so Back works and a page without JavaScript loads in full.
- Every string comes pre-formatted from the server view model, in DE and EN. No `src/lib/time` on the client; the Story 1.4 guard stays green.
- Tokens only. Targets are at least 44 px; adjacent targets sit at least 8 px apart.
- No motion over 150 ms, and none under `prefers-reduced-motion`.
- The skip link "Zu den Zeiten" moves focus past the strip to the start-time list on day views.
- AD-26: the view model holds no row ids, names or reasons.

**Ask First:** Any change to the Story 1.3/1.4 rules or to the URL scheme. Any new dependency.

**Never:**
- No arrival times (Story 1.6) and no booking links (Story 1.7).
- No swipe gestures, carousels or skeletons.
- No strip on the season-notice page.

## I/O & Edge-Case Matrix

Seed settings (horizon 14), season 9 Jan – 30 Apr 2027.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Strip | today 12 Jan, viewing 13 Jan | 15 cells, 12 Jan to 26 Jan. 13 Jan has `aria-current="date"`. Each cell is named like "Mittwoch, 13. Januar" and shows "Mi" over "13". | N/A |
| Arrows | viewing 12 Jan / 26 Jan / 20 Jan | "Vorheriger Tag" is `disabled` on 12 Jan; "Nächster Tag" is `disabled` on 26 Jan; otherwise they link to 19 and 21 Jan | N/A |
| Gap in seasons | a second season starts 20 Jan, the first ends 15 Jan | 16–19 Jan are struck-through `<span>`s; the arrows skip them (15 Jan → 20 Jan) | N/A |
| Booking open, season not begun | today 28 Dec 2026 | the strip runs 28 Dec – 11 Jan; 28 Dec – 8 Jan are struck through; 9 Jan is selected | N/A |
| Today link | viewing 13 Jan / viewing today | "Heute" links to `/` / not shown | N/A |
| Fully taken | 13 Jan, no free start time left, some taken rows | "An diesem Tag ist alles belegt. Schau dir einen anderen Tag an." above the taken rows | N/A |
| Today all past | today 12 Jan, `now` 21:30 | "Für heute sind alle Zeiten vorbei. Morgen geht's weiter." above any taken rows | N/A |
| Status line | 13 Jan with 4 / 1 / 0 free | "Mittwoch, 13. Januar: 4 freie Zeiten" / "…: 1 freie Zeit" / the empty-state line; EN "Wednesday, 13 January: 4 free times" / "1 free time" | N/A |
| Switching (JS) | tap 14 Jan | the strip selection moves at once; the list is dimmed with `aria-busy="true"`; after 1 s "Lädt …" appears in the polite status; on arrival the status shows the status line and `document.title` updates | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/server/day-view.ts`
  - `DayView` type (lines ~70–80) and `buildDayView` (~109).
  - `loadDayView` (~241) already has `calendarState`, `seasons`, `settings` and `now`.
  - Add the new fields here. All formatting stays on the server.
- `src/lib/domain/calendar.ts` -- `selectableDays` (35) gives the ordered selectable days; `calendarState` (44) gives `firstDay` and `lastDay`. Previous and next are the neighbours in `selectableDays`.
- `src/lib/time/zurich.ts` -- `dateParts` (~99) is the `formatToParts` helper; `formatDateLong` gives the cell names. Add the short weekday ("Mi" / "Wed") and the day number.
- `src/lib/domain/start-times.ts` -- `offeredStartTimes` with empty bookings and blocks tells "all past" apart from "fully taken".
- `src/lib/components/DayView.svelte` -- the current heading and rows; becomes heading + arrows, strip, status region, empty line, list (`id="times"`, `tabindex="-1"`).
- `src/lib/components/SkipLink.svelte` -- it is in the guest layout `src/routes/(guest)/+layout.svelte` and links to `#main` today. On day views it must target the list.
- `src/lib/components/Icon.svelte` -- `chevron-left` and `chevron-right` exist.
- `src/lib/styles/tokens.css` -- `--type-strip-day-*`, `--type-strip-weekday-*`, `--list-top`, `line-strong`, `primary`, `--target-min`.
- `messages/*.json` -- Paraglide inlang message format. A count needs singular and plural variants.
- Tests: `src/lib/server/day-view.test.ts` (in-memory DB, explicit `now`) and the route test `src/routes/(guest)/day/[date]/server.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/time/zurich.ts` (+ tests) -- add `formatWeekdayShort` ("Mi" / "Wed") and `formatDayNumber` ("13") -- strip cells.
- [x] `src/lib/server/day-view.ts` (+ tests for every matrix row) -- extend `DayView`:
  - `strip: {date, href|null, weekday, day, name, selected}[]`, from today to `lastBookableDay`; `href` is null outside a season;
  - `prev` and `next`: an href or null;
  - `today`: an href, or null when the view already shows the home day;
  - `empty`: `'taken' | 'past' | null`, with its text;
  - `status`: the day-switch line.

  This is the one view model.
- [x] `messages/de.json`, `messages/en.json` -- arrow names, "Heute"/"Today" for the link, "Lädt …"/"Loading …", the two empty lines, and the status line with singular and plural -- copy.
- [x] `src/lib/components/DateStrip.svelte` -- `nav` with an accessible name; links or struck-through spans; the selected cell. On mount and after each navigation it scrolls the strip container (never the page) to the selected cell: smooth, or a jump under reduced motion -- the strip.
- [x] `src/lib/components/DayView.svelte` -- the heading row with arrows (`<a>`, or `<button disabled>` at the ends) that wraps below the heading when narrow; then the "Heute" link, the strip, a `role="status"` `aria-live="polite"` region, the empty line, and the list with `id="times"`.
  - During `navigating` to a day: the target cell is selected at once, the list is dimmed with `aria-busy="true"`, and "Lädt …" appears after 1 s.
  - After navigation (not on first load), the status shows `status`.
- [x] `src/routes/(guest)/+layout.svelte` / `SkipLink.svelte` -- the skip link targets `#times` when the page shows a day, otherwise `#main` -- skip past the strip.
- [x] `README.md` -- the drafted "Heute" link copy and placement, and the EN arrow names, loading line and singular status, all for operator review.

**Acceptance Criteria:**
- Given JavaScript disabled, when a guest taps a strip day, an arrow or "Heute", then the target loads as a full page and Back returns.
- Given a 360 px screen, when the strip overflows, then only the strip scrolls horizontally and the page does not. At 320 px with 200 % text, there is no horizontal page scroll.
- Given the skip link on a day view, when it is activated, then focus lands on the start-time list, after the strip.
- Given `npm run build`, then the client time guard passes.

## Design Notes

**Layout, top to bottom:** season note (if any) → heading row (`h1` left, arrows right) → strip row ("Heute" link before the scrolling cells) → status region → empty line → list. The strip sits `--list-top` above the first row.

**Selected cell during navigation:** derive it from `navigating.to?.url.pathname` (`/day/{date}`, or `/` → the home day carried in the view model). Otherwise use the view's date. The status region stays empty on the first render, so nothing is announced on page load.

**"All past" vs "fully taken":** on today, if `offeredStartTimes` with no bookings or blocks is also empty, the day is `past`. If there are no free rows otherwise, it is `taken`.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:**
- With `DEV_NOW` and fixtures, check:
  - the strip, arrows and "Heute", with and without JavaScript;
  - Back after switching days;
  - "Lädt …" with network throttling;
  - reduced motion;
  - 320 px;
  - DE/EN and light/dark.

## Suggested Review Order

**View model**

- Entry point: the day view now carries strip, arrows, "Heute", empty line and status.
  [`day-view.ts:89`](../../src/lib/server/day-view.ts#L89)

- Strip cells from today to the horizon; days outside a season get no link.
  [`day-view.ts:248`](../../src/lib/server/day-view.ts#L248)

- "Past" vs "fully taken": an empty day that offers nothing now is past.
  [`day-view.ts:265`](../../src/lib/server/day-view.ts#L265)

**Client navigation**

- Pure decisions: which day is pending, when to announce, where the skip link goes.
  [`day-nav.ts:20`](../../src/lib/day-nav.ts#L20)

- Selection at once, busy list, delayed "Lädt …", announcement after arrival.
  [`DayView.svelte:28`](../../src/lib/components/DayView.svelte#L28)

- Status region with reserved height; hidden when the empty line already says it.
  [`DayView.svelte:119`](../../src/lib/components/DayView.svelte#L119)

- Arrows: links, or disabled buttons at the ends.
  [`DayView.svelte:80`](../../src/lib/components/DayView.svelte#L80)

**Strip and skip link**

- Strip per DESIGN.md: baseline, underline, struck-through days; scrolls only itself.
  [`DateStrip.svelte:32`](../../src/lib/components/DateStrip.svelte#L32)

- Skip link targets the list on day views.
  [`+layout.svelte:13`](../../src/routes/(guest)/+layout.svelte#L13)

**Peripherals**

- Short weekday and day number for strip cells.
  [`zurich.ts:147`](../../src/lib/time/zurich.ts#L147)

- Navigation logic tests.
  [`day-nav.test.ts:1`](../../src/lib/day-nav.test.ts#L1)

- Behaviour notes and drafted copy for operator review.
  [`README.md:103`](../../README.md#L103)
