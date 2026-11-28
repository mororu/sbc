---
title: 'Story 3.6: Admin works the call list'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '1f3ccae69971e5c69f25dc8e7248d4178cbdd5d8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The call list is derived (`deriveCallList`) and counted in the nav badge, but admins cannot see who to phone, what notice to read out, or mark a guest called, so keybox-phase heat changes and failed emails never reach the guest (FR-13, FR-14, FR-21).

**Approach:** Show "Anrufliste" on the admin home's left column above "Antworten", one entry per `deriveCallList` entry with contact, heat-change line, notice to give and reason; "Angerufen" posts the displayed canonical notice to a `markCalled` command that stale-checks it, writes `last_told_notice` and resolves the booking's call-raising outbox rows.

## Boundaries & Constraints

**Always:**
- Feed: `getCallFeed(now, db, { bookingId? })` (filter added) is the one source for the list and the command. New query `getCallContacts(ids, db)` in `queries/admin.ts` → id, name, mobile (admin-only; the feed stays contact-free). Current keybox code from `getKeyboxSettings`.
- `markCalled({ bookingId, notice }, { now, db })` in `commands/mark-called.ts`, one `BEGIN IMMEDIATE`, in order: `not_found` (unknown or deleted) → `past` (start ≤ now) → `conflict` (booking not on `deriveCallList` of its feed entry: already called, notice back to last told) → `stale` (token unparsable, or `!noticeEquals(parseNotice(token), current)`; an empty token is stale unless current is null) → write: `last_told_notice = serializeNotice(parsed token)` (skipped for an empty token); `resolved_at = now` on the booking's unresolved rows that are `refused`/`expired` or listed in `sendProblems(entry, now).callRequired` (covers the overdue keybox row and an overdue urgent heat-change row). Returns `{ ok: true } | { ok: false, code }`; never throws for these.
- View `src/lib/server/call-view.ts`: `loadCalls(locale, now, db)` → `{ heading, count, empty, items }`; item `{ bookingId, heading "17:15 · Tom Brunner" (`admin_no_name` fallback), firstName, marker {text, urgent}, dateLine, line (heatChangeLine, only when lastTold and current differ), notice (badgeText(current, start, now)), lastTold ("zuletzt gesagt: " + badgeText(lastTold…), when known), reasons[], code ("Code durchgeben: 4711", only with a keybox reason and a non-empty code), tel {href (`telHref`), text} | null, token (serializeNotice(current) or "") }`.
- Action `called` on `(portal)/+page.server.ts` via `src/lib/server/call-action.ts` (pattern `reply-action.ts`): `{ called: true, bookingId, firstName }`; 409 `{ code: 'already_done' }` for `conflict`/`not_found`/`past`; 409 `{ code: 'stale', bookingId }`; 404 bad id; 503 `{ code: 'failed', bookingId }` on lock timeout.
- `CallList.svelte` + `CallEntry.svelte` (pattern `ReplyReminders`/`ReplyReminder`, pure helpers in `src/lib/call-outcome.ts`): `h2` "Anrufliste" with count badge (always shown, "0" + empty line); `li` boxes: marker (required: 1.5 px `--error` border + text; optional: `line-strong` border, muted), `h3` tabindex -1, muted date line, `HeatChangeLine`, label "NEUER HINWEIS" over the notice, muted last told, reasons, code line, `tel:` link with `phone` icon and number text (44 px) and secondary "Angerufen" (`aria-disabled` while running); they wrap. After called/already done: `invalidateAll`, focus next entry `h3` else section `h2`, polite status "Tom angerufen. Anrufliste: {n}." / "Schon erledigt."; stale: refresh, entry shows the new notice and the stale line, focused; failure: inline `admin_action_failed` at the entry, focused.
- Copy exact from EXPERIENCE/epics (heading, markers, "Neuer Hinweis", "zuletzt gesagt: …", "Angerufen", status, empty line, "Schlüsselmail abgelehnt", "Warnmail abgelehnt", stale line, "Schon erledigt."); drafted DE+EN (item 34 reasons, code line, date line, EN stale line, no-name status) in `messages/` and README "Drafted copy for operator review (Story 3.6)".
- Spine AD-21: add that mark called also resolves an overdue urgent heat-change row.

**Ask First:** a browser test layer (P3); any new dependency; a migration.

**Never:** storing the call list; contact data in `getCallFeed` or the nav count; writing `last_told_notice`/`resolved_at` outside `markCalled` and the worker; sending mail from the call list.

## I/O & Edge-Case Matrix

`now` Di 2027-01-12 11:06 Zurich; pre-heat 30–40.

| Scenario | State | Expected |
|---|---|---|
| Tom | 17:15 keybox accepted, told hot; booking before deleted → cold 16:35–16:45; mobile 079 412 35 81 | *Anruf nötig*, "17:15 · Tom Brunner", "Heute, Di 12. Januar", "HEISS → KALTSTART", "Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.", "zuletzt gesagt: Schon heiss um 17:15.", tel `+41…`/text |
| Optional | keybox accepted, told cold, now hot | marker "optional", after required entries |
| Refused | keybox `refused`, code 4711 | *Anruf nötig*, "Schlüsselmail abgelehnt", "Code durchgeben: 4711" |
| Both | keybox refused + urgent change | one entry, required, reason and line |
| Before keybox | keybox `pending`, heat change | no entry |
| Empty | none | "Anrufliste" "0" "Niemand muss angerufen werden." |
| Called | Tom, token = current | last told = cold notice, refused/expired/overdue rows `resolved_at = now`; list and badge 0 |
| Overdue | keybox pending 15 min past due, called | row resolved; entry gone; stays gone if later refused |
| Warning overdue | urgent heat-change pending inside the window, called | row resolved; entry gone |
| Stale | token, then notice changes to another non-told notice | `stale`, nothing written; entry with new notice + stale line |
| Gone | called by another admin / booking deleted / started | 409 `already_done`, nothing written |
| Failure | lock timeout | 503, nothing written, inline failure |

</frozen-after-approval>

## Code Map

- `src/lib/domain/call-list.ts` `deriveCallList`, `sendProblems` (row ids for resolve), `keyboxPhaseHeatChange`; `notice.ts` `serializeNotice`/`parseNotice`/`noticeEquals`.
- `src/lib/server/db/queries/admin.ts:39` `getCallFeed` (add filter); `setting.ts:23` `getKeyboxSettings`; `impact.ts:27` `firstName`; `schema.ts` `outbox.resolvedAt`, `booking.lastToldNotice`.
- `src/lib/server/commands/mark-reply-done.ts` (shape), `create-booking.ts` `isLockTimeout`, `index.ts`; worker `commands/outbox.ts:240` cancels a heat-change row whose notice equals last told (so a resolved pending urgent row is dropped at claim).
- `src/lib/server/impact-view.ts:46` `heatChangeLine`; `notice-text.ts:58` `badgeText`; `admin-day-view.ts:145` `telHref`; `admin-view.ts` `loadAdminHome` (add `calls`), `loadNavCounts`.
- `src/lib/server/reply-action.ts`, `reply-view.ts`, `src/lib/reply-outcome.ts`, `ReplyReminders.svelte`, `ReplyReminder.svelte` (patterns); `HeatChangeLine.svelte`, `InlineMessage.svelte`, `Icon.svelte` (`phone`); `(portal)/+page.svelte` left column, `+page.server.ts`.
- `messages/{de,en}.json` (`call_marker_*`, `admin_action_failed`, `admin_reply_already_done`); spine `ARCHITECTURE-SPINE.md:200` AD-21.
- Tests: `queries/admin.test.ts`, `commands/mark-reply-done.test.ts` (fixtures), `routes/admin/server.test.ts` (commands mock, lock timeout), `routes/admin/render.test.ts`, `admin-view.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/server/db/queries/admin.ts` (+test) -- `getCallFeed` filter, `getCallContacts`.
- [x] `src/lib/server/commands/mark-called.ts` (+test, export) -- matrix Called, Overdue, Warning overdue, Stale, Gone, plus empty/garbage token.
- [x] `src/lib/server/call-view.ts` (+test) -- matrix Tom, Optional, Refused, Both, Before keybox, Empty; EN copy.
- [x] `src/lib/server/admin-view.ts` -- `calls` on the home view.
- [x] `src/lib/server/call-action.ts`, `(portal)/+page.server.ts` (+ server tests) -- called, already done, stale, failure, bad id.
- [x] `src/lib/call-outcome.ts` (+test), `CallList.svelte`, `CallEntry.svelte`, `(portal)/+page.svelte` (+ render tests: entry markup, empty, tel, order above "Antworten").
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md`, spine AD-21 -- copy, drafted list, action, amendment.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given the home list and the nav badge, then both count `deriveCallList(getCallFeed(now))` and agree.

## Spec Change Log

## Design Notes

- Resolving also the overdue urgent heat-change row: otherwise `warning_overdue` keeps the entry after the call. The worker then cancels that row at claim (notice equals last told).
- `past` and `not_found` show "Schon erledigt." like `conflict`: the entry is gone either way.
- Conflict before stale: a notice that went back to last told clears the entry, which is not a stale refusal.
- "zuletzt gesagt" is shown whenever last told is known; the heat-change line only when it differs from now (a refused-only entry has none).

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:** focus after Angerufen/stale, wrapping at 320 px, both themes (no browser test layer, P3).

## Suggested Review Order

**Mark called**

- Entry point: one transaction refuses not_found, past, conflict (not on the list) and stale, then writes the last-told notice and resolves the booking's call rows.
  [`mark-called.ts:42`](../../src/lib/server/commands/mark-called.ts#L42)

**Call list**

- The list never drops an entry, so the home count equals the nav badge.
  [`call-view.ts:146`](../../src/lib/server/call-view.ts#L146)

- Pure client decisions: the outcome, the next focus target, one line per entry.
  [`call-outcome.ts:29`](../../src/lib/call-outcome.ts#L29)

**Docs**

- The flow, the AD-21 amendment and the drafted copy for operator review.
  [`README.md:697`](../../README.md#L697)
