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
