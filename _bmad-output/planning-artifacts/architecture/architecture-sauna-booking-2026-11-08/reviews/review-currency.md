# Review: currency and reality check

- **Target:** `../ARCHITECTURE-SPINE.md` (draft, 2026-11-08), cross-checked against `../.memlog.md`
- **Lens:** Was every committed decision checked against the web, the registry or the current starter, or was it taken from training data? Look for versions, technologies and starter defaults that are out of date.
- **Re-verified on:** 2026-11-08, using live `npm view` and `npm pack` (package contents inspected), the GitHub API (release assets and changelogs), Docker Hub tag API, nodejs/Release `schedule.json`, nodejs.org `dist/index.json`, the Infomaniak knowledge base and web search.

## Verdict

The version pins are current. All 8 npm pins in the spine still match the `latest` dist-tag today, and the memlog recorded them faithfully. The native-binary memory risk is cleared: better-sqlite3 13 and argon2 both ship musl N-API prebuilds, so nothing compiles on the 2 GB VPS. Two committed details do not hold, though. The **Paraglide pin contradicts the scaffold the spine prescribes** (`sv add paraglide` installs Paraglide 2.x, not 3.2.1). The **`ORIGIN` env var in the config contract no longer exists** in adapter-node 6 / SvelteKit 3. Several toolchain packages the build depends on, TypeScript most importantly, are unpinned, and `latest` would break the install.

**Counts:** Critical 0 · High 1 · Medium 3 · Low 6 · Info 3

## Item-by-item verification

### npm packages (`npm view <pkg> dist-tags`, 2026-11-08)

| Package | Spine pin | Registry today | Published | Status |
| --- | --- | --- | --- | --- |
| `@sveltejs/kit` | 3.1.1 | latest 3.1.1 (version-2 2.70.4, next 3.0.0-next.32 is stale) | 2026-10-29 | Verified |
| `svelte` | 5.57.3 | latest 5.57.3 | 2026-10-26 | Verified (kit 3.1.1 peer `^5.57.1`) |
| `@sveltejs/adapter-node` | 6.0.1 | latest 6.0.1 (version-2 5.5.8) | 2026-10-29 | Verified (peer `@sveltejs/kit ^3.0.0-next.0`) |
| `drizzle-orm` | 0.45.4 | latest 0.45.4 (rc 1.0.0-rc.5, beta 1.0.0-beta.22) | 2026-10-08 | Verified |
| `drizzle-kit` | "pin at scaffold" | latest 0.31.11 | 2026-09-21 | Unpinned (see L1) |
| `better-sqlite3` | 13.0.3 | latest 13.0.3 | 2026-08-05 | Verified |
| `nodemailer` | 10.4.0 | latest 10.4.0 | 2026-11-07 | Verified |
| `@inlang/paraglide-js` | 3.2.1 | latest 3.2.1 (3.0.0 published 2026-11-03; latest 2.x is 2.29.3) | 2026-11-07 | Version is current, but conflicts with `sv add paraglide` (see H1) |
| `argon2` | 0.45.2 | latest 0.45.2 (next 1.0.0-alpha.1) | 2026-11-03 | Verified |
| `vitest` | not named | latest 5.1.0; `sv` scaffolds `^4.1.8` (resolves to 4.1.12) | — | Not named (see L5) |
| `typescript` | not named | latest **7.0.2**; kit 3.1.1 peer `^6.0.0`; latest 6.x is 6.0.3 | — | Not named, and `latest` is incompatible (see M2) |
| `vite` / `@sveltejs/vite-plugin-svelte` | not named | 8.3.6 / 7.3.1 (kit peers `^8.0.12` / `^7.0.0`) | — | Fits (scaffolded by `sv`) |
| `sv` (scaffolder) | implied by `sv add paraglide` | latest 1.3.0 | 2026-11-04 | Checked: it scaffolds kit `^3.0.0`, adapter-node `^6.0.0`, typescript `^6.0.3`, vite `^8.3.0` |

### Runtime, images, services

| Item | Claim | Evidence | Status |
| --- | --- | --- | --- |
| Node 26 LTS | Active LTS since 2026-10-28, EOL 2029-04-30 | nodejs/Release `schedule.json`: v26 "Lithium", lts 2026-10-28, maintenance 2027-10-20, end 2029-04-30. `dist/index.json`: v26.13.0 is the first LTS (2026-10-28) | Verified |
| `node:26-alpine` image | exists | Docker Hub: `26-alpine`, `26-alpine3.24`, `26.13.0-alpine3.24` (updated 2026-11-05) | Verified; floating tag (see L3) |
| Node 26 vs SvelteKit 3 / adapter-node 6 | compatible | kit 3.1.1 `engines.node >=22.17`; kit 3.0.0 changelog: "require Node 22 or newer"; adapter-node declares no engines | Verified |
| Caddy 2.11.x | current line | Docker Hub `caddy:2.11.9` and `2.11.9-alpine` (2026-11-06, amd64 present); GitHub `v2.11.9` 2026-11-05 fixes a 2.11.8 regression; no 2.12 tag | Verified; exact tag now known (see L2) |
| better-sqlite3 13 on Alpine/musl, Node 26 | prebuilt, no compile | The `npm pack` tarball contains `prebuilds/linuxmusl-x64.node` (2.4 MB), built against N-API 10 (`binding.gyp` `NAPI_VERSION=10`), so it does not depend on the Node ABI (Node 26 ABI is 147). `gypfile: false` with no install script, so npm never runs node-gyp. GitHub releases for v13.x have **0 assets**: prebuilds moved into the npm tarball, and the old prebuild-install download path is gone. Bundled SQLite is 3.53.4 | Verified (no compile, so no OOM risk) |
| argon2 0.45.2 on Alpine/musl, Node 26 | prebuilt | The tarball contains `prebuilds/linux-x64/argon2.musl.node` (prebuildify `--napi`). Install script `node-gyp-build` picks the prebuild | Verified (no compile) |
| Vite 8 / rolldown on Alpine | (implicit) | rolldown 1.2.16 publishes `@rolldown/binding-linux-x64-musl` as an optional dependency | Verified |
| drizzle-orm 0.45 + better-sqlite3 13 | compatible | drizzle-orm 0.45.4 peer `better-sqlite3 >=7`. The `sv` 1.3.0 drizzle add-on pins exactly this trio: `drizzle-orm ^0.45.2`, `drizzle-kit ^0.31.10`, `better-sqlite3 ^13.0.2` | Verified |
| `sv add paraglide` with SvelteKit 3 and paraglide-js 3 | works | `sv` 1.3.0 targets kit 3 but its paraglide add-on runs `sv.devDependency("@inlang/paraglide-js", "^2.18.2")`, which resolves to **2.29.3**, not 3.x. Paraglide's own SvelteKit example (opral/paraglide-js `examples/sveltekit`) is still on `@sveltejs/kit ~2.69.2` | **Contradicted** (see H1) |
| `hooks.server.ts` `init` for the worker loop | exists in kit 3 | kit 3.1.1 types: `export type ServerInit = () => MaybePromise<void>` | Verified |
| adapter-node env `ADDRESS_HEADER`, `XFF_DEPTH` | exist | adapter-node 6.0.1 `src/handler.js` reads `XFF_DEPTH`, `ADDRESS_HEADER`, `PROTOCOL_HEADER`, `HOST_HEADER`, `PORT_HEADER`, `BODY_SIZE_LIMIT` | Verified |
| adapter-node env `ORIGIN` | exists | adapter-node 6.0.0 changelog: "add `kit.paths.origin` config option, remove `kit.prerender.origin` and the adapter-node `ORIGIN` environment variable" (#16161) | **Out of date** (see M1) |
| nodemailer 10 | fits | 10.0.0: Node 20+ required, migrated to TypeScript with ESM and CJS builds and ships its own types. 9.0.0: TLS validated by default for remote fetches (irrelevant here) | Verified |
| Infomaniak SMTP 587 STARTTLS | correct | Infomaniak FAQ 468: outgoing `mail.infomaniak.com`, 587 with STARTTLS recommended (465 implicit TLS as alternative), auth required with the full address as username, LOGIN/PLAIN | Verified |
| Infomaniak Swiss Backup S3-compatible | yes | Infomaniak FAQ 1579: a "Cloud" device gives "S3 Compatible" settings. The endpoint is cluster-specific (`https://s3.swiss-backup0N.infomaniak.com`, N shown under Location in the Manager). Newer AWS CLI fails ("aws-chunked is not supported"); Infomaniak recommends `s3cmd`. FAQ 2285 documents rclone (Swift) | Verified, with tooling caveat (see L4) |
| Temporal in Node 26 (open question) | "if available" | Node 26.0.0 release notes: Temporal enabled by default | Verified: resolves the open question on the server (see L6) |
| Docker Compose | pin at scaffold | docker/compose latest v5.7.0 (2026-11-02) | Unpinned, acceptable as a deferral |

## Findings

### H1 — Paraglide pin 3.2.1 contradicts `sv add paraglide`, which installs 2.x [High]

- **Where:** AD-14 says Paraglide is "added via `sv add paraglide`". The versions table pins `@inlang/paraglide-js` 3.2.1.
- **Evidence:** `sv` 1.3.0 (latest, 2026-11-04) pins `@inlang/paraglide-js ^2.18.2`, which resolves to 2.29.3. Paraglide 3.0.0 came out 2026-11-03, five days ago, followed by 3.1.0, 3.2.0 and 3.2.1 by 2026-11-07. It is a major release with breaking changes:
  - removes `additionalFiles` and `experimentalMiddlewareLocaleSplitting`
  - makes Vite `outputStructure: "virtual-modules"` the default, which needs the Vite plugin, so standalone Node scripts or tests that load messages outside Vite need `"message-modules"`
  - requires inlang SDK 4.1+

  No upstream source shows 3.x running with SvelteKit 3: the official add-on installs 2.x, and Paraglide's own SvelteKit example is on kit 2.69. The memlog recorded the registry `latest` but never checked what the prescribed scaffold actually installs.
- **Risk:** An implementing agent either runs `sv add paraglide` and ships 2.29.3 against a spine that says 3.2.1, or force-bumps to a 5-day-old major. In the second case, email rendering in the worker and Vitest unit tests (AD-14, AD-15) may hit the virtual-modules default. All of this lands on a mid-December hard deadline.
- **Fix:** Pin **`@inlang/paraglide-js` 2.29.3**, the version `sv add paraglide` proves out on SvelteKit 3, and record "Paraglide 3 upgrade after the season launch" as deferred. If 3.x is kept instead, change AD-14 to "run `sv add paraglide`, then `npm i -D -E @inlang/paraglide-js@3.2.1`". Also set `outputStructure: "message-modules"` explicitly in the Vite plugin options, so the worker's email rendering and Vitest can import messages outside the Vite dev pipeline.

### M1 — `ORIGIN` env var was removed in adapter-node 6 / SvelteKit 3 [Medium]

- **Where:** The Conventions table, Config row, lists `ORIGIN` among the env vars read by `src/lib/server/env.ts`.
- **Evidence:** adapter-node 6.0.0 changelog (#16161) removes the `ORIGIN` env var. Origin is now the build-time `kit.paths.origin` in `svelte.config.js`. When it is unset, adapter-node 6 derives the origin as `PROTOCOL_HEADER` value or `https`, plus `HOST_HEADER` or `Host`, so a plain Caddy proxy still works by accident.
- **Risk:** The env var is silently ignored. The intended fixed origin for CSRF and form actions under AD-11/AD-13 never takes effect, and the origin is trusted from the `Host` header. This is SvelteKit 2 knowledge, not a verified fact.
- **Fix:** Remove `ORIGIN` from the env list. Add the rule "`kit.paths.origin = 'https://sauna-luegisee.ch'` in `svelte.config.js`". Keep `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`, which are still valid in 6.0.1.

### M2 — TypeScript unpinned; `latest` (7.0.2) violates the SvelteKit 3 peer range [Medium]

- **Evidence:** `@sveltejs/kit@3.1.1` has peer `typescript ^6.0.0`, and kit 3.0.0 makes "TypeScript 6 … the minimum". `svelte-check@4.7.8` has peer `typescript ^5 || ^6`. `typescript` latest is 7.0.2. `sv` scaffolds `^6.0.3`.
- **Risk:** Running `npm i -D typescript` adds 7.x and causes a peer-resolution failure (ERESOLVE) or a broken `svelte-check` in the Docker build on the VPS.
- **Fix:** Add rows to the versions table: **`typescript` 6.0.3**, `vite` 8.3.6, `@sveltejs/vite-plugin-svelte` 7.3.1, `svelte-check` 4.7.8. Commit the lockfile and use `npm ci` in the Dockerfile.

### M3 — The spine does not flag SvelteKit 3 convention changes that agents trained on SvelteKit 2 will get wrong [Medium]

- **Evidence:** Breaking changes in kit 3.0.0 that bear on this spine:
  - `$lib` replaced by `#lib`, with explicit module extensions required (#16360, #16736)
  - `$app/stores` removed
  - `invalidateAll` deprecated in favour of `refreshAll`
  - hook types moved to `@sveltejs/kit/hooks`
  - `/server/` directories are server-only everywhere
  - form action responses use the status code from `fail` (matches the spine's `fail(status, …)` convention, good)
  - cookie `path` defaults to `/`
- **Risk:** The spine fixes kit 3.1 but gives no hint of these changes. Implementation agents will default to kit 2 idioms (`$lib/server/...`, `$app/stores`).
- **Fix:** Add one convention line: "SvelteKit 3 idioms: import via `#lib/…` with explicit extensions; `$app/state` not `$app/stores`; `refreshAll`; hook types from `@sveltejs/kit/hooks`; origin via `kit.paths.origin`."

### L1 — drizzle-kit not pinned [Low]

- **Fix:** Pin **`drizzle-kit` 0.31.11**, the pair for drizzle-orm 0.45.4 that the `sv` drizzle add-on uses. Do not take the `rc` or `beta` tags: drizzle 1.0.0-rc.5 changes the kit and migrator.

### L2 — Caddy exact tag is now knowable [Low]

- **Evidence:** 2.11.9 (2026-11-05) is current. 2.11.8 (2026-11-04) introduced a regression that 2.11.9 fixes, plus security backports. The memlog's "reports of 2.11.7" is superseded.
- **Fix:** Pin **`caddy:2.11.9-alpine`**, or `caddy:2.11.9`, in compose now rather than "at build".

### L3 — `node:26-alpine` is a floating tag [Low]

- **Fix:** Pin **`node:26.13.0-alpine3.24`** in both Dockerfile stages, so builds on the VPS are reproducible. Bump it on purpose.

### L4 — Swiss Backup S3 endpoint is per cluster; AWS CLI is incompatible [Low]

- **Evidence:** Infomaniak FAQ 1579 gives the endpoint as `https://s3.swiss-backup0N.infomaniak.com`, with N per account. The current AWS CLI fails with an aws-chunked error, and Infomaniak recommends `s3cmd`.
- **Fix:** Name the upload tool in AD-18 or `scripts/backup.sh`: `s3cmd`, or `rclone` with the S3 provider `Other`. Do not use `aws s3`. Add `SWISS_BACKUP_ENDPOINT` to the secrets list.

### L5 — Test runner not named [Low]

- **Evidence:** AD-19 requires full unit tests of the pure core, but no runner is pinned.
- **Fix:** Pin **`vitest` 4.1.12**, the version `sv` scaffolds (`^4.1.8`) and which accepts vite `^8`. If 5.1.0 (latest, engines `^22.12 || ^24 || >=26`) is preferred, choose it deliberately.

### L6 — Temporal availability resolved; browser caveat [Low]

- **Evidence:** Node 26 enables Temporal by default (Node 26.0.0 release notes). This settles the open question for server code.
- **Fix:** Settle the open question as "Temporal on the server". If `src/lib/time` is also imported by client components for the calendar grid, confirm browser Temporal support or keep wall-clock maths server-side only.

### Info

- **I1.** drizzle-orm 1.0 is at rc.5 (2026-10-21). Staying on 0.45.4 stable is right for the deadline.
- **I2.** nodemailer 10 ships its own TypeScript types. Do not add `@types/nodemailer`, which is still at 8.0.2 and redundant.
- **I3.** Set `SMTP_HOST=mail.infomaniak.com`, `SMTP_PORT=587`, and `SMTP_USER` to the full mailbox address (Infomaniak FAQ 468).

## Sources

- npm registry, 2026-11-08: `npm view` dist-tags, engines and peers, publish times. `npm pack` contents of better-sqlite3@13.0.3, argon2@0.45.2, @inlang/paraglide-js@3.2.1, @sveltejs/adapter-node@6.0.1, @sveltejs/kit@3.1.1, sv@1.3.0
- GitHub: WiseLibs/better-sqlite3 releases (v13.x have 0 assets); sveltejs/kit `packages/kit/CHANGELOG.md` and `packages/adapter-node/CHANGELOG.md`; opral/paraglide-js `CHANGELOG.md` and `examples/sveltekit/package.json`; caddyserver/caddy releases v2.11.8 and v2.11.9; nodemailer/nodemailer `CHANGELOG.md`; docker/compose releases
- [nodejs/Release schedule.json](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json), [nodejs.org dist index](https://nodejs.org/dist/index.json), [Node.js 26.0.0 release](https://nodejs.org/en/blog/release/v26.0.0)
- Docker Hub tag API: `library/node` (26-alpine*), `library/caddy` (2.11*)
- [Infomaniak FAQ 468: mail ports and protocols](https://www.infomaniak.com/en/support/faq/468/understanding-mail-ports-and-protocols)
- [Infomaniak FAQ 1579: Swiss Backup CLI S3](https://www.infomaniak.com/en/support/faq/1579/back-up-data-using-the-command-line-to-swiss-backup-cli-s3), [FAQ 2285: rclone on Swiss Backup](https://www.infomaniak.com/en/support/faq/2285/save-linux-with-rclone-on-swiss-backup)
