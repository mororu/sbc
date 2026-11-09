# Epic breakdown: final validation (step 4)

- **Validated:** `_bmad-output/planning-artifacts/epics.md` (6 epics, 27 stories)
- **Against:** PRD `prds/prd-sauna-booking-2026-11-08/prd.md`, `architecture/architecture-sauna-booking-2026-11-08/ARCHITECTURE-SPINE.md`, UX `ux-designs/ux-sauna-booking-2026-11-08/EXPERIENCE.md` + `DESIGN.md`
- **Date:** 2026-11-09
- **Scope:** step-04 sections 1–5 (FR coverage, architecture implementation, story quality, epic structure, dependencies), plus a copy-catalogue cross-check. No source file was edited.

## Verdict

**Not ready for development yet.** Every FR is traced to at least one story, and the ACs are concrete and mostly correct (all worked examples, dates, weekdays and the DST arithmetic check out). But there is **1 critical** issue and there are **4 high** ones to fix first:
- Nobody owns the admin password bootstrap.
- Story 1.6 depends forward on 1.7.
- Nothing guards a launch with unset operator content.
- Stories 1.1 and 1.2 are too big for one dev session.

The medium findings are mostly about precision: heat-change conditions, migration wording, the copy catalogue, and the prod/dev switch. Fix them in the same pass, because each one will otherwise be improvised by a dev agent.

| Severity | Count |
| --- | --- |
| Critical | 1 |
| High | 4 |
| Medium | 15 |
| Low | 17 |

### Critical and high at a glance

| ID | Severity | Title | Location |
| --- | --- | --- | --- |
| C1 | critical | Admin password bootstrap and hash column are owned by no story; 1.1, 3.1 and 5.1 contradict each other | 1.1, 1.2, 3.1, 5.1 |
| H1 | high | 1.6 uses the admin contact setting that 1.7 creates (forward dependency) | 1.6 → 1.7 |
| H2 | high | Nothing guards a launch with an empty keybox code or instructions, or with placeholder privacy, info, Impressum or contact text (FR-11, FR-29) | 1.7, 2.2, Epic 5 |
| H3 | high | Story 1.1 is too large for one dev session | 1.1 |
| H4 | high | Story 1.2 is too large for one dev session | 1.2 |

---

## 1. FR coverage validation

### 1.1 Trace table

Status key:
- **Full**: every testable consequence in the PRD has a matching AC.
- **Partial**: at least one consequence has no AC or is weakened (finding referenced).

| FR | Stories | Status | Note |
| --- | --- | --- | --- |
| FR-1 | 1.2, 1.3, 3.8 | Full | All four consequences have ACs (not selectable, before/after-season copy, past times hidden, nothing revealed) |
| FR-2 | 1.2, 1.4, 3.5 | Full | All five worked examples are ACs, plus the changeover-raise case |
| FR-3 | 1.4 | Full | 17:20–17:30, block 17:25, collapsed 17:45 with minutes, arrival-past |
| FR-4 | 1.2 | Full | Kind 1/2/3 and the hours/changeover/block rules. The 15:30/15:45/15:15 and 17:00/17:30 examples are arithmetically correct |
| FR-5 | 1.5 | Full | |
| FR-6 | 1.5 | Full | Contact retention without JS accepted as progressive enhancement |
| FR-7 | 1.6 | Full | |
| FR-8 | 1.2, 1.3, 1.5 | Full | |
| FR-9 | 1.5, 1.7 | Full | |
| FR-10 | 2.1, 1.6 | Full | Copy gap for the "keybox comes right away" email variant (M15) |
| FR-11 | 2.2, 2.4, 1.6 | Partial | The empty keybox code at send time is unguarded (H2) |
| FR-12 | 2.3, 3.3, 3.5, 3.7 | Partial | "Book-then-delete inside the settle delay sends nothing" has no AC (M2). The recheck condition is under-specified (M1) |
| FR-13 | 3.3, 3.5, 3.6 | Full | |
| FR-14 | 2.4, 3.2, 3.6 | Full | |
| FR-15 | 3.1, 3.7 | Partial | No story makes the first sign-in possible (C1) |
| FR-16 | 3.2 | Full | Keybox status copy is incomplete for non-terminal states (M15) |
| FR-17 | 3.5 | Full | |
| FR-18 | 3.3, 3.5 | Full | |
| FR-19 | 1.2, 3.5 | Full | |
| FR-20 | 3.7, 3.8, 3.2 | Full | The pre-heat count semantics need tightening (M1). Flagged out-of-season bookings can't be reached from the admin day view (M6) |
| FR-21 | 3.1, 3.6 | Full | |
| FR-22 | 6.1 | Full | |
| FR-23 | 6.1 | Full | |
| FR-24 | 6.2 | Full | |
| FR-25 | 4.1, 6.2 | Partial | "Free start time that passed" is undefined for the snapshot job (M7) |
| FR-26 | 1.1, 1.5, 1.7 | Partial | A language switch on the booking form doesn't keep the duration or party-size selection (L10) |
| FR-27 | 1.5, 2.1–2.3, 3.1, 3.4 | Full | |
| FR-28 | 4.2 | Full | |
| FR-29 | 1.7 | Partial | Only slots with placeholders; there is no check before launch (H2) |
| FR-30 | 4.1 | Full | |
| FR-31 | 3.3, 3.4 | Full | |

NFR-1 to NFR-10 are all addressed. NFR-6 is covered by 5.3 and NFR-9 by 2.1, 2.2 and 5.4.

### 1.2 FR coverage findings

**M2 (medium): FR-12 "book-then-delete inside the settle delay sends nothing" has no AC.** Location: 3.3 (2.3 only covers the generic recheck).
- 2.3 tests the recheck-equal rule in general. But UJ-2's explicit case (booking made, then deleted within 10 min, so no email) crosses Epic 2 and Epic 3, and no story asserts it end to end.
- **Fix:** add an AC to 3.3. Jonas has last-told cold 17:50–18:00. Someone books 17:15–18:15, which upserts a heat_change row. An admin deletes that booking 5 minutes later. At claim, the row becomes `cancelled`, no email goes out, and `last_told_notice` is unchanged.

**M7 (medium): FR-25 / FR-30 "free start time that passed unbooked" is undefined for the snapshot job.** Location: 4.1.
- The core offer function excludes start times that have begun at `now`, so calling it once after the day has passed returns nothing.
- It is also not stated whether a kind-1 time with no fitting duration counts as "free". Example: 16:00 before a 17:00 booking.
- **Fix:** in 4.1, define the count as each kind-1 or kind-2 start time that the offer function returned with at least one duration when evaluated with `now` just before that start time, using the day's final bookings and blocks and the settings at snapshot time. Its heat state is the one returned at that point. Add a unit test with a booked time, a blocked time and a time with no fitting duration.

**H2 (high): nothing guards a launch with unset operator content.** Location: 1.7, 2.2, Epic 5.
- 2.2 seeds the keybox code and the DE/EN instructions as empty. 1.7 seeds a placeholder admin contact. 1.2 seeds a placeholder season and placeholder hours. 1.7 says placeholder text is flagged by "a pre-launch check", but no story builds or runs that check.
- At launch with defaults, keybox emails go out with an empty code and FR-11 fails silently. The privacy statement also fails FR-29, which requires operator contact and retention.
- **Fix, part 1:** in 2.2, the worker must not send a keybox email while the code or the booking-language instructions are empty. The row stays `pending` and the AD-21 "not accepted 15 min after due" rule puts it on the call list. Alternatively, the admin home shows an error inline message "Schlüsselbox-Code fehlt" while it is empty.
- **Fix, part 2:** in 5.1, add a "pre-launch check" AC: a script or admin-home banner lists every unset or placeholder item. That covers keybox code, instructions DE/EN, admin contact, season dates, operating hours, and the `/info`, `/privacy` and `/imprint` placeholders. First public deploy is blocked until it is empty.

**L10 (low): the language switch on the booking form loses the selected duration and party size.** Location: 1.5 (UX-DR9 "keeps … form input").
- **Fix:** add an AC in 1.5. Switching language on `/book/...` keeps name, email and mobile (sessionStorage) and the selected duration and party size (e.g. as query params, which are not guest data).

---

## 2. Architecture implementation validation

### 2.1 Starter template: PASS

Story 1.1 scaffolds with `sv create` and `sv add paraglide` (de base, en, cookie → preferredLanguage → base, no URL prefixes). It adds adapter-node 6.0.1, Drizzle on better-sqlite3, Vitest, svelte-check, ESLint boundary rules, the structural-seed tree, the SvelteKit 3 idioms, and the four scaffold decisions recorded in the README.

Deploy files (`Dockerfile`, `docker-compose.yml`, `Caddyfile`, `scripts/backup.sh`) are deferred to Epic 5. That is correct under the "only what is needed" rule.

Minor omissions, low and folded into H3's split:
- No pinned Node version for dev (`engines` or `.nvmrc` = 26.13.0).
- `@sveltejs/vite-plugin-svelte` 7.3.1 is not listed.

### 2.2 Tables created when first needed

| Table / columns | Created | First written | First read | Verdict |
| --- | --- | --- | --- | --- |
| `season` + seed | 1.2 | 1.2 seed, 3.8 | 1.2 | OK |
| `setting` (hours, changeover, horizon, pre-heat) | 1.2 | 1.2 seed, 3.7 | 1.2 | OK |
| `setting.admin_contact` | **1.7** | 1.7 seed, 3.7 | **1.6** (confirmation "Absagen") | **Forward dependency (H1)** |
| `setting.keybox_code`, instructions DE/EN | 2.2 | 3.7 / 3.8 | 2.2 | OK, but unset at launch is unguarded (H2) |
| `setting.admin_password_hash` | **never** | CLI (unowned) | 3.1 | **Missing (C1)** |
| `booking` core columns + `deleted_at` | 1.2 | 1.5 / 3.3 | 1.2 | OK |
| `booking.deleted_at` again | **3.1** "where they do not yet exist" | n/a | n/a | **Created twice (M3)** |
| `booking.reply_done_at` | 3.1 | 3.4 | 3.1 (count query) | OK |
| `booking` contact, party size, locale, public id, submit token | 1.5 | 1.5 | 1.5 | OK |
| `booking.notice_at_booking`, `last_told_notice` | 1.6 | 1.6 | 1.6 | OK. Rows created in 1.5 dev data need a backfill or nullable columns (low, see L1) |
| `block` (start, end, reason) | 1.2 | fixture, 3.5 | 1.2 | Acceptable, see M4 |
| `block.created_at` | 3.5 "if missing" | 3.5 | n/a | Unneeded, wording non-deterministic (M4, L6) |
| `outbox`, `worker_heartbeat` | 2.1 | 2.1 | 2.1 / 3.1 | OK; snapshot columns unspecified (L16) |
| `outbox.resolved_at` | 2.4 | 3.6 | 2.4 | OK |
| `admin_session` | 3.1 | 3.1 | 3.1 | OK |
| login rate-limit storage | 3.1 (undecided) | 3.1 | 3.1 | L7 |
| `analytics_booking`, `analytics_day` | 4.1 | 4.1 | 6.1 | OK |

**C1 (critical): the admin password bootstrap and hash column are owned by no story, and three stories contradict each other.** Location: 1.1, 1.2, 3.1, 5.1.
- 1.1 decides that a CLI `npm run set-admin-password` will be "built with the sign-in story in Epic 3".
- 3.1 says the hash is "stored in settings (bootstrapped in Epic 1)" and has no AC for the CLI.
- 5.1 still says "decided at scaffold (seed command or first-run env)" and adds a refuse-to-overwrite rule.
- No migration adds the password-hash column to `setting`.
- A dev agent on 3.1 finds no column, no CLI, and a story that says both already exist. Without them nobody can sign in, so all of Epic 3 is blocked.
- **Fix, part 1:** in 3.1, add an AC that "this story's migration adds `admin_password_hash` (nullable) to `setting`", plus an AC for `npm run set-admin-password`. The command reads from stdin with no echo, stores only the argon2 hash, and refuses if a hash exists unless `--reset` is passed (the recovery path when every admin has lost the password). It never logs or echoes the password.
- **Fix, part 2:** change 3.1's "bootstrapped in Epic 1" to "set by the CLI from this story".
- **Fix, part 3:** in 5.1, replace "seed command or first-run env" with "`npm run set-admin-password` (Story 3.1)", inside the app container via `docker compose exec`.
- **Fix, part 4:** keep 1.1's wording, which is correct.

**H1 (high): 1.6 needs the admin contact setting that 1.7 creates.** Location: 1.6 (Absagen "schreib an" the admin contact), 1.7 migration.
- **Fix:** move "`setting` gains the admin contact address (seeded placeholder)" from 1.7 to 1.6, or add the column to 1.2's `setting` seed. 1.7 then only adds the footer `mailto:` link.

**M3 (medium): `booking.deleted_at` is created twice.** Location: 1.2, 3.1.
- 1.2 creates nullable `deleted_at`. 3.1's migration "adds the nullable `deleted_at` and `reply_done_at` columns … where they do not yet exist".
- Drizzle-kit migrations are generated from the schema and are not conditional, so "where they do not yet exist" is not a migration a dev can write.
- **Fix:** in 3.1, change it to "this story's migration adds the nullable `reply_done_at` column to `booking` (`deleted_at` exists since Story 1.2)".

**M4 (medium): the `block` table is created in 1.2, but 3.5 reads as if it builds the block wiring.** Location: 3.5 first AC.
- 3.5 "adds `created_at` if missing" (non-deterministic wording, and AD-8/AD-25 don't need it). It also states, as new behaviour, that "the guest calendar, booking form and book command pass the stored blocks to the core". 1.2 (taken rows "per booking or block") and 1.5 (book refuses block overlap) already require that.
- A dev agent on 3.5 may re-wire or duplicate the block reads.
- **Fix:** delete the `created_at` clause, or make it unconditional with a reason (e.g. ordering in the blocks list). Rephrase the wiring AC as a regression check: "Given a block saved through the admin form, the guest calendar shows it as a taken row … (wiring from Stories 1.2/1.5 is reused, not rebuilt)".

**L6 (low): `block.created_at` has no consumer in the ADs.** Location: 3.5. **Fix:** drop it unless the blocks list sorts by it.

**L16 (low): 2.1 creates "snapshot columns" without naming them.** Location: 2.1.
- **Fix:** list them explicitly: `snapshot_notice` (canonical JSON), `snapshot_keybox_code` (nullable), `snapshot_locale`, `snapshot_urgent` (nullable boolean). Keybox and heat-change stories then write existing columns instead of each adding a migration.

**L7 (low): the login rate-limit storage and the admin session lifetime are left open.** Location: 3.1.
- **Fix:** decide in 3.1. For example: in-memory map (single instance, resets on restart, accepted), and sessions expire 30 days after last use.

---

## 3. Story quality validation

### 3.1 Story size

**H3 (high): Story 1.1 is too large.** It covers:
- scaffold, pinned stack, ESLint boundary rules with a failing fixture, env module, DB connection with WAL, migration workflow, README decisions
- all colour, type, spacing and border tokens with a documented contrast check, and 11 icons
- header, language switch with cookie, theme switch with pre-paint script, skip link
- footer with three stub pages
- focus ring, forced colours, reduced motion, reflow at 320 px / 200 %

**Fix:** split it in two.
- **1.1a "Project scaffold":** `sv create`/`sv add`, pinned versions plus Node pin, tree, idioms, `env.ts` with `.env.example`, DB connection with WAL and busy timeout, migration-at-boot workflow, ESLint boundaries with the violating fixture, README scaffold decisions, and a placeholder `/` page.
- **1.1b "Calm, readable page in DE/EN, light/dark":** tokens and contrast check, icons, header, language and theme switches, skip link, footer with stub pages, focus, forced colours, reduced motion, reflow, no third-party assets.

**H4 (high): Story 1.2 is too large.** It covers:
- the `src/lib/time` module with DST tests
- migration and seeds
- the full three-kind offer algorithm and heat state, with five worked examples and the changeover-raise case
- the server-rendered day view with every row style
- the three season states, URL redirect rules, and the view-model / guest-query restrictions

**Fix:** split it in two.
- **1.2a "Time module and start-time core":** `time`, offered start times, heat state, all unit tests. Pure and testable without UI.
- **1.2b "Guest sees a day":** migration and seed, day view, rows, season states, redirects, view model. It calls 1.2a.

**M14 (medium): Story 1.5 is large.** It covers the form UI with two segmented controls and three fields, the shared schema, the book command, idempotency, concurrency, sessionStorage, and four failure states.
- **Fix:** split it in two.
  - **1.5a:** form, schema, book command, redirect to a minimal `/booked`, idempotent submit.
  - **1.5b:** conflict, past, stale-form, network-failure and slow states, and sessionStorage retention.

**M11 (medium): Story 3.1 is large.** It covers sign-in, sessions, the guard with return target, rate limiting, sign-out, the admin nav with both badges, the full AD-21 call-list derivation in the core with tests for every trigger, the admin home layout, and the heartbeat warning.
- **Fix:** split it in two.
  - **3.1a "Admin signs in":** sign-in, sessions, guard, rate limit, sign-out, the CLI and hash column from C1.
  - **3.1b "Admin shell and home":** nav and home layout, heartbeat warning. Badges read "0" until 3.4 and 3.6 wire the counts.
- Then move the call-list core derivation and its unit tests into 3.6, where it is displayed. 3.6 then wires the badge count.

**M12 (medium): Story 3.2 is large.** It covers the admin day strip and heading, rows plus the ≥ 1024 px table, booking detail, next bookings on home, and the flags for out-of-hours bookings and refused emails.
- **Fix:** move booking detail (`/admin/booking/{id}`) into its own story, 3.2b, placed before 3.3, which builds on it.

**M13 (medium): Story 3.7 is large.** It has seven cards, one of them with an impact dialog and an all-bookings recompute, plus the password change.
- **Fix:** split it in two.
  - **3.7a:** hours, changeover, horizon, instructions, contact, password (simple saves).
  - **3.7b:** pre-heat window with impact dialog, recompute and stale check.

**L17 (low): Story 2.1 is borderline.** It covers the outbox, the worker loop with singleton, boot recovery, catch-up and heartbeat, SMTP and sink transport, and the email format and template. It fits one session but leaves no slack. Split the worker and outbox from the email rendering if the session runs long.

### 3.2 FR references and technical detail

Every story has a "Covers" line with FR, NFR, UX-DR and AD ids. The ACs are specific (values, copy, enum names), and the dates and weekdays used are all correct for 2026/27:
- 12 Jan 2027 is a Tuesday, 16 Jan a Saturday, 28 Mar a Sunday.
- The cutoff `2027-01-11T17:00:00Z` is correct.
- The DST cutoff `2027-03-27T08:00:00Z` (09:00 CET) is correct.

---

## 4. Epic structure validation

- **User value:** Epics 1–4 and 6 are user-facing. Epic 5 is operational but framed as "goes live" and covers NFR-5/6/7/9. This is acceptable.
- **Foundation work:** no big upfront technical epic. The scaffold sits inside 1.1, and tables arrive with their first story (except C1, H1, M3 and M4).
- **File churn (L15, low, informational):**
  - The book command is touched by 1.5, 1.6, 2.1, 2.2, 2.3 and 3.5.
  - `src/lib/domain` is touched by most stories in Epics 1–3.
  - The admin home is touched by 3.1, 3.2, 3.4 and 3.6.
  - This is justified: the Epic 1 → 2 split gives a reviewable booking flow before the email machinery, and the admin home grows section by section. No consolidation is recommended.

---

## 5. Dependency validation

### 5.1 Epic independence

| Epic | Depends on | Verdict |
| --- | --- | --- |
| 1 | none | OK. Guests can book without emails |
| 2 | 1 | OK |
| 3 | 1, 2 (outbox data for call list, impact, keybox status) | OK in order. Not usable without Epic 2, which is acceptable because Epic 2 ships first |
| 4 | 1, 2 (worker); 3.4 only for one purge AC | OK (backward only) |
| 5 | 1–4 | OK |
| 6 | 3.1 (nav, auth), 4.1 (tables) | OK |

### 5.2 Requested checks, one by one

| Check | Result |
| --- | --- |
| 1.5 → 1.6 confirmation | **L1 (low).** 1.5 redirects to `/booked/{publicId}` "(completed in Story 1.6)". This is not blocking, but 1.5 must build the route. **Fix:** in 1.5, state "this story creates `/booked/[publicId]` showing 'Gebucht!', date, start, duration and party size, and a 404 for unknown ids; 1.6 adds the notice, keybox sentence and details list". Also make 1.6's notice columns nullable, or backfill dev rows |
| 1.1 footer links → 1.7 | OK. 1.1 creates stub `/info`, `/privacy` and `/imprint` pages, so no link is broken. The admin contact link arrives in 1.7 (but see H1 for 1.6) |
| 2.3 heat-change triggers | OK. 2.3 wires only the book trigger; deletion, block and pre-heat triggers are added in 3.3, 3.5 and 3.7 (backward use of the 2.3 templates) |
| 3.1 call-list derivation vs 3.6 | No forward dependency (3.1 builds it, 3.6 uses it). It does front-load 3.6's logic into an already large story; see M11 |
| 3.3 vs 3.4 reply reminder | OK. 3.3 doesn't need 3.4. The reminder count query from 3.1 already reacts to deletions |
| 2.2 keybox code setting vs 3.8 | **L3 (low).** 2.2's AC "Given an admin changes the keybox code after a keybox email was accepted" references the 3.8 UI. **Fix:** phrase it as "Given the keybox code setting changes (direct update in the test)". 3.8 already re-asserts it through the UI. The real risk is the empty code, covered by H2 |
| Epic 4 analytics vs Epic 6 | OK (Epic 6 reads only 4.1 tables). L12: `analytics_booking` stores no start-time kind, so FR-25's "booked" side counts kind-3 bookings while the unbooked side counts only kind 1/2. Decide in 4.1 whether to store `start_kind` (cheap now, impossible to backfill later) or to accept the asymmetry in 6.2 |
| Epic 5 secrets (GUEST_KEY_SECRET at startup in 4.1) | No forward dependency. Production generation is in 5.1 and dev needs any value. L11: after 4.1 every dev and test run needs the variable. **Fix:** in 1.1a, ship `.env.example` with a dev-only secret and the non-production mail sink. In 4.1, state that tests inject the secret |
| set-admin-password CLI (1.1 vs Epic 3) | **C1** |
| 3.3 stale-impact AC | **L4 (low).** It names "a new booking, block or settings change", but blocks and settings changes arrive in 3.5 and 3.7. **Fix:** test it with a new booking only in 3.3; 3.5 and 3.7 each assert that their own change makes an open delete dialog stale |

---

## 6. Contradictions (between stories, and with the ADs)

**C1:** see §2.2 (password bootstrap: 1.1 vs 3.1 vs 5.1).

**M1 (medium): "heat change" vs "notice changed" is used inconsistently.** Location: 2.3, 3.3, 3.5, 3.7.
- AD-6 upserts a `heat_change` row only "for each one with a heat change against its last-told notice". But:
  - 2.3, 3.3 and 3.5 say the command "upserts exactly one open `heat_change` row" after recomputing, with no `classifyHeatChange ≠ none` condition.
  - 3.7 counts bookings "whose notice would change". UX says "bekommen eine neue Ankunftszeit" (later earliest or earlier latest).
  - 2.3's worker recheck only cancels when `noticeEquals`. If the notice moved to a widening-only difference before the claim, the worker sends an email with `classifyHeatChange = none` and no template exists for it.
- **Fix, part 1:** in 2.3, 3.3, 3.5 and 3.7, upsert only when `classifyHeatChange(lastTold, current) ≠ none`.
- **Fix, part 2:** in 2.3's claim AC, cancel when `classifyHeatChange(lastTold, current) = none`, which includes the equal case. Add a unit test for a widening-only drift.
- **Fix, part 3:** in 3.7, n counts `classifyHeatChange ≠ none`.
- Note this as a clarification of AD-6.

**M5 (medium): 3.6 sets `resolved_at` on "overdue keybox rows" too, which AD-21 doesn't.** Location: 3.6.
- AD-21 says mark called sets `resolved_at` on refused and expired rows only. Under AD-21 as written, an overdue keybox entry (still `pending` or `transient_failure` 15 min past due) could never be cleared by "Angerufen".
- 3.6 is the better behaviour but contradicts the spine.
- **Fix:** keep 3.6 and record an AD-21 amendment in the spine: mark called also resolves a keybox row that is not yet accepted and more than 15 min past due. In 2.4's core rule, make sure a later `refused` or `expired` on an already-resolved row doesn't re-raise the entry.

**M6 (medium): the admin day view returns not-found outside the season, which hides flagged bookings.** Location: 3.2 vs 3.8 and FR-20.
- After the season is shortened, bookings after the new end "stay fully valid and are flagged". But `/admin/day/{date}` "outside that season returns a not-found page" and the strip covers only the season, so those days can't be browsed.
- Past seasons are unreachable too once a next season exists.
- **Fix:** in 3.2, the admin day route accepts any date that is in a season row or has a non-deleted booking or block. The strip appends such out-of-season days, marked with the flag text.

**L2 (low): 2.2's keybox-phase tests list "pending → in_flight → … expired".** Location: 2.2.
- In AD-23, `expired` comes only from `pending` or `transient_failure`, never from `in_flight`.
- **Fix:** list the transitions as in the AD-23 diagram. Add the case "`in_flight` row older than the in-flight timeout at boot after start time → back to `pending` → `expired` on the next tick".

**L5 (low): 3.5 says "a booking may start the minute a block ends".** Location: 3.5.
- Per PRD §4, block ends create no start times (kind 2 is booking end plus changeover only). A block ending at 11:10 therefore lets the next booking start at 11:30, not at 11:10.
- **Fix:** reword to "no changeover is required after a block; the next kind-1 start time at or after the block end is offered".

**L13 (low): the "notice to give" text differs between the call list and the impact row.** Location: 3.6.
- The call list shows "Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein." (badge style). The impact row shows "Neuer Hinweis: komm zwischen 16:35 und 16:45."
- **Fix:** say in 3.6 that the call-list notice uses the confirmation-badge catalogue text, and the impact row uses the "Neuer Hinweis" line.

**L14 (low): the changeover in `affectedBooking` is ambiguous.** Location: 2.3. It says "one changeover plus the longer pre-heat end" without saying which changeover.
- **Fix:** state the current changeover for the search window. The clamp itself uses the recorded changeover (AD-8).

**L8 (low): 3.4's prefilled text uses the "guest's first name", but there is only one Name field.** **Fix:** use the full name as entered, or define "first whitespace-separated token".

**L9 (low): 1.3 adds a "Heute" / "Today" strip link that UX doesn't specify.** **Fix:** remove it, or add it to EXPERIENCE.md with copy and placement (it also needs a 44 px target).

**M8 (medium): the production vs development switch is unspecified.** Location: 1.1, 2.1, 5.2.
- 2.1 and 5.2 require the local sink outside production "even if production-like env values are present".
- 1.1's `env.ts` "fails fast when a variable needed at runtime is missing".
- AD conventions list no mode variable, so a dev cannot tell how production is detected, or which variables are required in dev.
- **Fix:** in 1.1a, decide that production is `!dev` from `$app/environment` (the build mode) or `NODE_ENV=production` set in the Dockerfile. In dev, `SMTP_*` are optional and the sink is always used; in production every variable is required. Record this in the README scaffold decisions.

**M9 (medium): Temporal may reach client bundles.** Location: 1.2, 1.3.
- AD-9 and the Additional Requirements say to check browser support if client code imports `src/lib/time`. 1.3's client-side day switching (status line, `document.title`) and 1.5's live end times ("bis 19:30") invite client imports.
- iOS Safari is the primary guest browser.
- **Fix:** add an AC in 1.2b/1.3. Client code doesn't import Temporal: the server view model carries pre-formatted strings, or the client uses `Intl.DateTimeFormat` only. Add a build check, e.g. grep the client bundle for `Temporal`.

**M10 (medium): CSP placement can break SvelteKit hydration.** Location: 5.4.
- 5.4 allows the CSP "in one place (Caddy or hooks.server.ts)" with no `'unsafe-inline'` and the theme script by hash.
- SvelteKit emits its own inline hydration script per page, which a static Caddy header can't hash.
- **Fix:** require the CSP through SvelteKit's `kit.csp` config (hash or nonce mode), with the theme script's hash added there. Keep HSTS, `X-Content-Type-Options` and `Referrer-Policy` in Caddy, or set all of them in `hooks.server.ts`. Keep 5.4's console-has-no-violations AC.

---

## 7. Copy strings required by stories but missing from the UX catalogue

**M15 (medium):** the stories demand copy "exactly per EXPERIENCE.md, DE and EN", but the catalogue lacks the items below. Without them, dev agents will invent wording in the guest voice and in English.

**Fix:** add one "Copy addendum" table to EXPERIENCE.md, DE and EN, before Epic 1 starts. Also add plural/singular variants (Paraglide variants) for every `{n}` string.

### Guest pages

| # | Story | Missing |
| --- | --- | --- |
| 1 | 1.2, 1.5, 1.6, 1.7 | EN `<title>` patterns: "Tue, 12 January · Sauna Luegisee", "Book 18:00 · Sauna Luegisee", "Booked · Sauna Luegisee". Titles for `/info`, `/privacy`, `/imprint` in EN. Error title prefix "Fehler: " in EN |
| 2 | 1.1, 1.7 | EN footer link labels for So funktioniert's · Datenschutz · Impressum |
| 3 | 1.3 | EN "Vorheriger Tag" / "Nächster Tag". EN "Lädt …". "Heute"/"Today" link (L9) |
| 4 | 1.3 | Singular day-switch status ("1 freie Zeit" / "1 free time") |
| 5 | 1.2, 1.4 | EN screen-reader names: "16:00 bis 17:00, belegt", "18:15, schon heiss. … Buchen." |
| 6 | 1.5 | EN button "Book 18:00", EN "Wird gebucht …" |
| 7 | 1.5 | EN duration option names ("90 minutes, until 19:30"). EN unavailable note ("120–180 min not possible: next booking at 20:00."). The DE/EN note variant for a block or the end of operating hours as the reason (the catalogue only has "nächste Buchung") |
| 8 | 1.5 | Singular submit summary ("1 Angabe fehlt oder stimmt nicht.") |
| 9 | 1.5 | EN back link and its accessible name ("Back to Tuesday, 12 January") |
| 10 | 1.6 | EN "Das hat sich gerade geändert." EN "So stand es bei der Buchung. Änderungen schicken wir dir per Mail." EN "Der Schlüsselcode ist schon unterwegs in dein Postfach." |
| 11 | 1.6 | On-screen keybox sentence (DE is only in the email key line; EN missing). Details terms Wann · Personen · Absagen in EN. "Absagen: schreib an …" in EN |
| 12 | 1.6 | Guest 404 page (unknown `/booked/{id}`): heading and line |

### Emails

| # | Story | Missing |
| --- | --- | --- |
| 13 | 2.1–2.3, 3.4 | **EN body key lines for every email** (the catalogue gives EN subjects only): confirmation, keybox, good news, urgent hot → cold, later earliest, earlier latest, and the prepared reply "Hello Lena, …" |
| 14 | 2.1 | Confirmation-email variant when past the cutoff ("the code follows in a moment"), DE/EN |
| 15 | 2.1 | Email detail labels (date, start, duration, party size), DE/EN |
| 16 | 2.2 | Keybox email: the marker that the current notice "counts", and the instructions heading, DE/EN |
| 17 | 2.3 | Urgent later-earliest body with a collapsed range ("Nur 15 Minuten zum Einheizen: komm um 17:45 …"); the catalogue only has the 17:25–17:30 range |

### Admin pages

| # | Story | Missing |
| --- | --- | --- |
| 18 | 3.1 | Sign-in page `h1` and `<title>`, password field label, button label ("Anmelden"), DE/EN |
| 19 | 3.1–3.8, 6.1 | `<title>` for every admin route, DE/EN |
| 20 | 3.1 | Worker heartbeat warning with time ("Der Versand läuft seit {Zeit} nicht."), DE/EN |
| 21 | 3.1 | Singular/plural badge hidden text ("1 Anruf offen", "2 Antworten offen") |
| 22 | 3.2 | EN skip link "Skip to bookings" |
| 23 | 3.2 | Booking row party size in EN and singular ("1 Person" / "1 person", "2 people") |
| 24 | 3.2 | Schlüsselmail status for `in_flight`, `transient_failure` (retrying), `expired` and `cancelled`; the catalogue has only sent/planned/refused |
| 25 | 3.2 | Label for refused non-urgent emails on booking detail (e.g. "Bestätigung abgelehnt: {Grund}") and the admin-home flag line for them |
| 26 | 3.2 | Out-of-season/hours flag text on the row and on detail (the catalogue only has the home summary line) |
| 27 | 3.2 | Admin not-found pages (unknown booking id, day outside the range) |
| 28 | 3.3, 3.5, 3.7 | EN impact-dialog titles, what lines and confirm buttons ("Delete booking?", "Delete block?", "Save block?", "Change pre-heat window?", "Delete booking", "Save"); the catalogue's per-trigger table is DE only |
| 29 | 3.4 | "Text kopieren" success status (e.g. "Kopiert.") and the no-clipboard fallback hint, DE/EN |
| 30 | 3.5 | Block form labels (date, from, to, reason legend), EN reason labels (Cleaning · Maintenance · Private use), EN "Neuer Block" / "Prüfen" |
| 31 | 3.5 | Block validation: end not after start, not on a 5-minute step, start already passed |
| 32 | 3.5 | Blocks list row format |
| 33 | 3.5, 3.7 | Singular "Dieser Block überschneidet 1 Buchung …", "1 Buchung liegt ausserhalb …", "1 Buchung bekommt …" |
| 34 | 3.6 | Call-list reasons for an **expired** keybox email, an **overdue** keybox email (still retrying) and an **expired** urgent heat-change email. The keybox "code to give" line ("Code durchgeben: 4711"), DE/EN |
| 35 | 3.8 | "Nächste Saison anlegen" (DE in epics only, EN missing). Season overlap error. Read-only ended-season label. Grouped old-code list heading after a second code change |
| 36 | 4.2 | Placeholder for purged contact fields ("gelöscht" / "deleted") |
| 37 | 6.1, 6.2 | Reading lines ("Am meisten los: Samstag ab 17 Uhr.", FR-24 reading). Week label "ab Mo 4. Januar". The "not enough data for a comparison" line. Season selector label. Figure and table headers (bookings, booked hours, unique guests, repeat share, empty share, hot/cold unbooked/booked) |

---

## 8. Findings index

| ID | Sev | Section | Location | Title |
| --- | --- | --- | --- | --- |
| C1 | critical | 2.2 / 6 | 1.1, 3.1, 5.1 | Password bootstrap and hash column unowned and contradictory |
| H1 | high | 2.2 / 5 | 1.6 → 1.7 | Admin contact setting used before it is created |
| H2 | high | 1.2 | 1.7, 2.2, Epic 5 | No guard or launch check for unset keybox code, instructions or legal text |
| H3 | high | 3.1 | 1.1 | Story too large; split scaffold vs page shell |
| H4 | high | 3.1 | 1.2 | Story too large; split core vs day view |
| M1 | medium | 6 | 2.3, 3.3, 3.5, 3.7 | Upsert and recheck on notice change instead of heat change |
| M2 | medium | 1.2 | 3.3 | No AC for book-then-delete inside the settle delay |
| M3 | medium | 2.2 | 1.2, 3.1 | `deleted_at` created twice / conditional migration wording |
| M4 | medium | 2.2 | 3.5 | Block table and wiring re-specified; "if missing" migration |
| M5 | medium | 6 | 3.6 | `resolved_at` on overdue keybox rows deviates from AD-21 |
| M6 | medium | 6 | 3.2 | Admin day view not-found hides flagged out-of-season bookings |
| M7 | medium | 1.2 | 4.1 | "Free start time that passed" undefined for the analytics_day job |
| M8 | medium | 6 | 1.1, 2.1, 5.2 | Prod/dev switch for env and mail transport unspecified |
| M9 | medium | 6 | 1.2, 1.3 | Temporal may reach client bundles (iOS Safari) |
| M10 | medium | 6 | 5.4 | CSP via Caddy incompatible with SvelteKit inline hydration |
| M11 | medium | 3.1 | 3.1 | Story too large; move call-list core to 3.6 |
| M12 | medium | 3.1 | 3.2 | Story too large; split booking detail |
| M13 | medium | 3.1 | 3.7 | Story too large; split pre-heat impact |
| M14 | medium | 3.1 | 1.5 | Story large; split failure states |
| M15 | medium | 7 | many | Copy catalogue gaps (37 items, EN email bodies the largest) |
| L1 | low | 5 | 1.5 | Make the minimal `/booked` route explicit; nullable notice columns |
| L2 | low | 6 | 2.2 | `in_flight → expired` not an AD-23 transition |
| L3 | low | 5 | 2.2 | AC references the admin code-change UI from 3.8 |
| L4 | low | 5 | 3.3 | Stale-impact AC references block/settings changes from 3.5/3.7 |
| L5 | low | 6 | 3.5 | "Start the minute a block ends" vs start-time kinds |
| L6 | low | 2.2 | 3.5 | `block.created_at` has no consumer |
| L7 | low | 2.2 | 3.1 | Rate-limit storage and session lifetime undecided |
| L8 | low | 6 | 3.4 | First-name derivation undefined |
| L9 | low | 6 | 1.3 | "Heute" strip link not in UX spec |
| L10 | low | 1.2 | 1.5 | Language switch loses duration and party size |
| L11 | low | 5 | 1.1, 4.1 | `.env.example` with dev secret and sink |
| L12 | low | 5 | 4.1 | No start-time kind stored for FR-25's booked side |
| L13 | low | 6 | 3.6 | Notice-to-give phrasing differs from the impact row |
| L14 | low | 6 | 2.3 | Which changeover `affectedBooking` uses |
| L15 | low | 4 | Epics 1–3 | File churn on the book command (justified, informational) |
| L16 | low | 2.2 | 2.1 | Outbox snapshot columns not named |
| L17 | low | 3.1 | 2.1 | Borderline story size |
