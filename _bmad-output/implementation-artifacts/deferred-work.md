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
