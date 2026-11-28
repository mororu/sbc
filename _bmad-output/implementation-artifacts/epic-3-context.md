# Epic 3 Context: Operators run the wagon from the admin portal

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Operators sign in to `/admin` with one shared password and run the wagon without touching the database. They can:
- see each day's bookings with contact details, the notice now, the last-told notice and the keybox code that was sent
- delete bookings and create or delete blocks, each after an impact preview of what happens to the booking behind it
- answer cancelled guests with a prepared email in the guest's language
- work the derived call list, so guests whose keybox email already went out, or whose email failed, still hear about changes
- change every business setting, including seasons and keybox code rotation

The admin home warns when the worker stops. This epic uses what Epics 1–2 built: the pure core (`src/lib/domain`), the command layer, the outbox and worker, the heat-change enqueue, the send-problem core and `workerHealth`. Every mutation is a command in one exclusive transaction. Every preview calls the same core functions as its command.

## Stories

- Story 3.1: Admin signs in
- Story 3.2: Admin sees bookings by day
- Story 3.3: Admin deletes a booking with an impact preview
- Story 3.4: Admin answers cancelled guests
- Story 3.5: Admin creates and deletes blocks
- Story 3.6: Admin works the call list
- Story 3.7: Admin changes operating hours, changeover, horizon, pre-heat window, instructions, contact and password
- Story 3.8: Admin manages seasons and rotates the keybox code

## Requirements & Constraints

- **Access:**
  - `hooks.server.ts` guards every `/admin` route except `/admin/login`, never a page alone. Unauthenticated requests load and serialize no admin data.
  - No guest page links to `/admin`.
  - Row ids appear only in admin routes. Guest data appears only in admin-only `mailto:`/`tel:` links.
- **Password:**
  - Only an argon2 hash is stored in `setting.admin_password_hash`. A CLI, `npm run set-admin-password`, reads the password from stdin. It needs at least 12 characters, and `--reset` also deletes all sessions.
  - The password is never echoed, logged, passed as an argument or env value, or echoed back in form `values`.
- **Sessions:**
  - A server-side `admin_session` row holds a random id of at least 128 bits. It expires 30 days after last use, and each request extends it.
  - The cookie is `Secure`, `HttpOnly` and `SameSite`. It is one of exactly two cookies; the other is the language cookie.
  - The return target is accepted only as a same-origin path under `/admin`.
- **Rate limit:** after 5 wrong passwords per client address, at most one try per minute until a correct one. The counters are an in-memory map owned by the sign-in command, and a restart resets them.
- **Soft delete:** deleting a booking sets `deleted_at` and nothing else is removed. Every query and core input excludes deleted bookings, except the reply reminder (`deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`). Only mark-reminder-done writes `reply_done_at`.
- **No retroactive change:**
  - Changing the changeover, operating hours, horizon, season or keybox code enqueues nothing and changes no existing booking.
  - Bookings outside new hours or seasons stay valid. They are flagged by a derived core flag, never stored.
  - Only booking deletion, block create/delete and a pre-heat window change recompute notices.
- **Past:** nothing whose start has passed can be deleted, blocked or changed (`past`).
- **Logs:** never name, email, mobile, keybox code or password.
- **Quality floor:** works at 320 px, 200 % text and in both themes. Targets at least 44 px. WCAG 2.2 AA.

## Technical Decisions

- **Commands:** every write is a verb-first function in `src/lib/server/commands`, run in one `BEGIN IMMEDIATE` transaction, with all checks against freshly read state. The Epic 3 commands are sign in/out, delete booking, create/delete block, change settings (season rows included), change password, mark called and mark reminder done.
  - Results are `{ ok: true, … }` or `{ ok: false, code }`, with `code` one of `conflict`, `stale`, `not_found`, `past` or `invalid`. Commands never throw for expected outcomes.
  - Routes read through `db/queries` and write only through commands.
- **Impact previews and the stale check:**
  - The preview and the command call the same pure-core functions: `affectedBooking`, the notice, `classifyHeatChange(lastTold, current)` and the keybox phase.
  - The form posts an impact token. The command recomputes it and refuses with `stale` if anything changed, including changes from other commands (delete vs block vs pre-heat).
- **Heat-change enqueue:**
  - For each booking a command can affect, when `classifyHeatChange ≠ none`, upsert exactly one open `heat_change` row due now + 10 min. Booking or block create/delete affects the affected booking. A pre-heat change affects all future non-deleted bookings.
  - Nothing is upserted once the keybox email has ended heat-change mail. Those changes go to the call list.
  - Reuse `enqueueHeatChanges` in the command's open transaction. Deleting a booking also cancels its `pending`/`transient_failure` rows.
- **Call list (AD-21):** it is derived on every request and never stored. It covers non-deleted bookings whose start has not passed, one entry per booking.
  - (a) Keybox phase: an urgent heat change is *Anruf nötig*, good news is *optional*.
  - (b) A send problem (`sendProblems`) is *Anruf nötig*, with a reason.
  - Call required wins. The order is *Anruf nötig* first, then start time.
  - Mark called is stale-checked by the posted canonical notice token. It writes `last_told_notice` from that token and sets `resolved_at` on refused/expired rows and on the overdue keybox row. Resolving the overdue keybox row amends AD-21, and the amendment must be recorded in the architecture spine.
- **Notice (AD-24):** there is one canonical Notice JSON. Only `noticeEquals` and `classifyHeatChange` compare notices. The "HINWEIS GEÄNDERT" tag comes from `noticeEquals(current, lastTold)`.
- **Keybox code shown to admins:**
  - The code that was sent always comes from the accepted row's send snapshot. Old-code tags and lists compare that snapshot with the current setting.
  - A new code takes effect only for later claims, and nothing is resent.
- **Seasons (AD-25):** rows that never overlap, edited in place. "Nächste Saison anlegen" adds a row. `booking.season_id` never changes.
- **Changeover (AD-8):** the current changeover applies only to new offers and bookings. Back-to-back pairs use the changeover recorded on the later-made booking. A block may not sit inside that gap.
- **Blocks:**
  - The `block` table from Story 1.3 is used, with no new migration. Reasons are `cleaning` · `maintenance` · `private_use`.
  - A block never heats the wagon and needs no changeover after it. Block ends create no kind-2 start times.
  - Guest queries never select block reasons.
- **Validation (AD-16):** one valibot schema per form in `src/lib/schemas`, shared by the client and the action. Errors are i18n keys. Form actions return `fail(status, { errors, values })`, never with passwords in `values`.
- **i18n (AD-14):** all admin strings, including the prepared reply subject and body, come from Paraglide `messages/`. The reply renders in the booking's stored locale. A German string left in EN mode is wrapped in `lang="de"`.
- **Migration (3.1 only):** `setting.admin_password_hash`, `admin_session`, `booking.reply_done_at`. No other story in this epic plans a migration.

## UX & Interaction Patterns

- **Layout:**
  - Admin nav: Übersicht, Buchungen, Blocks, Einstellungen, Auswertung, Abmelden. The active tab uses weight 600, a 2 px underline and `aria-current="page"`, never the primary colour. It scrolls horizontally on phones and is capped at 1040 px.
  - Admin home: one column on phones. Two columns from 1024 px: call list and replies on the left, next bookings on the right.
  - Day: rows below 1024 px, a table from 1024 px. Detail capped at 640 px.
  - Settings: one `surface` card per group, each with its own Speichern.
- **Counts:** call-list and reply counts are separate badges, never summed, and show "0" when empty. Empty sections stay visible with their empty line.
- **Impact dialog:**
  - A native `<dialog>` with `showModal()`. Focus starts on Abbrechen and is contained. Esc or a scrim tap cancels, and focus returns to the trigger.
  - On phones it is bottom-anchored. On laptops it is centred, at most 480 px.
  - On `stale` the dialog shows the new impact with "Die Auswirkung hat sich geändert …" and focus moves to the title.
- **Mini row and call-list text:** the impact mini row uses "Neuer Hinweis: komm zwischen …". The call-list "NEUER HINWEIS" uses the confirmation-badge text. Both come from one notice value.
- **After actions:**
  - When an entry disappears (Angerufen, Erledigt, delete), focus moves to the next item heading or the section heading. A polite status gives the new count.
  - Failures show the inline "Das hat nicht geklappt. Nichts wurde geändert …" at the item, with focus on it.
  - An item already handled by another admin shows "Schon erledigt." or "Diese Buchung gibt es nicht mehr."
- **States:** never shown by colour alone; text tags use a 1 px box. `tel:` and `mailto:` links also show the number or address as text. Day switching uses the guest pattern (dimmed list, `aria-busy`, "Lädt …" after 1 s).
- **Copy:** missing EN and other strings are drafted in the epics' "Copy not yet in the UX catalogue" list under the voice rules (informal *du*, Swiss spelling, clock times only), for operator review. The mockups `key-admin-home`, `key-admin-delete-dialog` and `key-admin-settings` show the layouts.

## Cross-Story Dependencies

- **3.1 sets up the base for every other story:**
  - the guard, sessions and nav
  - the call-list count core
  - the heartbeat warning, which uses `workerHealth` from Story 2.5. It returns `ok`, `stale` (5 min) or `failing` (sends failing transiently for 15 min). The story copy covers only "not running since"; `failing` has no copy yet, so decide whether and how to show it.
- **Call-list core:**
  - Story 2.4/2.5 delivered `sendProblems`/`callList` in `src/lib/domain/call-list.ts`, with the reasons `keybox_refused`/`expired`/`overdue` and `warning_refused`/`expired`/`overdue`. It covers trigger (b) only.
  - 3.1 must add trigger (a) (keybox-phase urgent or good-news), the merge where call required wins, and the drop at start, with unit tests.
  - 3.6 displays the list and adds mark called.
  - Retro items B1–B3 are implemented by Story 2.5, but they are still `open` in `sprint-status.yaml`.
- **Keybox phase in code is wider than the story text:** since Story 2.5, a keybox row in `transient_failure` also ends heat-change mail (`endsHeatChangeMail`). 3.3, 3.5 and 3.7 must use that core function rather than "not in the keybox phase and not `in_flight`".
- **Stale chain:** 3.3's delete stale check must also catch changes from 3.5 (block save) and 3.7 (pre-heat change). 3.3 deletion feeds 3.4's reminders and 3.6's entries. 3.2's day view and detail are where the 3.3, 3.5 and 3.8 actions and flags appear. 3.7 and 3.8 share the settings page and the out-of-hours/season flag on the admin home (3.2).
- **Open decisions and items that bear on this epic:**
  - **P3 (open):** decide the browser test layer (Vitest browser mode or a small Playwright flow) before the admin UI. Dialog focus, `aria-busy` day switching, clipboard fallback and focus after removal cannot be reached by node tests. Adding it needs a new dev dependency.
  - **Label in name (WCAG 2.5.3, deferred from 1.2 and 1.7):** the same conflict applies to the admin back link "‹ DI, 12. JANUAR" and the badge hidden texts. This is a UX decision.
  - **B4 (open):** lint the mail and route boundaries. Mail must not import `db/queries` or view models, and routes must not import worker-only queries. Move `badgeText` into a shared copy module. Admin routes add many new query imports.
  - **B5 (open):** move the outbox policy (gating, sweep, supersede) into `src/lib/domain` as a pure state machine and split `claimDueRow`. Best done before 3.3, 3.5 and 3.7 add more callers.
  - **A8 (open):** a guest resubmit after an admin has deleted the booking returns `conflict`, but AD-3 says an existing token never does. 3.3 makes this reachable, so decide it first.
  - **A10 (open):** dev fixtures should follow `DEV_NOW`, with shared test fixtures and env mocks.
  - **S1 and S4 (open):** reconcile the spine, including the AD-21 amendment from 3.6.
  - **Deferred:** the heat-change debounce has no cap, so repeated admin edits less than 10 minutes apart keep pushing the email back.
- **Later epics:** Epic 4's purge sets contact columns to NULL, which removes reminders and empties detail fields. Epic 5 ships the password CLI in the production image (`docker compose exec app npm run set-admin-password`), sets security headers, and its readiness check lists empty keybox and instruction settings.
