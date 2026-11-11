# Sauna Luegisee booking calendar

Booking calendar for the Sauna Luegisee wagon at sauna-luegisee.ch. One SvelteKit (adapter-node) process, one SQLite file, one in-process worker. The architecture lives in `_bmad-output/planning-artifacts/architecture/`.

## Setup

Node is pinned to 26.13.0 (`.nvmrc`, `engines`, `engine-strict`). With [fnm](https://github.com/Schniz/fnm):

```bash
fnm install 26.13.0
fnm use
cp .env.example .env
npm ci
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server; applies migrations to `DATABASE_PATH` on boot |
| `npm run build` | Production build (adapter-node) into `build/` |
| `npm start` | Runs the production build (`node build`); needs the production env |
| `npm test` | Vitest, once (env parsing, db setup and migrations, layer boundary rules) |
| `npm run check` | Generates Paraglide types, then svelte-check |
| `npm run lint` | ESLint, including the layer boundary rules |
| `npm run i18n:types` | Compiles `messages/` into `src/lib/paraglide` (also run by `check` and `lint`) |
| `npm run db:generate` | Generates a SQL migration from `src/lib/server/db/schema.ts` |

## Layers

`eslint.config.js` enforces the layer table of the architecture (AD-1, AD-2):

- `src/lib/domain` (pure core) imports only `src/lib/time`.
- `src/lib/time` and `src/lib/schemas` import nothing from the app.
- The pure layers never read the clock (`Date.now`, `Date()`, `performance.now`, `Temporal.Now`) or env, use only static imports, and do no I/O.
- The db layer (everything directly in `src/lib/server/db` except `queries/`, plus `better-sqlite3` and `drizzle-orm`) is importable only by `src/lib/server/commands` and `src/lib/server/db/queries`. The one exception: `src/hooks.server.ts` imports `db/migrate.ts` to migrate at boot.
- `process.env`, `import.meta.env` and `$env/*` are read only in `src/lib/server/env.ts`.

`src/eslint-boundaries.test.ts` lints a snippet for each rule, so `npm test` fails if a rule stops working. Known gap: inside a pure layer, relative imports between its own subfolders (`domain/a/x.ts` → `../b`) are refused; use `#lib/domain/…` there.

## Page shell

- **Tokens:** every colour, type role, spacing value and border lives in `src/lib/styles/tokens.css`, taken from the DESIGN.md frontmatter. No hex colour may appear anywhere else in `src/` (checked by `src/lib/styles/tokens.test.ts`). Small text that carries meaning (`body-sm`, `segment`) uses weight 400 instead of 300, per the resolved ambiguity of 2026-11-08.
- **Theme:** the first visit follows `prefers-color-scheme`. The theme switch stores `light` or `dark` in `localStorage.theme`, the only storage key. An inline script in `src/app.html` applies it before first paint, so there is no flash. Once a choice is stored it always wins. The production CSP must allow this script by hash (Epic 5). `src/app-html.test.ts` pins the current hash, so any edit to the script fails a test until the hash is updated in both places. Without JavaScript the switch stays hidden (it could not work), and the page follows the device setting.
- **Language:** the "DE | EN" links go to `GET /lang/{de|en}?to=<current path and query>`. The route stores the Paraglide cookie (`PARAGLIDE_LOCALE`, the only guest cookie; not HttpOnly because Paraglide also reads it in the browser) and redirects back with 303. Only same-origin paths are accepted as `to`; anything else returns to `/`. This works without JavaScript. `<html lang>` is `de-CH` for German and `en` for English.

### Contrast

Computed by `src/lib/styles/tokens.test.ts` from `tokens.css` (WCAG 2.x relative luminance; translucent `line-strong` composited over the ground). The test fails if any value drops below its floor.

| Role | Floor | Light on background | Light on surface | Dark on background | Dark on surface |
| --- | --- | --- | --- | --- | --- |
| `text` | 4.5:1 | 13.66:1 | 15.38:1 | 14.88:1 | 12.96:1 |
| `muted` | 4.5:1 | 6.11:1 | 6.88:1 | 8.21:1 | 7.15:1 |
| `primary` | 4.5:1 | 6.84:1 | 7.70:1 | 7.75:1 | 6.75:1 |
| `hot` | 4.5:1 | 5.42:1 | 6.10:1 | 8.36:1 | 7.28:1 |
| `cold-start` | 4.5:1 | 5.79:1 | 6.52:1 | 9.59:1 | 8.35:1 |
| `taken` | 4.5:1 | 5.19:1 | 5.85:1 | 5.36:1 | 4.67:1 |
| `error` | 4.5:1 | 5.70:1 | 6.42:1 | 8.42:1 | 7.33:1 |
| `line-strong` (control boundary) | 3:1 | 3.49:1 | 3.62:1 | 3.40:1 | 3.29:1 |
| `focus` (focus ring) | 4.5:1 | 6.04:1 | 6.80:1 | 9.64:1 | 8.39:1 |
| `on-primary` on `primary` | 4.5:1 | 7.89:1 | – | 7.75:1 | – |
| `on-error` on `error` | 4.5:1 | 6.57:1 | – | 8.42:1 | – |

### Drafted copy for operator review

These strings are not in the UX catalogue yet. They were drafted under the voice rules and need a check by the operators:

| Key | DE | EN |
| --- | --- | --- |
| `footer_info`, `info_title` | So funktioniert's | How it works |
| `footer_privacy`, `privacy_title` | Datenschutz | Privacy |
| `footer_imprint`, `imprint_title` | Impressum | Imprint |
| `home_title` (until the calendar exists) | Kalender | Calendar |
| `home_body` (until the calendar exists) | Hier entsteht der Buchungskalender für den Saunawagen. | The booking calendar for the sauna wagon is coming here. |
| `stub_body` (until Story 1.9) | Dieser Text folgt bald. | This text is coming soon. |

## Scaffold decisions

1. **Instants are UTC ISO 8601 text** with seconds and `Z`, e.g. `2027-01-12T17:00:00Z`, everywhere, including the notice JSON. It is readable in the database and in logs, sorts correctly as text, and round-trips through Temporal without loss. Wall-clock dates in URLs stay `yyyy-mm-dd`, times `hhmm`.
2. **Valibot** is the validation library for `src/lib/schemas`. It is small and tree-shakeable, so the shared schemas cost little in the client bundle.
3. **The first admin password is set with a one-off CLI command**, `npm run set-admin-password`. It reads the password from stdin and stores only an argon2 hash, so no extra env variable or plaintext secret is needed. The command and the hash column are built in Story 3.1.
4. **Migrations** are generated with `drizzle-kit generate` (or `--custom` for hand-written SQL), committed as SQL under `src/lib/server/db/migrations`, and applied by the app in the `init` server hook before it serves requests. The deploy is a single step and the schema can never lag behind the code. The production image must ship that folder; the path is relative to the app's working directory.

### Environment: production vs development

- Production means `NODE_ENV=production`, set in the Dockerfile (Epic 5). There, all seven variables (`DATABASE_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `GUEST_KEY_SECRET`) are required. The app fails at startup and names every missing variable.
- Anything else is development. `SMTP_*` and `MAIL_FROM` are optional, and the mail transport is **always the local sink**, even if production-like SMTP values are present, so development can never email a real guest.
- `.env.example` works for `npm run dev` as is. Its `GUEST_KEY_SECRET` is for development only and must never be used in production. Tests pass their own values to `parseEnv`.

### Origin

`kit.paths.origin` is `https://sauna-luegisee.ch` for builds only. In `vite dev` the request origin is localhost, and a fixed origin would make SvelteKit's CSRF check reject form posts. As a result, `npm run preview` on localhost also rejects form posts.
