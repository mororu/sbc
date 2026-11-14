---
title: 'Story 1.10: Epic 1 hardening (retro A1–A6)'
type: 'bugfix'
created: '2026-11-14'
status: 'done'
baseline_commit: '13f9cc8a2100e9b762fd783cad0e36c095073cbc'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-11-12.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 1 retro found six guest-facing defects (F1–F6):
- After a lost response, a reload sends a guest to "gerade weggegangen" for their own booking.
- Unknown paths get SvelteKit's bare English 404, and there is no favicon.
- The confirmation shows a blank admin contact as "Schreib an  .".
- A refusal message names a time on a different day.
- The skip link says "Zu den Zeiten" on pages without times.
- Contact details stay in `sessionStorage` after a booking.

**Approach:** Six small fixes (A1–A6) in one story, as decided in the retro. A1 keeps the pending submit token per start time in `sessionStorage` and resumes through a token lookup.

## Boundaries & Constraints

**Always:**
- **No guest data or tokens in URLs, cookies or logs.** The token goes only in a POST body.
- **Layering stays as lint enforces it:** routes read via `#lib/server/db/queries`. Client code never imports `#lib/time`.
- **Copy:** new copy goes into `messages/de.json` and `en.json` (informal *du*, Swiss spelling) and is listed in a README "Drafted copy for operator review (Story 1.10)" section.
- **Storage failures:** every `sessionStorage` access is wrapped in try/catch, so the pages still work without storage.

**Ask First:** a new cookie, a new dependency, or a schema/migration change.

**Never:**
- A7 (keybox cutoff, splitting `day-view.ts`), A8 (wording after an admin deletion), A9 and A10.
- Changing `createBooking` semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| A1 resume | The POST booked, the response was lost, and the guest reloads or switches language. The form redirects to `/day/D?error=conflict&time=T`. Pending `{path:'/book/D/T', token}` is in storage. | The day page POSTs the token to `/booked`, gets `{href}` and replaces the location with `/booked/{id}?new=1`. Pending is cleared. |
| A1 unknown | The token matches no live booking (none made, or deleted). | `/booked` answers 404 and the day shows the conflict message as today. Pending is cleared. |
| A1 path mismatch | Pending is for another `/book/D/T`. | No lookup. |
| A1 form reload, slot still free | Pending exists for this form path. | The form submits the stored token instead of the server's fresh one. |
| A1 malformed lookup body | The body is not JSON, or the token is not a valid random id. | 400 with no body detail. |
| A2 | `GET /nope/deeper` | 404 rendered in the guest shell (header, footer with contact), DE/EN. |
| A3 | `admin_contact` is `'  a@b.ch '`, `''`, `'   '` or null. | The confirmation gets `'a@b.ch'`, `null`, `null` or `null`. |
| A4 | `/day/2026-01-01?error=past&time=2330` is no longer selectable. | Redirect to `/day/{nearest}` with no query. |
| A5 | A page whose skip target is `main` | Label "Zum Inhalt" / "Skip to content". Day pages keep "Zu den Zeiten". |
| A6 | A booking succeeds (redirect to `/booked/…`). | The contact key and pending are removed from `sessionStorage`. |

</frozen-after-approval>

## Code Map

- `src/lib/components/BookForm.svelte` -- `STORAGE_KEY` (contact), `save()`, `onMount` prefill, `submit` (redirect branch at `update()`), and the hidden `submitToken` from `view.submitToken`.
- `src/lib/components/DayView.svelte:25-32` -- `afterNavigate` strips `?error&time` via `withoutDayError`. The resume check goes here, before the strip.
- `src/lib/day-nav.ts` -- pure client helpers with unit tests (`day-nav.test.ts`). Add the pending-key helpers here. `skipTarget` is at the end.
- `src/lib/server/book-view.ts:98-108` -- `dayErrorHref` and `bookedHref(publicId, changed)`. Reuse `bookedHref(id, false)`.
- `src/lib/server/db/queries/booking.ts` -- `getConfirmation` reads `setting.adminContact` raw (F3). `bookingByToken` returns `{publicId, deleted, …}`.
- `src/lib/server/db/queries/setting.ts` -- `getAdminContact(db)`: trimmed, `id = 1`, blank → null.
- `src/lib/schemas/booking.ts` -- `RANDOM_ID` regex and `isRandomId`.
- `src/lib/server/day-view.ts:441-445` -- the refusal query carried onto the redirect (F4). Test at `day-view.test.ts:589-601`.
- `src/lib/components/SkipLink.svelte` and `src/routes/(guest)/+layout.svelte` -- the label is always `m.skip_to_times()`.
- `src/routes/(guest)/+error.svelte` -- the guest error page. `src/routes/+layout.svelte` is the root layout with no shell.
- `src/app.html` -- head. `static/` holds only `robots.txt`. The palette is `--primary #76461c` and `--background #f5eee2` (`src/lib/styles/tokens.css`).
- `messages/de.json` and `en.json` -- `skip_to_times`, `privacy_tracking_body` (a `[PLATZHALTER]` draft).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/server/db/queries/booking.ts` -- In `getConfirmation`, use `getAdminContact(db)` instead of the raw select. Add `src/lib/server/db/queries/booking.test.ts` covering the A3 matrix row (in-memory DB as in `setting.test.ts`).
- [x] `src/lib/server/day-view.ts` + test -- The not-selectable redirect goes to `/day/{nearest}` without the query. Rewrite the "carries a refusal" test to assert that it is dropped.
- [x] `src/routes/(guest)/booked/+server.ts` (new) + `server.test.ts` -- `POST` with JSON `{submitToken}`. Validate it with `isRandomId`; otherwise 400. Call `bookingByToken`: a live booking gives 200 `{href: bookedHref(publicId, false)}`, anything else 404. Set `cache-control: private, no-store`. No logging of the token.
- [x] `src/lib/day-nav.ts` + test -- Add `PENDING_KEY`, `readPending(storage)`, `writePending(storage, path, token)` and `clearPending(storage)`. They take a `Storage`-like parameter so they stay unit-testable, and they swallow errors.
- [x] `src/lib/components/BookForm.svelte` -- On a validated submit, `writePending(page.url.pathname, token)`. On mount, if the pending path equals the current path, use its token for the hidden field. In the redirect branch, when `result.location` starts with `/booked/`, remove `STORAGE_KEY` and clear pending (A6). Update the header comment.
- [x] `src/lib/components/DayView.svelte` -- In `afterNavigate`, before stripping: if `error=conflict` and the pending path is `/book/{view.date}/{time}`, POST the token to `/booked`. On 200 `goto(href, {replaceState: true})`, then clear pending. On 404 clear pending. On a network error keep it. The message stays as rendered until the lookup answers.
- [x] `src/routes/(guest)/[...path]/+page.server.ts` (new) -- `error(404)`, so unknown paths render `(guest)/+error.svelte` inside the guest shell.
- [x] `src/routes/+error.svelte` (new) -- A fallback for errors outside the guest layout: `app.css`, `AppHeader`, the same message and calendar link as the guest error page, and `noindex`.
- [x] `static/favicon.svg` (+ `static/favicon.ico` 32 px) and `src/app.html` -- An icon in the palette. `<link rel="icon">` for the SVG. `/favicon.ico` no longer 404s.
- [x] `src/lib/components/SkipLink.svelte` + `messages/*.json` -- Use `skip_to_content` ("Zum Inhalt" / "Skip to content") when the target is `main`.
- [x] `messages/*.json` `privacy_tracking_body` -- Still `[PLATZHALTER]`. Add that the booking form keeps name, email and mobile in the browser's session storage until the booking succeeds or the tab is closed.
- [x] `README.md` -- Add the drafted copy for Story 1.10, a note on resume after a lost response, and the root 404.
- [x] `_bmad-output/planning-artifacts/epics.md` + `sprint-status.yaml` -- Add Story 1.10 under Epic 1 with these ACs. Track it in the sprint status. Mark A1–A6 `done` when the story is done.

**Acceptance Criteria:**
- Given the matrix rows, when the suite runs, then each row has a test (unit, route or render) that fails without the fix.
- Given any guest page, when it loads, then the server log shows no `favicon.ico` 404.
- Given JavaScript is off, when a guest books, then the flow is unchanged (A1 and A6 are progressive enhancements only).

## Design Notes

- **Why a lookup instead of a resubmit:** after a lost response, the form route's loader redirects before the form renders, because the slot is now taken. So only the day page can recover the booking. The token is a 128-bit capability equal to resubmitting, so the endpoint exposes nothing new.
- **A4:** the query is dropped rather than adapted, because adapting would need new copy that names the date.

## Verification

**Commands:**
- `npm run check && npm run lint && npm test && npm run build` -- expected: all clean.

**Manual checks:**
- On the dev server, block the response of the book POST (devtools offline after submit) and reload. Expected: you land on your own confirmation.
- `/nope` shows the styled 404 in DE and EN.
- The skip link label on `/info` and on a day page.

## Suggested Review Order

**Resume after a lost response (A1)**

- Entry point: the whole resume decision as one pure, tested sequence; clears storage before navigating.
  [`day-nav.ts:209`](../../src/lib/day-nav.ts#L209)

- Which day URL triggers a lookup: conflict or past, for the pending form path only.
  [`day-nav.ts:125`](../../src/lib/day-nav.ts#L125)

- The token lookup endpoint: 128-bit capability in a POST body, bare 400/404.
  [`+server.ts:14`](../../src/routes/(guest)/booked/+server.ts#L14)

- DayView wiring: navigation counter guards a stale lookup; the shallow query strip does not count.
  [`DayView.svelte:46`](../../src/lib/components/DayView.svelte#L46)

- BookForm records the token it sends, keyed by the form path.
  [`BookForm.svelte:198`](../../src/lib/components/BookForm.svelte#L198)

- A form reload on the same path reuses the pending token, so retries stay idempotent.
  [`BookForm.svelte:97`](../../src/lib/components/BookForm.svelte#L97)

- Fetch-result mapping: 404/400 forget, network/5xx keep for a reload.
  [`day-nav.ts:175`](../../src/lib/day-nav.ts#L175)

**Storage cleanup and privacy (A6)**

- Any server redirect drops the pending entry; contact details go only on a confirmation.
  [`day-nav.ts:162`](../../src/lib/day-nav.ts#L162)

- Called from the form's redirect branch.
  [`BookForm.svelte:223`](../../src/lib/components/BookForm.svelte#L223)

**Smaller fixes (A2–A5)**

- A4: the redirect to another day drops the refusal query.
  [`day-view.ts:442`](../../src/lib/server/day-view.ts#L442)

- A3: the confirmation reads the admin contact through the shared trimmed query.
  [`booking.ts:43`](../../src/lib/server/db/queries/booking.ts#L43)

- A2: catch-all 404 so unknown paths render in the guest shell.
  [`+page.server.ts:8`](../../src/routes/(guest)/[...path]/+page.server.ts#L8)

- A2: root fallback error page for errors outside the guest layout.
  [`+error.svelte:24`](../../src/routes/+error.svelte#L24)

- A2: favicon link.
  [`app.html:8`](../../src/app.html#L8)

- A5: generic skip-link label when the target is main.
  [`SkipLink.svelte:11`](../../src/lib/components/SkipLink.svelte#L11)

**Tests and docs**

- Pending-submit, lookup, redirect and resume helper tests.
  [`day-nav.test.ts:121`](../../src/lib/day-nav.test.ts#L121)

- Endpoint tests (200, 404 unknown/deleted, 400, POST only).
  [`server.test.ts:1`](../../src/routes/(guest)/booked/server.test.ts#L1)

- README: resume flow, known limits (per tab, no resume after A4 drop), no base path.
  [`README.md:338`](../../README.md#L338)
