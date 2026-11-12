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
| `npm run build` | Production build (adapter-node) into `build/`; fails if `src/lib/time` reaches a client chunk |
| `npm start` | Runs the production build (`node build`); needs the production env |
| `npm test` | Vitest, once (env parsing, db and queries, time and core, day view, layer rules, build guard) |
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
| `stub_body` (until Story 1.9) | Dieser Text folgt bald. | This text is coming soon. |

## Time and start-time core

- `src/lib/time` is the only place that converts between UTC instants and Europe/Zurich wall-clock (Temporal, built into Node 26). Instants are ISO text such as `2027-01-12T17:00:00Z`; dates are `yyyy-mm-dd`. Client code must not import it.
- `src/lib/domain/start-times.ts` computes a day's offered start times with their durations and heat state (`offeredStartTimes`) and the heat state of existing bookings (`bookingHeat`). The calendar (Story 1.4) and the book command (Story 1.7) will call this same function, so the calendar never offers a time the command refuses. Callers pass the bookings and blocks of the day before, the day itself and the day after.
- **Heat rule for blocks** (confirmed 2026-11-11): a free start time or booking is hot only if the last booking or block that ends before it is a booking ending exactly one changeover earlier. If a block ends in between, it is a cold start. For a free start time the current changeover counts; for two existing bookings, the changeover recorded on the later-made one.

### Seeded defaults

The first migration after the baseline seeds one `setting` row and one `season` row. **Operating hours 10:00–22:00 and the season 9 January – 30 April 2027 are placeholders** until the admins confirm them (PRD OQ2). Changeover 15 min, pre-heat window 30–40 min and booking horizon 14 days are the PRD defaults. The seed `INSERT`s are written by hand below the generated DDL of `0001_core_tables.sql`; keep them if that migration is ever regenerated.

### Test data

```bash
npm run db:fixtures              # first day of the seeded season
npm run db:fixtures -- 2027-01-12
```

This inserts three bookings and a cleaning block into the dev database, using the current changeover. It refuses to run with `NODE_ENV=production`, for a date outside every season, and for a day that already has bookings or blocks. Start the app once first, so the database exists.

## Calendar day view

- `/` shows today, or the first selectable day when today is not selectable (with the note "Die Saison beginnt am … Hier sind die ersten Tage." when today is in no season), or the season notice before and after the season. `/day/{yyyy-mm-dd}` shows a selectable day; any other date (past, beyond the horizon, outside a season, impossible, malformed) redirects with 302 to the nearest selectable day, or to `/` when there is none. Never an error page.
- `src/lib/domain/calendar.ts` derives the season state (`calendarState`) and the redirect target (`nearestSelectableDay`). `src/lib/server/day-view.ts` builds the view model (`buildDayView`, pure) and loads it (`loadDayView`, with the guest queries in `src/lib/server/db/queries/calendar.ts` and the clock). The page data holds only that view model: pre-formatted times and strings, durations, heat state and taken start/end. No row ids, `created_at`, names or block reasons; the guest queries never select a block's `reason`.
- Taken rows: one per live booking or block that overlaps the day's operating hours, clipped to them. Bookings and blocks look the same.
- Free rows are not links yet; Story 1.7 adds the booking form. Cold starts get their arrival time in Story 1.6.

### The one clock and `DEV_NOW`

`src/lib/server/clock.ts` is the only code that reads the current time. In development you can set `DEV_NOW` to a UTC ISO instant to try the season states, for example:

```bash
npm run db:fixtures -- 2027-01-12
DEV_NOW=2027-01-12T09:00:00Z npm run dev   # inside the season, 10:00 on 12 January
DEV_NOW=2026-12-20T09:00:00Z npm run dev   # before booking opens
DEV_NOW=2026-12-28T09:00:00Z npm run dev   # booking open, season not begun
DEV_NOW=2027-05-01T09:00:00Z npm run dev   # after the season
```

`DEV_NOW` is fixed (time does not move) and is refused when `NODE_ENV=production`.

### Client time guard

`src/lib/time` uses Temporal, which iOS Safari lacks, so it must never reach the browser: the view model carries every date and time pre-formatted. `scripts/client-time-guard.ts` is a Vite plugin that fails the client build if any client chunk includes a module from `src/lib/time` or the string `Europe/Zurich`. It does not search for the word `Temporal`, because SvelteKit's devalue names `Temporal.Instant` and friends in its own client code. Tested by `scripts/client-time-guard.test.ts`, and once by hand: importing `#lib/time` into `DayView.svelte` fails `npm run build`.

### Drafted copy for operator review (Story 1.4)

| Key | DE | EN |
| --- | --- | --- |
| `calendar_title` (`<title>` of the season notice) | Kalender | Calendar |
| `day_today` (date eyebrow) | Heute | Today |
| `row_sr_hot` (screen reader, row start) | {time}, schon heiss. | {time}, already hot. |
| `row_sr_cold` (screen reader, row start) | {time}, Kaltstart. | {time}, cold start. |
| `row_sr_taken` (screen reader) | {start} bis {end}, belegt | {start} to {end}, taken |
| `duration_only` / `duration_up_to` | Nur {minutes} Min. / Bis {minutes} Min. | {minutes} min only / Up to {minutes} min |
| `season_before_heading` / `season_after_heading` (season notice `h1`: the first sentence of the EXPERIENCE.md copy) | Die Saison beginnt am {date}. / Die Saison ist vorbei. | Season opens {date}. / The season is over. |

The EN day title follows the DE pattern: "Tue, 12 January". "Nur" is used for exactly one duration, "Bis" for fewer than five, and nothing for all five. Screen readers hear the limit and the notice as sentences: "18:15, schon heiss. Bis 90 Min. Ofen läuft. Komm um 18:15." (the visible notice joins them with " · ").

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
