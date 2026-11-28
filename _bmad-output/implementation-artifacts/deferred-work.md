# Deferred work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Close the SQLite connection on SIGTERM/SIGINT so the WAL is checkpointed cleanly when the container stops.
  evidence: Story 1.1 review; nothing closes the connection on shutdown. Belongs with the container lifecycle work in Epic 5 (Story 5.1 or 5.4).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Replace the specifier-regex layer rules with path-resolving rules (e.g. eslint-plugin-import `no-restricted-paths`) so pure layers can use relative imports between their own subfolders.
  evidence: Story 1.1 review; `^\.\./` in the domain/time/schemas rules refuses `domain/a/x.ts` → `../b`. Workaround documented in the README (use `#lib/domain/…`); needs a new dependency, so not patched in 1.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-page-shell-with-de-en-and-light-dark.md`
  summary: Decide whether the language links keep the UX-specified accessible names "Deutsch"/"English" or include the visible "DE"/"EN" (WCAG 2.5.3 label in name, for voice control).
  evidence: Story 1.2 review; UX-DR9 fixes the names to "Deutsch"/"English" while the visible text is "DE"/"EN". A UX decision, not a code fix.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-page-shell-with-de-en-and-light-dark.md`
  summary: Put the inline theme script's hash (pinned in src/app-html.test.ts) into the production Content-Security-Policy.
  evidence: Story 1.2 review; the script is required before first paint, and Epic 5 sets the security headers.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-time-module-and-start-time-core.md`
  summary: Story 1.4's "no client chunk references Temporal" build check must look for real use of src/lib/time, not the bare word.
  evidence: The SvelteKit runtime's devalue already contains `Temporal.Instant` etc. in a client chunk (seen in Story 1.3's build), so a plain text search would always fail.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-guest-books-a-start-time.md`
  summary: Protect the public booking action against scripted mass bookings (rate limit per client address, honeypot or similar), without a captcha.
  evidence: Story 1.7 review; the POST action has no volume limit, so a script could book every slot with made-up contact data. Fits the security work in Epic 5 or a small follow-up story; UX bans captchas.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-guest-books-a-start-time.md`
  summary: Decide whether the back link keeps the UX name "Zurück zu Dienstag, 12. Januar" while it visibly reads "‹ Di, 12. Januar" (WCAG 2.5.3 label in name).
  evidence: Story 1.7 review; same kind of conflict as the language links (Story 1.2 deferred item). A UX decision, not a code fix.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-guest-sees-the-confirmation-with-the-notice-at-booking.md`
  summary: Add a browser-level test layer (Vitest browser mode or a small Playwright flow) for client behaviour that server tests cannot reach: day switching state, BookForm busy/slow/failure handling, sessionStorage prefill, shallow URL cleanups, focus management.
  evidence: Raised by the verification-gap review in Stories 1.5, 1.7 and 1.8; the repo has only a node test project, so these behaviours are checked by hand only. Needs a new dev dependency, so it is a decision of its own.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-so-funktioniert-s-privacy-statement-and-impressum-pages.md`
  summary: Have the operators (or a legal check) confirm the privacy and Impressum slots fit Swiss law (revDSG, UWG). Possibly missing slots are guest rights (access, correction, deletion), recipients and processors (hosting, mail provider), transfers abroad, server logs, and a UID/register entry in the Impressum.
  evidence: Story 1.9 review; the slots follow the epic's list and partly a German model ("Verantwortlich für den Inhalt"). Adding slots is cheap once the operators say what they need; the content is theirs.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-guest-receives-the-keybox-email-at-the-24-hour-cutoff.md`
  summary: After the 24 h cutoff the confirmation page says the keybox code is on its way, even when the keybox row is held (missing setting), refused or expired.
  evidence: `keyboxText` in `src/lib/server/booked-view.ts` uses only the cutoff time, never the outbox state. Showing the real state needs an AD-26 decision on what the guest page may reveal.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-guest-is-emailed-when-the-heat-state-changes.md`
  summary: The heat-change debounce has no cap, so changes arriving less than 10 minutes apart can hold the email back until the keybox phase cancels it.
  evidence: `enqueueOne` resets `due_at` to now + 10 min on every repeat change (AD-6 debounce). A cap measured from the first enqueue would need an AD-6 decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-signs-in.md`
  summary: Behind Caddy, the sign-in rate limit keys on the proxy address unless adapter-node's `ADDRESS_HEADER`/`XFF_DEPTH` are set in compose, so one client's wrong tries would slow every admin's sign-in.
  evidence: `signIn` uses `getClientAddress()` (Story 3.1). The compose file and its env come in Epic 5; set the headers there and test the limit through the proxy.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-signs-in.md`
  summary: When a session ends mid-form, an `enhance`d admin form action gets the guard's redirect, and the unsaved input is lost without a message.
  evidence: The guard in `src/hooks.server.ts` throws `redirect(303, loginHref(...))` for every request, including action POSTs. Story 3.1 has no enhanced forms; 3.3, 3.5 and 3.7 add them and should decide how to handle this.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-signs-in.md`
  summary: The guard tests in `src/hooks.server.test.ts` import SvelteKit's internal `with_request_store`, so a kit upgrade can break them.
  evidence: `sequence` needs the request store. Exporting the guard handle and testing it directly would avoid the internal import.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-signs-in.md`
  summary: An admin who is already signed in and opens `/admin/login` sees the form again, and signing in again leaves the old session row behind.
  evidence: The login load does not check the session cookie (Story 3.1 review). Redirecting a valid session to `/admin` (or the `to` target) is a small follow-up.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-admin-signs-in.md`
  summary: The nav badge counts run `getCallFeed` on every admin navigation, and it computes the current notice for every future booking day.
  evidence: The `(portal)` layout load reruns on each navigation. That is fine at the current booking volume; limit the work to keybox-phase bookings if admin pages get slow.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-admin-sees-bookings-by-day.md`
  summary: The admin home's out-of-times and refused-email flags list one link per booking with no cap, so a big hours or season change can put dozens of links above the grid.
  evidence: `buildHomeFlags` in `src/lib/server/admin-view.ts` (Story 3.2 review). Fine at current volume; a cap with "and N more" linking to the day view would need a UX decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-admin-sees-bookings-by-day.md`
  summary: The admin day-switch logic (`isAdminDayPath`, `pendingAdminDay`, the busy/slow/announce effect in `AdminDayView.svelte`) copies the guest `day-nav.ts`/`DayView.svelte` pattern instead of sharing it.
  evidence: Story 3.2 review; a fix in one will drift from the other. A shared helper parameterised by the path pattern would remove the copy; best done with the browser test layer (P3).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-admin-deletes-a-booking-with-an-impact-preview.md`
  summary: After a successful booking delete the admin lands on the day view with focus on the h1 but no status line ("Buchung gelöscht.") is shown or announced; decide with the UX copy review whether admin actions get a success status.
  evidence: The story AC only asks for focus on the day h1; review found screen-reader users hear only the date heading after the delete.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-admin-deletes-a-booking-with-an-impact-preview.md`
  summary: The impact consequence for a keybox email that was refused or expired still reads "weniger als 24 h. ANRUF NÖTIG", although the real reason to call is the failed keybox email.
  evidence: `impactOn` returns `call` for every `endsHeatChangeMail` state and the EXPERIENCE copy has only the 24 h line; such bookings are already on the call list (FR-14).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-admin-creates-and-deletes-blocks.md`
  summary: createBlock has no duplicate guard, so a retry after a lost 303 or a second tab can insert an identical second block (overlapping blocks are allowed).
  evidence: Blind review of Story 3.5; harmless for heat and offers but clutters the Blocks list; a refusal needs copy (product decision).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-admin-creates-and-deletes-blocks.md`
  summary: The Blocks list computes one full deletion impact (getBlock, getDayData, told notice, keybox state, names) per upcoming block with no limit, an N+1 that grows with planned blocks.
  evidence: Blind review of Story 3.5; fine for a handful of blocks, worth batching per date if the list grows.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-admin-works-the-call-list.md`
  summary: Mark called stale-checks only the notice, so a refusal recorded between display and tap (e.g. a keybox refusal the admin never saw, with its code line) is resolved too; the token could also cover the shown reasons/row ids.
  evidence: `markCalled` resolves every unresolved refused/expired and call-required row at commit time; only `noticeEquals` guards the token.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-admin-works-the-call-list.md`
  summary: A call entry for an overdue keybox email held back by an empty keybox code or instructions does not tell the admin the setting is missing (the code line is hidden when no code is set).
  evidence: `admin_call_reason_keybox_overdue` covers both retrying and held rows; no hint or settings link for the empty setting (fits Story 3.7/3.8 or the 5.5 readiness check).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-admin-changes-the-settings.md`
  summary: The settings page's enhanced client flow (pre-heat check → dialog → save, stale swap with focus on the title, saved refresh and focus) has no executing test; only the pure decisions in `settings-outcome.ts` are unit-tested.
  evidence: Story 3.7 review (verification gap, blind hunter): dropping `dialog.open()` or the close on `saved` in `+page.svelte` keeps CI green. Needs the browser test layer (P3).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-admin-changes-the-settings.md`
  summary: The pre-heat dialog shows only "{n} Buchungen bekommen eine neue Ankunftszeit", not how many of them go to the call list (keybox mail already ended) or are urgent.
  evidence: Story 3.7 review: the delete and block dialogs show the consequence in the mini row; the pre-heat dialog follows EXPERIENCE's what line only. Needs a UX decision on the wording.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-admin-changes-the-settings.md`
  summary: Changing the admin password keeps the current session id; consider issuing a fresh session id and cookie on success.
  evidence: Story 3.7 review: a leaked session id survives the credential change (AD-10 hardening).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-admin-manages-seasons-and-rotates-the-keybox-code.md`
  summary: The Saison card shows only the current (or next) season, so a later season row cannot be edited or a second future season created while one runs; consider a season list if operators plan more than one winter ahead.
  evidence: Story 3.8 review (blind hunter); AC scopes the card to "a current season, or a next season if none is current", so it is by design for now.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-admin-changes-the-settings.md`
  summary: The pre-heat dialog count ("{n} Buchungen bekommen eine neue Ankunftszeit") also counts bookings whose told notice already differed before the change, so it overstates the effect of the change itself.
  evidence: Epic 3 browser walkthrough (2026-11-28): 30–40 → 40–50 said 3 bookings, but only 2 got a new arrival time; the third was hot in both windows. By design per the README (class ≠ none against the told notice); needs a counting or wording decision.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-admin-sees-bookings-by-day.md`
  summary: Small admin UI polish from the walkthrough: the booking detail shows the date twice (back link and eyebrow); the read-only Saison "Beginn" input looks editable; below ~400 px the admin nav scrolls with a visible scrollbar in dark mode and hides "Abmelden"; the password card keeps the typed value after a server error.
  evidence: Epic 3 browser walkthrough (2026-11-28) on PR #14; all cosmetic, none blocks merge.
