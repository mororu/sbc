---
title: 'Story 3.1: Admin signs in'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: 'f18d7609ad3b4b466d3683ea0ae5d90dd402ee65'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no admin portal: no password, no sessions, no guard, so no operator can reach guest details or see whether calls, replies or a dead worker need attention.

**Approach:** A password CLI stores an argon2 hash; sign-in/out commands manage server-side sessions; `hooks.server.ts` guards `/admin`; an admin shell (header + nav with call and reply badges) and an admin home with the worker warning. The call-list core gains trigger (a) and the merge.

## Boundaries & Constraints

**Always:**
- Migration `0009`: nullable `setting.admin_password_hash`, nullable `booking.reply_done_at` (plain `ALTER TABLE ADD`, no CHECK, like `outbox.resolved_at`: a CHECK would rebuild `booking`), new `admin_session(id text PK, created_at, expires_at)` with instant GLOB checks.
- `argon2` 0.45.2 (spine pin, already installed). Session id = `randomId()` (128 bits). Expiry = last use + 30 days; each guarded request extends row and cookie.
- Cookie `admin_session`: `Path=/admin`, `HttpOnly`, `Secure`, `SameSite=Lax`, Max-Age 30 days. No other new cookie.
- Return target `to`: accepted only when it parses same-origin with a pathname `/admin` or `/admin/…` (not login/logout), no `\`, no control chars; else `/admin`.
- Rate limit: pure gate in `src/lib/domain/sign-in-limit.ts`; the `Map` lives in the sign-in command. From the 5th failure on, the next try is allowed only 60 s after the last failure; a correct password deletes the record; records are dropped 15 min after their last failure.
- Commands (`BEGIN IMMEDIATE`, `{ok, code}`): `signIn` (async; argon2 verify outside the transaction, the hash re-read inside it before the insert; codes `invalid`, `rate_limited` + `retryAt`), `touchSession`, `signOut`, `setAdminPassword({hash, reset})` (code `conflict` when a hash exists without reset; reset deletes all sessions).
- Never log, echo, return in `values`, or pass as argv/env the password. Logs never name guests.
- Sign-out is a POST form (a GET link could be preloaded), styled as the last tab.
- All copy from `messages/` DE+EN; EXPERIENCE.md strings exact; drafted strings listed in README for operator review.

**Ask First:** any further dependency; any change to AD-10/AD-11 beyond the above.

**Never:** Home sections' content (next bookings 3.2, replies 3.4, call list 3.6) — the home shows only `h1`, the warning and the empty two-column grid. No browser test layer (P3 stays open). No session-id hashing.

## I/O & Edge-Case Matrix

`now` 2027-01-12 10:00 Zurich unless noted.

| Scenario | Input / State | Expected |
|---|---|---|
| CLI set | stdin 12+ chars, no hash | `$argon2id$` stored; stdout confirms, no password; exit 0 |
| CLI refuse | empty, 11 chars; or hash exists without `--reset` | nothing stored, exit 1 |
| CLI reset | `--reset`, 2 sessions | hash replaced, 0 sessions |
| No hash | any password | `password_wrong`; one log line naming `npm run set-admin-password` |
| Guard | no cookie, GET `/admin/x?y=1` | 303 `/admin/login?to=%2Fadmin%2Fx%3Fy%3D1`; `resolve` not called |
| Ended | unknown or expired cookie | 303 to login with `expired=1`; cookie deleted; page shows "Bitte melde dich wieder an." |
| Sign in | correct, `to=/admin/settings` | row; one `Set-Cookie` as above; 303 `/admin/settings` |
| Bad target | `https://evil.example`, `//evil.example`, `/adminx`, `/admin/../x`, `/admin\x` | 303 `/admin` |
| Wrong | wrong password | fail(400) `password_wrong`; no password in data |
| Limit | 5 wrong 10:00:00–10:00:20; tries at 10:00:30 / 10:01:20 | refused `rate_limited` (retry 10:01:20, no verify) / checked; other address unaffected; correct resets |
| Expiry | last use 30 d − 1 s / 30 d ago | valid + extended / ended |
| Sign out | POST `/admin/logout` | row deleted, cookie cleared, 303 `/admin/login` |
| Call (a) | keybox `accepted`, last told hot, now cold / cold→hot | `call_required` / `optional` |
| Call none | keybox `pending` + change; or notice back to last told | no entry |
| Call merge | (a) good news + (b) `keybox_refused` | one `call_required` entry with the reason |
| Call order/drop | entries 18:00 optional, 19:00 required; start ≤ now | 19:00 first; started dropped |
| Replies | deleted+email+no `reply_done_at` / email null / done / live | 1 / 0 / 0 / 0 |
| Health | none / beat 09:55 / failing since 09:45 / ok | not-running line (no time) / stale "seit 09:55" / failing "seit 09:45" / no message |

</frozen-after-approval>

## Code Map

- `src/hooks.server.ts` -- `handle = handleParaglide`; add the guard via `sequence`. Its test fakes events without cookies: guard non-admin paths before touching cookies.
- `src/lib/server/db/schema.ts`, `migrations/` (0008 last; `npm run db:generate`), `db/db.test.ts:230` migration test pattern.
- `src/lib/domain/call-list.ts` -- `sendProblems`/`callList` (trigger b). `keybox.ts` `isKeyboxPhase`; `heat-change.ts` `classifyHeatChange`.
- `src/lib/server/db/queries/outbox.ts` `getSendProblemRows`; `queries/booking.ts:79` `currentNotice`; `queries/heartbeat.ts` `getHeartbeat`; `domain/worker-health.ts`.
- `src/lib/server/commands/create-booking.ts` (`isLockTimeout`, options `{now, db}` pattern), `commands/outbox.ts` (`resolve(options)`, `.immediate()`).
- `src/lib/server/ids.ts` `randomId`; `clock.ts` `now`; `guest-urls.ts` (root-relative `ResolvedPathname` pattern).
- Components: `AppHeader`, `InlineMessage` (add optional `id`), `TextField` (make `purpose` optional), `PrimaryButton`, `Icon` (`phone`, `mail`); `.visually-hidden` in `app.css`; tokens `--admin-max`, `--content-max`, `--target-min`.
- Tests: route `server.test.ts` (env mock, in-memory DB), `render.test.ts` (svelte/server), `commands/outbox.test.ts` (temp DB). `scripts/dev-fixtures.ts` shows a node-run script.

## Tasks & Acceptance

**Execution:**
- [x] `schema.ts` + `0009_*` + `db.test.ts` -- migration.
- [x] `src/lib/domain/sign-in-limit.ts` (+test) -- gate, failure, prune.
- [x] `src/lib/domain/call-list.ts` (+test) -- `CallFeedEntry` (adds `lastTold`, `current`), `deriveCallList(feed, now)` → `{bookingId, start, marker, reasons, heatChange}`; trigger (a) only when the latest keybox row `isKeyboxPhase`.
- [x] `src/lib/schemas/admin.ts` (+test) -- sign-in parse; `validateNewPassword` (≥ 12, `password_too_short`).
- [x] `src/lib/server/password.ts`, `commands/admin-session.ts` (+test) -- hash/verify; the four commands; re-export.
- [x] `queries/admin.ts` (+test) -- `getCallFeed(now)`, `countReplyReminders()`.
- [x] `src/lib/server/admin-auth.ts` (+test) -- cookie name/options, `safeReturnTarget`, `loginHref`; `src/app.d.ts` `Locals.adminSession`; `hooks.server.ts` guard (+test).
- [x] `src/lib/server/admin-view.ts` (+test) -- nav counts; home warning text from `workerHealth`.
- [x] `src/routes/admin/login/`, `admin/logout/+server.ts`, `admin/(portal)/+layout.*`, `admin/(portal)/+page.*`, `src/lib/admin-nav.ts` (+server/render tests) -- pages per Design Notes.
- [x] `scripts/set-admin-password.ts`, `package.json` script (+spawn test on a temp DB).
- [x] `messages/{de,en}.json`, `README.md`, `src/routes/admin/README.md` -- copy, CLI, drafted copy list.

**Acceptance Criteria:**
- Given `npm test`, `check`, `lint`, `build`, then all clean and each matrix row has a test that fails without the feature.
- Given the login page, then one `h1`, `<title>` "Anmelden · Sauna Luegisee", hidden `username` "admin", labelled password field `autocomplete="current-password"`; after `password_wrong` the `role="alert"` message shows and the field has `autofocus`; after `rate_limited` the button is `disabled` until `retryAt`.
- Given a signed-in page, then the nav (Übersicht · Buchungen · Blocks · Einstellungen · Auswertung · Abmelden) has `aria-current="page"` on the active tab and two badges with icon, count ("0" when empty) and hidden singular/plural text; no guest page links to `/admin`.

## Design Notes

- Shell: `(portal)/+layout.svelte` = `AppHeader` + nav + `main`, all capped at `--admin-max`; nav `overflow-x: auto` on phones, Abmelden `margin-inline-start: auto` on laptops, tabs ≥ 44 px, active = weight 600 + 2 px `text` underline. Nav hrefs `/admin`, `/admin/day`, `/admin/blocks`, `/admin/settings`, `/admin/analytics` (later stories add the targets). Login uses its own 560 px column with `AppHeader`, a full POST form (no `enhance`), a hidden `to`.
- Home grid: one column; two equal columns from 1024 px.
- Warning time: `formatTime` when on today, else `formatDateShort` + ", " + time.

## Verification

**Commands:**
- `fnm exec --using=26.13.0 npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

## Suggested Review Order

**Sign-in and sessions**

- Entry point: argon2 verify outside the transaction, the hash re-read inside it, rate limit, session row.
  [`admin-session.ts:89`](../../src/lib/server/commands/admin-session.ts#L89)

- Sliding session check used by the guard.
  [`admin-session.ts:137`](../../src/lib/server/commands/admin-session.ts#L137)

- The pure rate-limit rule.
  [`sign-in-limit.ts:30`](../../src/lib/domain/sign-in-limit.ts#L30)

**Guard**

- Every /admin route except the login goes through the guard; same-origin return targets only.
  [`hooks.server.ts:87`](../../src/hooks.server.ts#L87)

**Admin home**

- Nav counts and the worker warning from `workerHealth`.
  [`admin-view.ts:29`](../../src/lib/server/admin-view.ts#L29)

- Call-list core: keybox-phase heat changes merged with send problems, call required wins.
  [`call-list.ts:183`](../../src/lib/domain/call-list.ts#L183)

**Docs**

- The password CLI, the cookie, the rate limit behind Caddy and drafted copy.
  [`README.md:458`](../../README.md#L458)
