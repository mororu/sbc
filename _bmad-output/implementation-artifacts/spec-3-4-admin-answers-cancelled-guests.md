---
title: 'Story 3.4: Admin answers cancelled guests'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'b91c86e2c6904bd41b905af53c1a49e3672eb60f'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every deletion (Story 3.3) leaves a guest who must hear back, but admins see only a nav count: no list, no prepared email, no way to mark a reply done, so guests get answered twice or never (FR-31).

**Approach:** List open reply reminders ("Antworten") on the admin home and, for the shown day, at the top of the day view; each has a `mailto:` with subject and body prefilled in the booking's locale, "Text kopieren" and "Erledigt", which posts to a `markReplyDone` command (the only writer of `reply_done_at`).

## Boundaries & Constraints

**Always:**
- Query `getReplyReminders({ date? }, db)` in `db/queries/admin.ts`: `deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`, `ORDER BY deleted_at, id`; returns id, name, email, locale, start, durationMin. `date` limits to bookings starting that local day. Same predicate as `countReplyReminders`.
- `markReplyDone({ bookingId }, { now, db })` in `commands/mark-reply-done.ts`: one `BEGIN IMMEDIATE`; `not_found` (unknown id or not deleted) → `conflict` (already done or email NULL) → set `reply_done_at = now`. Returns `{ ok: true }` or `{ ok: false, code }`; never throws for these.
- View model `src/lib/server/reply-view.ts`: per reminder `{ id, name, when, email, href, copyText }`. `when` in the admin locale: "Di 12. Januar, 16:00–17:00 · gelöscht". Subject/body via `m.*(…, { locale: booking.locale })`, first name = `firstName(name)` from `queries/impact.ts`, date `formatDateShort` + `formatTime(start)`. `href` = `mailtoHref(email, { subject, body })` (extend `src/lib/mailto.ts`: `?subject=…&body=…` with `encodeURIComponent`, body lines joined by `\r\n`). `copyText` = address, subject, blank line, body.
- Shared action helper `src/lib/server/reply-action.ts` used by a `replyDone` action on `(portal)/+page.server.ts` and `day/[date]/+page.server.ts`: id check, command, `{ done: true }`; `fail(409, { code: 'already_done' })` for `conflict`/`not_found`; `fail(503, { code: 'failed' })` on lock timeout.
- `ReplyReminders.svelte` (section + list + status) and `ReplyReminder.svelte`: dashed `line-strong` box, `h3` name (tabindex -1), muted `when`, email as text inside a `mailto:` link with mail icon (44 px), secondary "Text kopieren" and "Erledigt" (`aria-disabled` while running). `use:enhance`; after done: `invalidateAll` (badges and list refresh), focus next reminder's `h3` else the section `h2` (day view: the page `h1` when none are left), polite status "Erledigt. Antworten: {n}."; already done: refresh + status "Schon erledigt."; failure: inline `admin_action_failed` at the reminder, focused, reminder stays. Copy: `navigator.clipboard.writeText` → status "Kopiert."; rejected or missing → readonly selectable textarea with the hint.
- Home: left column `section` `h2` "Antworten" with count badge (1.5 px text box, min 24 px, tabular-nums), list or "Keine offenen Antworten.", always shown. Day view: the day's reminders above the bookings, section only when non-empty.
- Copy exact from EXPERIENCE.md (headings, "gelöscht", "Text kopieren", "Erledigt", status, empty line, "Schon erledigt.", DE subject/body, EN subject); others drafted DE+EN in `messages/`, listed in README "Drafted copy for operator review (Story 3.4)".

**Ask First:** a browser test layer (P3); any new dependency; a migration.

**Never:** sending the reply from the app; writing `reply_done_at` anywhere else; showing reminders outside `/admin`; call-list UI (3.6).

## I/O & Edge-Case Matrix

`now` Di 2027-01-12 10:00 Zurich.

| Scenario | State | Expected |
|---|---|---|
| Home list | Anna (de, deleted 09:00), Ben (en, deleted 08:00), Cleo done, Dan email NULL, Eva live | Ben then Anna; count 2 = nav badge |
| Empty | none open | "Antworten" + "0" + "Keine offenen Antworten." |
| German mailto | Lena Muster, de, Di 12. Januar 18:00 | subject "Deine Sauna-Buchung ist gelöscht", body starts "Hallo Lena," and has "deine Buchung vom Di 12. Januar, 18:00 gelöscht"; decodes exactly |
| English mailto | Ben, en, admin in DE | subject "Your sauna booking is cancelled", EN body, "Tue 12 January, 18:00"; `when` still German |
| Odd input | email `a+b@x.ch`, name "  Jo  Ann " / blank | `+` encoded, "Hallo Jo,"; blank name → greeting without name, heading `admin_no_name` |
| After delete | admin deletes Anna (email) | Anna's day view shows her reminder at top |
| Done | open reminder | `reply_done_at = now`; gone from home, day, badge |
| Already done | done by another admin / email purged / live id | `conflict`/`not_found`, nothing written, 409 `already_done` |
| Failure | lock timeout | 503 `failed`, nothing written |

</frozen-after-approval>

## Code Map

- `src/lib/server/db/queries/admin.ts:75` `countReplyReminders` (predicate to reuse); `queries/impact.ts:27` `firstName`.
- `src/lib/server/commands/delete-booking.ts` command shape; `create-booking.ts` `isLockTimeout`; `commands/index.ts` exports.
- `src/lib/server/admin-view.ts` `AdminHomeView`/`loadAdminHome` (add `replies`); `admin-day-view.ts:321` `loadAdminDayView`/`AdminDayView` (add `replies`).
- `src/lib/mailto.ts` `mailtoHref` (extend, keep current behaviour without options).
- `src/routes/admin/(portal)/+page.svelte` empty left `.column`; `(portal)/+layout.svelte:43` badge markup; `booking/[id]/+page.server.ts` + `+page.svelte` (action/`fail`/enhance/focus pattern); `src/lib/components/AdminDayView.svelte`, `InlineMessage.svelte`, `Icon.svelte` (`mail`).
- `messages/{de,en}.json` (`admin_action_failed`, `admin_no_name`, `brand`).
- Tests: `src/routes/admin/server.test.ts` (commands mock incl. `clock.busy`), `render.test.ts`, `queries/admin.test.ts`, `commands/*.test.ts`, `admin-view.test.ts`, `mailto.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/mailto.ts` (+test) -- optional subject/body.
- [x] `src/lib/server/db/queries/admin.ts` (+test) -- `getReplyReminders`.
- [x] `src/lib/server/commands/mark-reply-done.ts` (+test, export) -- matrix Done/Already done.
- [x] `src/lib/server/reply-view.ts` (+test) -- reminder model, mailto rows of the matrix.
- [x] `src/lib/server/admin-view.ts`, `admin-day-view.ts` (+tests) -- `replies` on home (heading, count, empty, items) and day (items).
- [x] `src/lib/server/reply-action.ts`; `(portal)/+page.server.ts`, `day/[date]/+page.server.ts` -- `replyDone` action (+ server tests: done, already done, failure).
- [x] `src/lib/components/ReplyReminders.svelte`, `ReplyReminder.svelte`; `(portal)/+page.svelte`, `AdminDayView.svelte` -- UI (+ render tests: home list/empty, day top, mailto href, ids/headings).
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, drafted list, actions.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given the home and the nav, then the "Antworten" count and the nav reply badge come from the same predicate and always agree.

## Design Notes

- Day view "right after a deletion": the delete already redirects to the booking's day, so the day view lists that day's open reminders rather than carrying the id in the URL; it survives a reload and needs no new state.
- Body layout: greeting line, blank line, EXPERIENCE body sentence, blank line, `brand`. EN draft: "Hello Lena," / "we have cancelled your booking for Tue 12 January, 18:00. Thanks for letting us know, see you soon at the sauna!".
- `conflict` and `not_found` both show "Schon erledigt.": either way there is nothing left to answer.

**Decisions taken during implementation and review:**
- The day view lists that day's open reminders, so the reminder for a just-deleted booking shows there without an id in the URL.
- `conflict` and `not_found` both show "Schon erledigt.".
- The status line "Erledigt. Antworten: n." gives the total of open replies, the same number as the nav badge.
- The count sits inside the `h2`, so the heading reads "Antworten 2".
- A blank guest email gives no reminder; `markReplyDone` returns `conflict` for it.
- A day with an open reply reminder is an accepted admin day, so deleting the only booking on a day outside the season does not lead to a 404.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** clipboard success/fallback, focus after Erledigt, 320 px and dark mode (no browser test layer, P3).

## Suggested Review Order

**Reminders**

- Entry point: one predicate for the open reminders, shared by the list and the nav badge.
  [`admin.ts:99`](../../src/lib/server/db/queries/admin.ts#L99)

- Marking a reminder done: `not_found`, then `conflict`, then `reply_done_at`.
  [`mark-reply-done.ts:16`](../../src/lib/server/commands/mark-reply-done.ts#L16)

- The prefilled reply in the booking's language, and the reminder view.
  [`reply-view.ts:45`](../../src/lib/server/reply-view.ts#L45)

**Client**

- Pure outcome mapping and the next focus target after "Erledigt".
  [`reply-outcome.ts:14`](../../src/lib/reply-outcome.ts#L14)

**Docs**

- The flow and the drafted copy for operator review.
  [`README.md:620`](../../README.md#L620)
