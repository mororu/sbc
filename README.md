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
| `npm test` | Vitest, once (env parsing, db and queries, time and core, schemas, commands, day and book views, content pages, routes, layer rules, build guard) |
| `npm run check` | Generates Paraglide types, then svelte-check |
| `npm run lint` | ESLint, including the layer boundary rules |
| `npm run i18n:types` | Compiles `messages/` into `src/lib/paraglide` (also run by `check` and `lint`) |
| `npm run db:generate` | Generates a SQL migration from `src/lib/server/db/schema.ts` |
| `npm run set-admin-password` | Sets the shared admin password from stdin (`-- --reset` replaces it and signs out every admin) |

## Layers

`eslint.config.js` enforces the layer table of the architecture (AD-1, AD-2):

- `src/lib/domain` (pure core) imports only `src/lib/time`.
- `src/lib/time` and `src/lib/schemas` import nothing from the app.
- The pure layers never read the clock (`Date.now`, `Date()`, `performance.now`, `Temporal.Now`) or env, use only static imports, and do no I/O.
- The db layer (everything directly in `src/lib/server/db` except `queries/`, plus `better-sqlite3` and `drizzle-orm`) is importable only by `src/lib/server/commands` and `src/lib/server/db/queries`. The one exception: `src/hooks.server.ts` imports `db/migrate.ts` to migrate at boot.
- `process.env`, `import.meta.env` and `$env/*` are read only in `src/lib/server/env.ts`.

Server view models and the core files they lean on:

- `src/lib/server/day-view.ts`: the day's view-model types, `buildDayView`, `buildSeasonView` and `loadDayView`.
- `src/lib/server/book-view.ts`: the booking form view model and its loader.
- `src/lib/server/booked-view.ts`: the confirmation view model and its loader.
- `src/lib/server/guest-urls.ts`: guest links, the URL time `hhmm` and the refusal query `?error=…&time=…`.
- `src/lib/server/notice-text.ts`: the heat notice sentences and the duration-limit and sentence helpers of the day rows.
- `src/lib/server/db/queries/calendar.ts`: `getDayData`, the one read of a day's settings, seasons, bookings and blocks, over `dayItemsWindow` from `src/lib/domain/start-times.ts`.
- `src/lib/domain/keybox.ts`: the 24 h keybox cutoff (AD-9), the keybox row's due time and the held-row check, used by the confirmation and the keybox outbox row.

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

This inserts three bookings and a cleaning block into the dev database, using the current changeover. The bookings get party size 2, locale `de`, placeholder contact data ("Testgast 1", `testgast1@example.ch`, `+41790000001`, …; the mobile is zero-padded, so it stays valid) and a random public id and submit token like the app makes. It refuses to run with `NODE_ENV=production`, for a date outside every season, and for a day that already has bookings or blocks. Start the app once first, so the database exists.

## Calendar day view

- `/` shows today, or the first selectable day when today is not selectable (with the note "Die Saison beginnt am … Hier sind die ersten Tage." when today is in no season), or the season notice before and after the season. `/day/{yyyy-mm-dd}` shows a selectable day; any other date (past, beyond the horizon, outside a season, impossible, malformed) redirects with 302 to the nearest selectable day, or to `/` when there is none. Never an error page.
- `src/lib/domain/calendar.ts` derives the season state (`calendarState`) and the redirect target (`nearestSelectableDay`). `src/lib/server/day-view.ts` builds the view model (`buildDayView`, pure) and loads it (`loadDayView`, with the guest queries in `src/lib/server/db/queries/calendar.ts` and the clock). The page data holds only that view model: pre-formatted times and strings, durations, heat state and taken start/end. No row ids, `created_at`, names or block reasons; the guest queries never select a block's `reason`.
- Taken rows: one per live booking or block that overlaps the day's operating hours, clipped to them. Bookings and blocks look the same.
- Each free row is one link to its booking form, `/book/{date}/{hhmm}`, with a chevron; its accessible name ends in "Buchen." Taken rows are not interactive.

### Arrival time and the notice (Story 1.6, AD-24)

- `src/lib/domain/notice.ts` holds the one canonical notice value: `{ heat: 'hot' | 'cold', earliest, latest }`. Hot: both are null. Cold: `earliest` is start − pre-heat max, moved later to the latest point at which the wagon is free again: a booking's end plus **the changeover recorded on that booking**, or a block's end. Only bookings and blocks that end at or before the start count. `latest` is start − pre-heat min, or null when `earliest` is at or after it (the window collapsed; equal counts too, so a block ending 17:30 before an 18:00 cold start gives one arrival time, 17:30). A block ending exactly at the start gives "Nur 0 Minuten zum Einheizen: komm um 18:00 …", as the PRD has it. The arrival may fall before operating hours.
- The shared types and heat state (`Booking`, `Block`, `Settings`, `freeHeat`, `bookingHeat`) live in `src/lib/domain/heat.ts`, so the imports go one way: `heat` ← `notice` ← `start-times` (which re-exports them). `freeNotice` (free start times, with the current changeover deciding hot or cold) and `bookingNotice` (existing bookings, using `bookingHeat`) share `arrivalFor`. Every `OfferedStartTime` carries its `notice`, so the calendar and the book command use the same value.
- `serializeNotice` writes exactly `{"heat":…,"earliest":…,"latest":…}` in that key order, e.g. `{"heat":"cold","earliest":"2027-01-12T16:45:00Z","latest":null}`. `parseNotice` validates it (throws on anything else) and round-trips it. `noticeEquals` is the only notice comparison in the codebase.
- "Already past" and the minutes to heat are never part of a notice. The day view derives them at render time from the notice, the start and `now`:
  - past (`now` after `latest`, or after `earliest` when collapsed): "Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss.";
  - collapsed: "Nur {n} Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf.", n being the whole minutes from `earliest` to the start;
  - otherwise: "Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein."
- Neither a collapsed nor a past arrival is an error: the row keeps the normal cold-start styling and stays bookable. A duration limit is joined in front ("Nur 60 Min. · Niemand vor dir: …"). Screen readers hear time, state and notice: "18:00, Kaltstart. Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein."
- The pre-heat window comes from the `setting` row (`preheat_min_min`, `preheat_max_min`, seeded 30–40).
- The singular of `cold_notice_short` ("Nur 1 Minute zum Einheizen …" / "Only 1 minute to heat …") is drafted for operator review; the plural and the other two notices are the EXPERIENCE.md copy.

### Browsing days (Story 1.5)

- Layout, top to bottom: season note → heading row (`h1` left, "Vorheriger Tag" / "Nächster Tag" arrows right, wrapping below the heading when narrow) → strip row ("Heute" link, then the date strip) → a polite status region → the empty line → the start-time list (`#times`).
- The date strip (`DateStrip.svelte`) shows every day from today to the end of the horizon: 44 px cells over a `line-strong` baseline, the selected day in weight 600 with a 2 px `primary` underline. Selectable days are links to `/day/{date}`; days outside a season are muted, struck through, not links, and named "Mittwoch, 13. Januar, nicht buchbar" for screen readers. The arrows go to the neighbouring selectable day and skip such gaps; at the ends they are disabled buttons. "Heute" links to `/` and is hidden when the view already shows the home day (today, or the first selectable day).
- Everything is a plain link, so the strip, arrows and "Heute" work without JavaScript, and Back works. With JavaScript, SvelteKit's client navigation selects the target cell at once, dims the list with `aria-busy="true"`, shows "Lädt …" in the status after 1 s, and announces the day's status line on arrival ("Mittwoch, 13. Januar: 4 freie Zeiten") when the pathname changed. Nothing is announced on page load, on hash links or when the same day is opened again. The status line keeps its height, so nothing shifts; on a day with an empty line the arrival status is announced but not shown, so the sentence does not appear twice. Day links keep the scroll position and focus (`data-sveltekit-reset="false"`, which replaces `noscroll`/`keepfocus` in SvelteKit 3); if the focused control is gone after a switch, focus moves to the `h1`.
- The client decisions (which strip day to select while loading, whether to announce, the skip link target) live in `src/lib/day-nav.ts`, plain TypeScript with unit tests.
- No free start time left: today shows "Für heute sind alle Zeiten vorbei. Morgen geht's weiter." when not even an empty day would offer a time now; otherwise "An diesem Tag ist alles belegt. Schau dir einen anderen Tag an." Taken rows stay below the line.
- Only the strip scrolls horizontally. It scrolls itself (never the page) to keep the selected day in view; smooth, or a jump on first render and under reduced motion.
- The skip link "Zu den Zeiten" targets `#times` on day views (past the strip), `#main` elsewhere.
- The view model's links are root-relative (`/day/{date}`, `/`), typed as `ResolvedPathname`. `resolve()` is not used on the server because it returns request-relative paths during SSR (`../../day/…` for a `__data.json` load). This relies on the app having no base path.

### Drafted copy for operator review (Story 1.5)

| Key | DE | EN |
| --- | --- | --- |
| `today_link` ("Heute" link, left of the date strip, hidden on the home day) | Heute | Today |
| `strip_name` (accessible name of the strip `nav`) | Tag wählen | Choose a day |
| `day_prev` / `day_next` (arrow names) | Vorheriger Tag / Nächster Tag | Previous day / Next day |
| `day_loading` (status after 1 s) | Lädt … | Loading… |
| `day_status` (status after a day switch, singular / plural) | {date}: 1 freie Zeit / {date}: {count} freie Zeiten | {date}: 1 free time / {date}: {count} free times |
| `strip_day_unavailable` (hidden name of a struck-through strip day) | {date}, nicht buchbar | {date}, not bookable |

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

## Booking (Story 1.7)

### Flow

1. A free row links to `/book/{yyyy-mm-dd}/{hhmm}`. The form (`src/lib/server/book-view.ts`, `BookForm.svelte`) shows the booking summary (back link, start time, state badge, the row's notice), duration (60–180, each option named "90 Minuten, bis 19:30"; unavailable ones are disabled radios with one note why), party size (1–6, preselected 2), name, email and mobile with their purpose lines, the privacy link, and "18:00 buchen" last. Duration preselection: `?d=` when offered, else 60 when offered, else the shortest offered (the only one on a time only of the third kind).
2. A stale form (the time is taken or has begun when the form loads) redirects straight to the day with the matching message. A URL that names no real time (bad `hhmm`, a time skipped by the spring clock change) goes to the day, a bad date to `/`; the action does the same for a post to such a URL.
3. The form posts to its own `default` action. `src/lib/schemas/booking.ts` (Valibot) validates it, the same schema the client runs. Invalid fields → `fail(400, { errors, values })`: error keys plus the typed values, a summary at the top ("2 Angaben fehlen oder stimmen nicht."), focus on the first invalid field (`autofocus` without JavaScript).
4. `createBooking` (`src/lib/server/commands/create-booking.ts`) runs in one `BEGIN IMMEDIATE` transaction on the raw connection (`db.$client.transaction(…).immediate()`). Inside it, it looks up the submit token first (a resubmit returns the existing public id), then refuses `past` when the start has begun, reads settings, seasons, bookings and blocks fresh, and accepts only a start and duration that `offeredStartTimes` offers (`conflict` otherwise). It records the current changeover, `created_at`, `season_id`, party size, the locale at submit, the normalised contact data, a fresh public id and the submit token. Malformed input → `invalid`. It never throws for these outcomes. A token whose booking an admin has since deleted gets `conflict`, never the deleted booking's id. A lock-wait timeout (`SQLITE_BUSY` after the busy timeout) is the one error the action catches: it answers `fail(503)` so the form shows "Das hat nicht geklappt …" with the input kept; any other error stays a 500.
5. Success → 303 to `/booked/{publicId}?new=1` (plus `&changed=1` when the notice changed, Story 1.8): the confirmation. An unknown or malformed id is a 404 in the guest layout (`src/routes/(guest)/+error.svelte`), revealing nothing.
6. `conflict` and `past` → 303 to `/day/{date}?error=conflict|past&time=hhmm`. The day rebuilds fresh with the message first in `main` (`role="alert"`, focused on load via `autofocus`, which SvelteKit also honours after a client navigation) and `<title>` prefixed "Fehler: ". This is the same with and without JavaScript; with `use:enhance` the redirect is followed the same way. If the day is no longer selectable, its redirect to the nearest day carries `error` and `time` along. With JavaScript, once the message is shown, `error` and `time` are dropped from the address (shallow replace), so a reload, bookmark or language switch does not show it again.

### Ids, guest data and privacy

- Public ids and submit tokens are `crypto.randomBytes(16)` as base64url (22 characters, `src/lib/server/ids.ts`), unique in the database. The schema and the command share one pattern for them (`RANDOM_ID`). Every form load makes a fresh token. Row ids never reach a guest page.
- Name, email and mobile never go into a URL, cookie, redirect or log. The only query parameters in the flow are `d`, `p`, `error`, `time`, `new` and `changed`. The form and the confirmation are sent with `cache-control: private, no-store`; the confirmation and the error page carry `noindex`.
- With JavaScript, name, email and mobile (only those) are kept in `sessionStorage` under `sauna-booking.contact`, written on input and on submit and read to prefill empty fields, so a conflict or a language switch does not re-ask. They are removed once a booking succeeds. The only other entry is the pending submit token (both described under Story 1.10).

### Validation (AD-16)

- Name: trimmed, 1–100 characters, no control characters (U+0000–U+001F, U+007F). Email: trimmed, checked as an email, at most 254 characters. The inputs carry matching `maxlength` (100, 254, and 32 for the mobile). Mobile: at most 32 characters as typed; separators (spaces, hyphens, dots, slashes) are dropped, then `079 123 45 67`, `+41 79 …`, `0041 79 …` and `+41 079 …` become `+41791234567`; another `+`/`00` international number is accepted as 8–15 digits and stored as `+…`. Duration, party size and the token outside their allowed values are `form_invalid` (crafted input).
- Errors are message keys (`field_required`, `name_too_long`, `email_invalid`, `mobile_invalid`, `form_invalid`). The server result is authoritative.
- On the client, a field with content is checked on blur; an error clears as soon as the field is right again. Field errors are not announced live; they are tied to the input with `aria-describedby` and `aria-invalid`. Pressing the button skips the blur check, so an error line appearing under the last field cannot move the button away and swallow the tap; the submit checks everything anyway.

### Submitting with JavaScript

- One tap submits. While sending, the button reads "Wird gebucht …" with `aria-disabled="true"` and keeps focus, further taps are ignored, and a polite status says the same. After 15 s it says "Das dauert gerade länger. Bitte warte noch, wir buchen nicht doppelt."
- A repeated failure shows its message again, refocused and announced anew.
- A network or server failure shows "Das hat nicht geklappt, die Buchung ist nicht gespeichert. Versuch es bitte nochmal." at the top of the form, focused, with "Fehler: " in the title. The submit token stays, so a retry after a lost response returns the booking that did go through instead of booking twice.
- Changing duration or party size mirrors them into `?d=&p=` with a shallow `goto(…, { shallow: true, replace: true })` (SvelteKit 3's replacement for the deprecated `replaceState`). In SvelteKit 3 a shallow update leaves `page.url` alone and sets `page.shallow.url`, so the language switch reads `page.shallow?.url ?? page.url` and keeps them.

### Schema

Migration `0002_booking_contact.sql` adds `party_size` (1–6), `locale` (`de`/`en`), nullable `name`, `email` and `mobile`, and unique `public_id` and `submit_token` to `booking`. drizzle-kit rebuilds the table; the copy statement was edited by hand so rows from before the migration (development data only) get party size 1, locale `de`, no contact data and random 128-bit hex ids. Keep that edit if the migration is ever regenerated.

### Drafted copy for operator review (Story 1.7)

| Key | DE | EN |
| --- | --- | --- |
| `row_sr_book` (end of a free row's accessible name) | Buchen. | Book. |
| `title_error` (`<title>` prefix) | Fehler: {title} | Error: {title} |
| `book_title` (EN of "18:00 buchen": title and button) | – | Book {time} |
| `book_back_name` (back link name) | Zurück zu {date} | Back to {date} |
| `duration_end_note` (EN of "Minuten · bis 19:30") | – | minutes · until {time} |
| `duration_option` (EN of "90 Minuten, bis 19:30") | – | {minutes} minutes, until {time} |
| `duration_unavailable_booking` (EN of the UX note) | – | {range} min not possible: next booking at {time}. |
| `duration_unavailable_block` (a block, never named) | {range} Min. nicht möglich: ab {time} belegt. | {range} min not possible: taken from {time}. |
| `duration_unavailable_hours` | {range} Min. nicht möglich: Betrieb bis {time}. | {range} min not possible: open until {time}. |
| `duration_unavailable` (fallback when no specific reason is found) | {range} Min. nicht möglich. | {range} min not possible. |
| `duration_only_possible` (time only of the third kind) | Nur {durations} Min. möglich: nächste Buchung um {time}. | {durations} min only: next booking at {time}. |
| `field_required` (empty name or email; the UX settings string) | Bitte ausfüllen. | Please fill this in. |
| `name_too_long` | Bitte höchstens 100 Zeichen. | Please use at most 100 characters. |
| `name_invalid` (a control character such as a tab in the name) | Im Namen steckt ein unsichtbares Zeichen, z. B. ein Tabulator. Bitte entfern es. | There's an invisible character in the name, such as a tab. Please remove it. |
| `error_summary` singular | 1 Angabe fehlt oder stimmt nicht. | 1 detail is missing or wrong. |
| `submit_busy` (EN of "Wird gebucht …") | – | Booking … |
| `booked_title` (`<title>`) | Gebucht | Booked |
| `booked_people` (confirmation details) | 1 Person, {count} Personen | 1 person, {count} people |
| `not_found_title` / `not_found_heading` (guest 404) | Nicht gefunden / Diese Seite gibt es nicht. | Not found / This page doesn't exist. |
| `error_page_title` / `error_page_heading` (other errors) | Fehler / Das hat nicht geklappt. | Error / That didn't work. |
| `error_page_home` (link on the error page) | Zum Kalender | To the calendar |

The empty mobile field gets the UX mobile message ("Bitte gib eine Handynummer an …"), which reads as a request. A crafted or stale field (`form_invalid`) and a command `invalid` show the UX network-failure message, since nothing was booked.

## Confirmation with the notice at booking (Story 1.8)

### The notice at booking

- The booking form carries the notice it displays as a hidden `notice` field: the canonical JSON from `serializeNotice` (`BookView.noticeToken`). The schema only checks that the field is there and at most 200 characters; the action parses it with `parseNotice`. A missing or malformed token is `form_invalid` (400, input kept, nothing booked). The form shows it as the form-level "Das hat nicht geklappt …" message, never at the hidden field.
- `createBooking` takes it as `displayedNotice`. Inside its `BEGIN IMMEDIATE` transaction the booking's notice is the `notice` of the matching `offeredStartTimes` entry. It is stored as `serializeNotice(…)` in both `booking.notice_at_booking` and `booking.last_told_notice`, and the result says `changed: !noticeEquals(stored, displayed)`. A token that differs still books. A resubmit returns the existing booking and compares its stored notice at booking with the resubmitted token, so a retry gets the same answer (`false` when no notice is stored).
- `notice_at_booking` is never updated after insert. The trigger `booking_notice_at_booking_immutable` (migration 0003) aborts any update of a value that is set; a row without one (development data from before 0003) may still get one. `last_told_notice` will move with the heat-change emails (Epic 2).
- The action redirects with `?new=1`, plus `&changed=1` when the notice changed. These one-time flags are not guest data. With JavaScript the page drops them from the address after the first render (shallow replace, `withoutBookedFlags` in `src/lib/day-nav.ts`), so a reload counts as a revisit. Without JavaScript they stay, and a reload still shows the "just booked" page.

### The page

- `src/lib/server/booked-view.ts` builds the view model from `getConfirmation`, which selects only start, duration, party size, `created_at`, the notice at booking and the admin contact. The page data holds only pre-formatted strings derived from the date, start, duration, party size, notice at booking, keybox time and admin contact: no name, email, mobile, row id or `created_at` (checked in `server.test.ts`).
- Layout (DESIGN.md `confirmation`): eyebrow date, "Gebucht!", the large state badge with the notice sentence, the "changed" or "revisit" line, then below a hairline the keybox sentence and a details list (Wann, Personen, Absagen), then "Weitere Zeit buchen" and "So funktioniert's". The large badge uses button type and is not uppercased, since it carries a whole sentence.
- Badge: hot "Schon heiss um 18:15.", cold "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein." A collapsed window or an arrival already past uses the row texts behind "Kaltstart: ", starting lower-case ("Kaltstart: nur 15 Minuten …"). "Past" is judged at the booking's `created_at`, because the badge shows the state at booking. Neither is styled as an error.
- "Das hat sich gerade geändert." shows only with `new=1&changed=1`. "So stand es bei der Buchung. Änderungen schicken wir dir per Mail." shows on every visit without `new=1`.
- Keybox sentence: the email goes out at start − 24 h of real time (AD-9), so 10:00 on Sunday 28 March 2027 gives "am Sa 27. März um 09:00". Booked at or after that time, or once it has passed, the line reads "Der Schlüsselcode ist schon unterwegs in dein Postfach."
- A booking row without a stored notice (development data from before migration 0003) shows no badge.

### Admin contact

Migration `0003_booking_notice.sql` adds `setting.admin_contact` and seeds it with **`platzhalter@sauna-luegisee.ch`, a placeholder that must be replaced by the admins' real address before launch (Story 5.5)**. Admins will edit it in Epic 3. The seed `UPDATE` (only when the value is NULL or blank, so it is idempotent) and the immutability trigger are written by hand below the generated DDL; keep both if the migration is ever regenerated. The `mailto:` link encodes the address (keeping the `@`). `npm run db:fixtures` now books the fixtures one minute apart and stores each one's notice as it stood when it was made (only the bookings before it count).

### Drafted copy for operator review (Story 1.8)

The badge texts, "Das hat sich gerade geändert.", the revisit line, the "schon unterwegs" keybox line, "Gebucht!" and "Weitere Zeit buchen" are EXPERIENCE.md copy (DE, and EN where it has one). These were drafted:

| Key | DE | EN |
| --- | --- | --- |
| `booked_badge_cold_other` (collapsed or past: the row text behind the prefix) | Kaltstart: {notice} | Cold start: {notice} |
| `booked_keybox` (keybox sentence) | Den Schlüsselcode bekommst du am {at}. | You'll get the keybox code on {at}. |
| `booked_keybox_at` (keybox time) | {date} um {time} ("Mo 11. Januar um 18:00") | {date} at {time} ("Mon 11 January at 18:00") |
| `booked_keybox_sent` (EN only) | – | The keybox code is already on its way to your inbox. |
| `booked_revisit` (EN only) | – | This is how it stood when you booked. We'll email you about any changes. |
| `booked_when` / `booked_people_term` / `booked_cancel_term` (details terms) | Wann / Personen / Absagen | When / People / To cancel |
| `booked_when_value` (the start is a `<time>`) | {date}, {start}–{end} ("Di 12. Januar, 18:00–19:30") | {date}, {start}–{end} ("Tue 12 January, 18:00–19:30") |
| `booked_cancel` (the cancel line; the address is a `mailto:` link) | Schreib an {address}. | Email {address}. |

## Content pages: So funktioniert's, Datenschutz, Impressum (Story 1.9)

### The pages

- `/info`, `/privacy` and `/imprint` render `ContentPage.svelte`: the unique `<title>` ("So funktioniert's · Sauna Luegisee", "Datenschutz · Sauna Luegisee", "Impressum · Sauna Luegisee"; EN "How it works", "Privacy", "Imprint"), one `h1` and per slot an `h2` with its text. No guest data and no third-party embeds.
- Text layout: the text is trimmed; a blank line starts a new paragraph (runs of blank lines count once); a single newline is a line break, so a postal address keeps its lines.
- `src/lib/content/pages.ts` is the one source of the page structure: `PAGES` lists each page's slots in order, `contentPage(id, locale)` builds them, and `placeholderSlots()` lists every slot key whose DE or EN heading or text still starts with `[PLATZHALTER]` or contains any bracketed gap such as `[Frist]` / `[period]` (for the launch readiness check, Story 5.5).

### Slots

Each slot has two messages in `messages/de.json` and `messages/en.json`: `{slot}_heading` and `{slot}_body`.

| Page | Slots, in order |
| --- | --- |
| `/info` | `info_location`, `info_heating` (hot vs cold start, lighting the fire), `info_keybox`, `info_cancelling` (by email to the admins), `info_contact` |
| `/privacy` | `privacy_operator`, `privacy_contact`, `privacy_purposes` (name, email, mobile), `privacy_retention`, `privacy_backups` (period from Story 5.3), `privacy_tracking` |
| `/imprint` | `imprint_operator`, `imprint_address`, `imprint_contact`, `imprint_responsible` |

### For the operators: filling a slot

- **Every text that starts with `[PLATZHALTER]` is a placeholder** and must be replaced before launch. Any other bracketed gap (`[Frist]`, `[period]`) is also still open.
- **The drafted facts after the marker must be checked before you remove it:** the cookies (only the language cookie for guests; the theme stays in the browser; the booking form's contact details stay in session storage until the booking succeeds), the retention (deletion 30 days after the season ends), the keybox timing (code by email 24 hours before the start), the backups (nightly, in Switzerland; the period comes from Story 5.3) and the field purposes. Keep only what is true.
- To fill a slot, edit its `_body` value (and, if needed, its `_heading`) in `messages/de.json` and `messages/en.json` and delete the marker. Nothing else changes: no code, no test. There is no CMS and no admin editing for these texts.
- **No English yet?** Set the English `_body` to `""`. English mode then shows the German text, marked `lang="de"` so screen readers pronounce it as German. German is never empty, and headings are never empty in either language.
- `npm test` fails if a slot lacks a DE or EN entry, if a German entry or an English heading is empty, if `PLATZHALTER` appears anywhere but as the exact `[PLATZHALTER] ` prefix, or if a heading or text is a placeholder in one language but not in the other. So remove the marker in both languages at once (or set the English body to `""`).

### Footer contact

- The footer shows the admin contact after Impressum: a `mailto:` link with the address as its visible text, 44 px high and muted like the other links. Screen readers hear "Kontakt: " / "Contact: " first (a visually hidden label inside the link).
- The guest layout load (`src/routes/(guest)/+layout.server.ts`) reads it with `getAdminContact`, which selects only `setting.admin_contact` of row 1. A missing or blank address shows no contact link. If the read fails, the error is logged and the footer shows no contact link, so every guest page still renders.
- `src/lib/mailto.ts` (`mailtoHref`) encodes the address for the href (keeping the `@`); the confirmation's cancel line uses the same helper.

### Drafted copy for operator review (Story 1.9)

The headings and the footer label are drafted copy. The bodies are placeholders: everything after `[PLATZHALTER]` is a draft to check (see above).

| Key | DE | EN |
| --- | --- | --- |
| `footer_contact_label` (hidden for screen readers before the footer address) | Kontakt: | Contact: |
| `info_location_heading` | Wo der Wagen steht | Where the wagon is |
| `info_location_body` | [PLATZHALTER] Wo der Saunawagen steht und wie du hinkommst. | [PLATZHALTER] Where the sauna wagon stands and how to get there. |
| `info_heating_heading` | Einheizen | Heating |
| `info_heating_body` | [PLATZHALTER] Schon heiss: Vor dir war jemand da, der Ofen läuft schon. Kaltstart: Niemand ist vor dir, du heizt selbst ein. Komm dann zur angegebenen Zeit, damit die Sauna zum Start warm ist. Wie du das Feuer anzündest, steht hier. | [PLATZHALTER] Already hot: someone was there before you and the stove is running. Cold start: nobody is before you, so you light the fire yourself. Come at the time shown, so the sauna is warm when your time starts. How to light the fire goes here. |
| `info_keybox_heading` | Schlüsselbox | Keybox |
| `info_keybox_body` | [PLATZHALTER] Den Code für die Schlüsselbox bekommst du 24 Stunden vor deinem Start per E-Mail. Wo die Box ist und wohin der Schlüssel danach kommt, steht hier. | [PLATZHALTER] You get the keybox code by email 24 hours before your start. Where the box is and where the key goes afterwards goes here. |
| `info_cancelling_heading` | Absagen | Cancelling |
| `info_cancelling_body` | [PLATZHALTER] Wenn du nicht kommen kannst, schreib uns eine E-Mail. Die Adresse steht unten auf jeder Seite. | [PLATZHALTER] If you can't come, send us an email. The address is at the bottom of every page. |
| `info_contact_heading` | Kontakt | Contact |
| `info_contact_body` | [PLATZHALTER] Wie du uns erreichst. | [PLATZHALTER] How to reach us. |
| `privacy_operator_heading` | Verantwortlich | Who is responsible |
| `privacy_operator_body` | [PLATZHALTER] Wer die Sauna betreibt und für deine Angaben verantwortlich ist. | [PLATZHALTER] Who runs the sauna and is responsible for your details. |
| `privacy_contact_heading` | Kontakt | Contact |
| `privacy_contact_body` | [PLATZHALTER] Wie du uns bei Fragen zu deinen Angaben erreichst. | [PLATZHALTER] How to reach us with questions about your details. |
| `privacy_purposes_heading` | Wofür wir deine Angaben brauchen | What we use your details for |
| `privacy_purposes_body` | [PLATZHALTER] Name: damit wir die Buchung an der Sauna zuordnen können. E-Mail: für die Bestätigung und den Schlüsselcode. Handy: nur falls wir dich kurzfristig anrufen müssen. | [PLATZHALTER] Name: so we can match the booking at the sauna. Email: for the confirmation and the keybox code. Mobile: only in case we need to call you at short notice. |
| `privacy_retention_heading` | Wie lange wir sie behalten | How long we keep them |
| `privacy_retention_body` | [PLATZHALTER] Wir löschen deine Angaben 30 Tage nach dem Ende der Saison. | [PLATZHALTER] We delete your details 30 days after the season ends. |
| `privacy_backups_heading` | Sicherungen | Backups |
| `privacy_backups_body` | [PLATZHALTER] Wir sichern die Daten jede Nacht in der Schweiz. Gelöschte Angaben können in diesen Sicherungen noch bis zu [Frist] bleiben, dann sind sie auch dort weg. | [PLATZHALTER] We back up the data every night in Switzerland. Deleted details can stay in these backups for up to [period], then they are gone there too. |
| `privacy_tracking_heading` | Kein Tracking | No tracking |
| `privacy_tracking_body` | [PLATZHALTER] Es gibt kein Tracking und keine Analyse-Dienste von Dritten. Die Seite setzt nur ein Cookie, für deine Sprache. Ob du das helle oder dunkle Design gewählt hast, bleibt in deinem Browser. | [PLATZHALTER] There is no tracking and no third-party analytics. The site sets only one cookie, for your language. Whether you chose the light or dark design stays in your browser. |
| `imprint_operator_heading` | Betreiber | Operator |
| `imprint_operator_body` | [PLATZHALTER] Name der Betreiber. | [PLATZHALTER] Name of the operators. |
| `imprint_address_heading` | Adresse | Address |
| `imprint_address_body` | [PLATZHALTER] Postadresse. | [PLATZHALTER] Postal address. |
| `imprint_contact_heading` | Kontakt | Contact |
| `imprint_contact_body` | [PLATZHALTER] E-Mail-Adresse. | [PLATZHALTER] Email address. |
| `imprint_responsible_heading` | Verantwortlich für den Inhalt | Responsible for the content |
| `imprint_responsible_body` | [PLATZHALTER] Name der verantwortlichen Person. | [PLATZHALTER] Name of the responsible person. |

## Epic 1 hardening (Story 1.10)

### Resume after a lost response

- The booking form stores the submit token it sends, with its path, in `sessionStorage` (`sauna-booking.pending`, one entry: the latest submit). If the guest reloads the form on the same path while the time is still free, the form sends the stored token instead of the server's fresh one, so a retry stays idempotent.
- If the booking did go through but the response was lost, a reload or a language switch of the form redirects to `/day/{date}?error=conflict&time={hhmm}` (the time is now taken), or with `error=past` once the start has passed. With JavaScript, the day page sees that the pending path is `/book/{date}/{hhmm}` and POSTs `{ submitToken }` as JSON to `/booked` (`src/routes/(guest)/booked/+server.ts`). A live booking answers `200 { href: "/booked/{id}?new=1" }` and the page replaces itself with the confirmation. An unknown or deleted booking answers a bare 404 (a malformed body a bare 400): the conflict message stays and the pending entry is dropped. A network error keeps it for the next reload. The message stays as rendered until the lookup answers.
- The token is a 128-bit capability equal to resubmitting the form, so the lookup exposes nothing new. It goes only in the POST body, never in a URL, cookie or log; the answer is `private, no-store`. `GET /booked` answers 405.
- Any redirect answering the form's own submit clears the pending entry: the server has answered that token, so nothing is lost (and a token whose booking an admin deleted is not sent again). After a booking (the form's redirect to `/booked/…`, or a resume) the contact details (`sauna-booking.contact`) are removed too, so a shared device does not prefill the next guest's form. A resume clears storage before it navigates, and falls back to a full page load if the client navigation fails.
- A resume that started before the guest navigated elsewhere (even away and back to the same day) does not move them: the entry stays for the next reload.
- **Known limits:** `sessionStorage` is per tab, so a new tab or window does not resume. When the reload lands on a day that is no longer selectable, the refusal query is dropped (A4) and there is no resume either. The confirmation email (Epic 2) covers both.
- The client storage helpers, like the server view models, use root-relative paths (`/book/…`, `/booked`): they assume the app has no base path.
- Every `sessionStorage` access is wrapped in try/catch: without storage the pages work as before, only without prefill and resume. Without JavaScript nothing changes. The helpers are in `src/lib/day-nav.ts` (unit-tested).

### Root 404 and favicon

- `src/routes/(guest)/[...path]/+page.server.ts` throws a 404 for any path no other route matches, so it renders `(guest)/+error.svelte` inside the guest shell (header, footer with the contact) in DE and EN instead of SvelteKit's bare English page. `/admin` gets the same 404 until Epic 3 adds its routes.
- `src/routes/+error.svelte` is the fallback for errors outside the guest layout (for example when the guest layout's own load fails): header, the same message and calendar link, `noindex`, no footer.
- `static/favicon.svg` (a flame in the Lärche palette, linked from `src/app.html`) and `static/favicon.ico` (32 px, the same drawing as a PNG inside an ICO) stop the `404 GET /favicon.ico` on every page load.

### Other fixes

- The confirmation reads the admin contact with `getAdminContact` (trimmed, row 1, blank as none), like the footer.
- A refusal (`?error=&time=`) on a day that is no longer selectable is dropped on the redirect to the nearest day: its time belongs to another day.
- The skip link reads "Zum Inhalt" / "Skip to content" where it targets `main`; day pages keep "Zu den Zeiten".

### Drafted copy for operator review (Story 1.10)

| Key | DE | EN |
| --- | --- | --- |
| `skip_to_content` (skip link on pages without start times) | Zum Inhalt | Skip to content |
| `privacy_tracking_body` (added sentence, still behind `[PLATZHALTER]`) | Das Buchungsformular behält Name, E-Mail und Handynummer im Sitzungsspeicher deines Browsers, bis die Buchung geklappt hat oder du den Tab schliesst. | The booking form keeps your name, email and mobile in your browser's session storage until the booking has gone through or you close the tab. |

## Keybox email (Story 2.2)

### Setting the keybox code and instructions in development

The admin settings UI comes in Story 3.8. Until then, set the keybox code and the access and return instructions (DE and EN) in the dev database by hand, for example with the `sqlite3` CLI:

```sh
sqlite3 data/dev.sqlite "UPDATE setting SET
  keybox_code = '4711',
  keybox_instructions_de = 'Die Box hängt links an der Tür.

Leg den Schlüssel danach wieder in die Box.',
  keybox_instructions_en = 'The box hangs to the left of the door.

Put the key back in the box afterwards.'
WHERE id = 1;"
```

- All three settings start NULL (migration `0005_keybox_settings.sql`). NULL or blank after trimming counts as unset.
- **Until the code and the instructions in a booking's language are set, its keybox row is held:** it stays `pending`, the worker skips it and logs `[worker] outbox <id> keybox held missing=<setting>` once (again only if the missing setting changes), and it expires at the start. Once set, the next tick (about a minute) sends it, even late.
- In the instructions, a blank line starts a new paragraph and a single newline is a line break.
- The code is frozen on the row at claim (`snapshot_keybox_code`): changing it later never resends an accepted email. The instructions are read at send time; if they are blanked between claim and send, the row goes back to `pending`, held.
- The keybox row waits for its booking's confirmation while that is still open or in flight, so the confirmation always goes out first.

### Drafted copy for operator review (Story 2.2)

| Key | DE | EN |
| --- | --- | --- |
| `mail_keybox_subject` | Schlüsselcode für {date}, {time} | Keybox code for {date}, {time} |
| `mail_keybox_code` (first line, the code's characters spaced) | Code: {code} | Code: {code} |
| `mail_keybox_counts` (label line above the notice) | Das gilt jetzt | This is what counts now |
| `mail_keybox_instructions_heading` | Schlüssel holen und zurückbringen | Getting the key and bringing it back |
| `booked_revisit_past` (confirmation page once the start has come, retro A9) | So stand es bei der Buchung. | This is how it stood when you booked. |

### Drafted copy for operator review (Story 2.3)

The DE good-news subject and body, the DE cold-start subjects and the DE "neue Ankunftszeit" subject are story copy. Everything else, and all EN lines, are drafts:

| Key | DE | EN |
| --- | --- | --- |
| `mail_heat_good_subject` | Gute Nachricht: {date}, {time} ist schon heiss | Good news: {date}, {time} is already hot |
| `mail_heat_good_body` | Vor dir ist jetzt jemand in der Sauna. Komm am {date} einfach um {time}, der Ofen läuft. | Someone is in the sauna before you now. Just come at {time} on {date}, the stove will be going. |
| `mail_heat_cold_subject` | Wichtig: Kaltstart {date}, {time}, komm zwischen {earliest} und {latest} | Important: cold start {date}, {time}, come between {earliest} and {latest} |
| `mail_heat_cold_short_subject` (collapsed range) | Wichtig: Kaltstart {date}, {time}, komm um {earliest} | Important: cold start {date}, {time}, come at {earliest} |
| `mail_heat_cold_past_subject` (arrival already past at the send) | Wichtig: Kaltstart {date}, {time} | Important: cold start {date}, {time} |
| `mail_heat_now_cold` (lead) | Vor dir ist jetzt niemand mehr in der Sauna. | Nobody is in the sauna before you any more. |
| `mail_heat_arrival_subject` | Wichtig: neue Ankunftszeit für {date}, {time} | Important: new arrival time for {date}, {time} |
| `mail_heat_longer_preheat` (lead, earlier latest arrival) | Wir heizen jetzt länger vor. | We now pre-heat for longer. |
| `mail_heat_later_earliest` (lead, later earliest arrival) | Vor dir ist die Sauna länger belegt. | The sauna is booked for longer before you. |
| `mail_heat_arrival` | Komm zwischen {earliest} und {latest} und heiz ein. | Come between {earliest} and {latest} and light the fire. |

A collapsed range, or an arrival already past at the send, reuses the day-view cold notice text after the lead.

## Refused and stuck sends (Story 2.4)

- `sendProblems(entry, now)` in `src/lib/domain/call-list.ts` derives, per booking, the rows that make it **call required** (`keybox_refused`, `keybox_expired`, `keybox_overdue`, `warning_refused`, `warning_expired`, and `warning_overdue` since Story 2.5) and the other unresolved refusals, each ordered by row id. `callList(feed, now)` turns the whole feed into the bookings with a problem, ordered by start, then booking id. `getSendProblemRows(now)` builds the feed; it reads no contact data and no keybox code.
- **Bookings drop off the call list once they start** (AD-21): the feed holds only live bookings that have not started. Rows expire only at the start, so `keybox_expired` and `warning_expired` do not come out of the feed today; they stay in the core as a safety net.
- A keybox row that has not gone out is overdue 15 minutes (`KEYBOX_OVERDUE_MIN`) after its original due time, `keyboxDueAt(start, createdAt)`, not after `outbox.due_at`, which every retry moves forward. **The overdue time is clamped to at most 5 minutes before the start (`KEYBOX_OVERDUE_BEFORE_START_MIN`), and never before the due time.** This clamp is what keeps a booking made shortly before its start on the call list before it drops off.
- A held keybox row (a setting missing, still `pending`) is overdue like any other: the admin must call the guest.
- "Latest" means highest row id. A heat row written before Story 2.5 that expired unclaimed has no urgent flag and counts as not urgent.
- Migration `0007_outbox_resolved.sql` adds `outbox.resolved_at`. Only mark called (Story 3.6) writes it; a resolved row never raises an entry again. Nothing displays the call list yet (Epic 3).

## Epic 2 hardening (Story 2.5)

- **Worker health.** `worker_heartbeat.beat_at` is the last tick whose drain did not throw: an old one means the worker stopped or cannot reach its database. It does not say mail goes out, because a transient SMTP failure is a recorded outcome, not an error. So migration `0008_heartbeat_failing_since.sql` adds `failing_since`:
  - Each send outcome writes it in the same transaction: a `transient_failure` sets it (if unset) to the outcome time, an `accepted` send clears it, a `refused` one leaves it alone. Without a heartbeat row nothing is written (no row already reads `stale`).
  - The drain's last claim clears it once no row is left in `transient_failure`, so retries that end expired, cancelled, superseded, refused or held do not leave it stuck.
  - **It is a coarse, installation-wide signal:** one recipient's deferrals (e.g. a greylisting server) can set it, and any one accepted send clears it.
  - `workerHealth(getHeartbeat(), now)` in `src/lib/domain/worker-health.ts` returns `stale` (no row, or `beat_at` at least 5 minutes old, `HEARTBEAT_STALE_MIN`), `failing` (`failing_since` at least 15 minutes old, `SEND_FAILING_MIN`) or `ok`; `stale` wins. The admin home shows it in Epic 3.
- **Held keybox row.** The keybox claim cancels the booking's open heat-change rows. If the row is then held (a setting was unset before the send), `releaseHeldKeybox` enqueues heat changes again in its own transaction, so a pending warning is not lost while the keybox email waits. The worker logs `[worker] outbox <id> keybox held heat_change=<action>`.
- **Retrying keybox row.** A keybox row in `transient_failure` also ends heat-change mail (`endsHeatChangeMail`): every retry re-freezes the current notice. Only a `pending` keybox row lets heat changes through. A retrying keybox row whose setting is unset is held by the claim: back to `pending`, and heat changes are enqueued again the same way.
- **Call list.** A heat-change row carries `snapshot_urgent` from its upsert on (the claim re-freezes it). `sendProblems` reads the latest heat-change row of any urgency:
  - urgent and `refused`/`expired` gives `warning_refused`/`warning_expired`;
  - urgent and still not sent (`pending`, `in_flight`, `transient_failure`) from `start − (pre-heat maximum + 20 min)` (`WARNING_OVERDUE_MARGIN_MIN`; 60 minutes with the default 30–40 window) gives `warning_overdue`. The feed carries the pre-heat maximum setting.
  - An urgent change enqueued inside that window is call required at once, before its settle delay ends: a late urgent change should be phoned. An `in_flight` urgent row past the window counts as overdue until its send outcome is recorded.
  - A newer non-urgent row (good news, or a change cancelled at recheck or by the keybox claim) supersedes an older urgent one: no call from the warning, and an older refused row is listed under refusals only. The keybox rules still apply, e.g. a refused keybox row still raises `keybox_refused`.

## Admin sign-in (Story 3.1)

### The admin password

The shared password is set with a CLI that reads it from stdin. Only its argon2id hash goes into `setting.admin_password_hash`:

```bash
npm run set-admin-password                 # asks twice, with no echo
printf '%s\n' "$PW" | npm run set-admin-password   # or piped (one trailing newline is dropped)
npm run set-admin-password -- --reset      # replace it: also deletes every admin session
```

- It needs at least 12 characters. It refuses to replace an existing hash without `--reset`, and then stores nothing (exit 1).
- The password is never an argument or env value. It is never echoed, logged or printed. The command takes only `--reset`.
- It reads the app env through `src/lib/server/env.ts`, so it needs what the app needs: in development `DATABASE_PATH` and `GUEST_KEY_SECRET` (from `.env`), in the production container the full production env, which `docker compose exec app npm run set-admin-password` already has (Epic 5). It applies the migrations first, so it also works before the first start.
- It refuses a password with a line break or any other control character (one trailing line break of piped input is dropped first). On the terminal prompt, arrow keys and other escape sequences are ignored. A failure prints one short line, never a stack trace: "The database is busy. …" on a lock timeout, else "The password could not be stored.".
- The password is normalised to Unicode NFC before hashing and verifying, so a decomposed "ü" from a terminal matches the browser's.
- It prints "Admin password set." for a first password and "Admin password replaced. Signed out sessions: N." when `--reset` replaced one.
- Until a password is set, every sign-in fails with the wrong-password message, and the app logs `[admin] sign-in refused: no admin password is set. Run \`npm run set-admin-password\`.`

### Sessions and the guard (AD-10, AD-11)

- Migration `0009_admin_session.sql` adds `setting.admin_password_hash`, `booking.reply_done_at` (for Story 3.4; a plain `ALTER TABLE ADD` without a CHECK, so `booking` is not rebuilt) and `admin_session(id, created_at, expires_at)` with instant GLOB checks.
- The sign-in command (`src/lib/server/commands/admin-session.ts`) checks the password with argon2 outside the transaction. Inside the transaction it reads the hash again, so a password reset during the check wins, and inserts a session. The session id is `randomId()` (128 bits). It is stored as is and expires 30 days after its last use.
- The cookie is `admin_session`: `Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`. It is the only cookie besides the language cookie. Safari may refuse a `Secure` cookie on plain `http://localhost`; use Chrome or Firefox in development.
- `src/hooks.server.ts` runs the guard first (`sequence(guard, paraglide)`). Every `/admin` path except `/admin/login` needs a valid session. The guard decodes the path the way the router does, so `/%61dmin` is guarded too, and it also checks the route id.
  - Without a cookie, the request gets a 303 to `/admin/login?to=<path and query>`. No route code runs.
  - With an unknown or expired session, the cookie is deleted and the redirect adds `expired=1` ("Bitte melde dich wieder an.").
  - A valid session is extended (row and cookie) and set as `locals.adminSession`. Every `/admin` response gets `cache-control: private, no-store`.
- `safeReturnTarget` (`src/lib/server/admin-auth.ts`) accepts only a same-origin path under `/admin` (normalised, so `/admin/../x` is refused). It refuses the sign-in and sign-out paths, backslashes and control characters. Anything else goes to `/admin`.
- Sign-out is `POST /admin/logout`, a form styled as the last nav tab: a GET link could be preloaded. It deletes the row, clears the cookie and redirects to sign-in. With no or an ended session the guard just clears the cookie and redirects to plain `/admin/login` (no "Bitte melde dich wieder an."); a lock timeout on the delete still signs the browser out.
- A lock timeout during the guard's session check answers 503 with "Das hat nicht geklappt. Nichts wurde geändert. …" (never cached) instead of a 500. Each sign-in also deletes ended session rows.

### Rate limit (FR-15)

`src/lib/domain/sign-in-limit.ts` is the pure gate. The `Map` of records per client address lives in the sign-in command, in memory, so a restart resets it. From the 5th failure on, the next try is allowed only 60 s after the last failure. It is refused as `rate_limited` with `retryAt` and is not checked. A correct password deletes the record. Records are dropped 15 minutes after their last failure. A try is counted before the slow verify, so parallel tries cannot slip past the gate; if the session insert then throws, the record is put back. The map holds at most 10,000 records: past that, expired ones are pruned, then the oldest evicted (a full prune also runs at most once a minute). **Behind Caddy the client address is the proxy's unless adapter-node's `ADDRESS_HEADER`/`XFF_DEPTH` are set (Epic 5): without them every client shares one record, and wrong tries slow everyone's sign-in to one a minute.** The sign-in page then shows "Zu viele Versuche. …" and disables the button until `retryAt`, using a timer; without JavaScript, a reload brings the button back.

### Admin shell and home

- `src/routes/admin/(portal)/+layout.svelte` holds the app header, the nav (Übersicht · Buchungen · Blocks · Einstellungen · Auswertung · Abmelden) and `main`, capped at `--admin-max`. Nav hrefs live in `src/lib/admin-nav.ts`. Buchungen opens the admin day view (Story 3.2); the targets behind Blocks, Einstellungen and Auswertung come with later stories and are 404s until then.
- The Übersicht tab carries two badges: a phone icon with the call-list count and a mail icon with the reply-reminder count. Each shows "0" when empty and has a hidden singular/plural text. The counts come from `loadNavCounts` (`src/lib/server/admin-view.ts`):
  - calls: `deriveCallList(getCallFeed(now), now).length`;
  - replies: `countReplyReminders()` (`deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`).
- The admin home has the `h1` "Übersicht" (visually hidden, as in the mockup) and the worker warning from `workerHealth`:
  - no heartbeat: "Der Versand läuft nicht.";
  - `stale`: "Der Versand läuft seit 09:55 nicht.";
  - `failing`: "Seit 09:45 geht keine Mail raus. …".
  The time is the clock time when it falls on today, else "Mo 11. Januar, 22:30". Below the warning is the empty two-column grid (two columns from 1024 px).

### Call list core (AD-21)

`deriveCallList(feed, now)` in `src/lib/domain/call-list.ts` derives the call list from `CallFeedEntry` (the send-problem entry plus `lastTold` and `current` notices). It is never stored.

- It drops bookings that have started.
- Trigger (a): only while the latest keybox row is in the keybox phase (`isKeyboxPhase`: accepted, refused, expired), `classifyHeatChange(lastTold, current)`. `urgent` is `call_required` and `good_news` is `optional`.
- Trigger (b): `sendProblems(…).callRequired` is `call_required`, with its reasons.
- Each booking gets one entry, and `call_required` wins. The list is ordered `call_required` first, then by start.
- `getCallFeed(now)` (`src/lib/server/db/queries/admin.ts`) reads each day once and selects no contact data. Story 3.6 displays the list.

### Drafted copy for operator review (Story 3.1)

The nav labels, the plural badge texts, "Das Passwort stimmt nicht.", "Zu viele Versuche. …", "Bitte melde dich wieder an." and "Das hat nicht geklappt. Nichts wurde geändert. …" come from EXPERIENCE.md, DE and EN. The DE stale warning is the epics' draft. Everything else is a draft:

| Key | DE | EN |
| --- | --- | --- |
| `admin_login_title` (`h1`, `<title>`) | Anmelden | Sign in |
| `admin_sign_in` (button) | Anmelden | Sign in |
| `admin_password_label` | Passwort | Password |
| `admin_home_title` (`h1`, `<title>`) | Übersicht | Overview |
| `admin_nav_name` (nav `aria-label`) | Admin | Admin |
| `admin_badge_calls` (singular) | 1 Anruf offen | 1 call open |
| `admin_badge_replies` (singular) | 1 Antwort offen | 1 reply open |
| `admin_worker_not_running` (no heartbeat yet) | Der Versand läuft nicht. | Sending isn't running. |
| `admin_worker_stale` | Der Versand läuft seit {time} nicht. | Sending hasn't run since {time}. |
| `admin_worker_failing` (sends failing for 15 min) | Seit {time} geht keine Mail raus. Der Versand versucht es weiter. | No email has gone out since {time}. Sending keeps trying. |
| `admin_password_too_short` (for Story 3.7) | Das Passwort braucht mindestens 12 Zeichen. | The password needs at least 12 characters. |
| `admin_password_too_long` (for Story 3.7) | Das Passwort ist zu lang. | That password is too long. |

## Admin bookings by day (Story 3.2)

Read-only pages behind the 3.1 guard. They read through `src/lib/server/db/queries/admin.ts` only (`getAdminBookings`, `getAdminBooking`, `adminDayAccepted`, `getAdminStripExtraDates`, `getFutureFlagCandidates`); the view models live in `src/lib/server/admin-day-view.ts` (day, rows, detail) and `src/lib/server/admin-view.ts` (home). Deleted bookings appear nowhere.

- **`/admin/day`** redirects (303) to today when it lies in a season, else to the first day of the next season, else to today.
- **`/admin/day/{yyyy-mm-dd}`** shows a day that lies in any season row (past ones too, by URL), has a live booking or a block, or is today. Anything else, and a malformed date, is an admin 404 (`(portal)/+error.svelte`, inside the shell, with a link to Buchungen).
  - The strip: the current season's days (else the next season's), plus every future day a live booking or a block overlaps (a block across midnight adds each day), in date order. Every cell is a link. A day with a booking outside the current times carries a dot and says so in its hidden name. The arrows go to the nearest strip day each side and are disabled at the ends.
  - Below 1024 px the bookings are rows (time range and heat state; "Tom Brunner · 2 Personen" with the tags; chevron). From 1024 px they are a table with `<th scope="col">` columns time · name · party · email · mobile · notice now · last told · code sent; one stretched link on the time makes the whole row clickable.
  - The skip link is "Zu den Buchungen" (`#bookings`). Switching days follows the guest pattern: the list dims with `aria-busy`, "Lädt …" shows after 1 s, and the status announces "Dienstag, 12. Januar: 2 Buchungen" or "Dienstag, 12. Januar: Keine Buchungen.". The shown day is always a strip cell (added when it is not a season or extra day), so one cell is selected.
- **`/admin/booking/{id}`** shows a live booking (unknown, deleted or malformed ids are an admin 404): the back link to its day, the eyebrow date, the time range as `h1`, Name · E-Mail · Handy · Personen · Dauer · Schlüsselmail (email and mobile as text inside `mailto:`/`tel:` links), "Hinweis jetzt" and "Zuletzt gesagt" side by side (one column on phones), and the refused non-urgent emails.
- **Admin home**: "Nächste Buchungen" with one `h3` per day ("Heute · Di 12. Januar", "Morgen · Mi 13. Januar"), each with its rows or the empty line, and the flags above the grid with one link per booking.

Rules:

- "Hinweis geändert" comes only from `!noticeEquals(current, lastTold)`; there is no tag when no last-told notice is stored. Notice texts use `badgeText` (moved to `src/lib/server/notice-text.ts`, re-exported from `booked-view.ts`) with `now` as the "at" instant.
- The code shown is the keybox row's `snapshot_keybox_code` once accepted (a blank one counts as none): muted "Code 4711", or the tag "Alter Code 1234" when it differs from the current keybox code setting. With the setting unset there is no old-code tag. Keybox times read "Mo 16:00" within 6 days of today, else "Mo 1. März, 16:00".
- The out-of-times flag is `outsideCurrentTimes({ start, durationMin }, seasons, settings)` in `src/lib/domain/flags.ts`: the local date is in no season row, or the booking starts before opening or ends after closing. It is derived on every request, never stored, and only for bookings that have not started.
- Refused emails listed on the detail and flagged on the home are unresolved refused confirmations and non-urgent heat-change emails. A refused keybox or urgent heat-change email belongs to the call list (Story 3.6).

### Drafted copy for operator review (Story 3.2)

From EXPERIENCE.md: "Hinweis geändert" · "Alter Code 4711", the detail terms, the keybox status patterns "verschickt … · Code …" / "geplant …" / "abgelehnt: …", the plural flag line "{n} Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig.", "Keine Buchungen an diesem Tag.", "Zu den Buchungen", "Nächste Buchungen", "Heute · …" / "Morgen · …" and "Hat schon begonnen.", DE and EN. Everything else is a draft:

| Key | DE | EN |
| --- | --- | --- |
| `skip_to_bookings` (only the EN text is drafted; the DE text is from EXPERIENCE.md) | Zu den Buchungen | Skip to bookings |
| `admin_day_title` (`<title>`) | {date} · Buchungen | {date} · Bookings |
| `admin_day_status` (after a day switch, singular / plural) | {date}: 1 Buchung / {date}: {count} Buchungen | {date}: 1 booking / {date}: {count} bookings |
| `admin_day_status_empty` (after a switch to a day without bookings; the visible line stays "Keine Buchungen an diesem Tag.") | {date}: Keine Buchungen. | {date}: No bookings. |
| `admin_table_caption` (hidden) | Buchungen am {date} | Bookings on {date} |
| `admin_col_time` / `admin_col_keybox_code` (table headers) | Zeit / Code verschickt | Time / Code sent |
| `admin_code` (muted, row) | Code {code} | Code {code} |
| `admin_keybox_sent_no_code` | verschickt {when} | sent {when} |
| `admin_keybox_refused_plain` (no reason stored) | abgelehnt | refused |
| `admin_keybox_in_flight` | wird gerade verschickt | sending now |
| `admin_keybox_retrying` (transient failure) | nicht zugestellt, neuer Versuch {when} | not delivered, trying again {when} |
| `admin_keybox_expired` | nicht verschickt: zu spät | not sent: too late |
| `admin_keybox_cancelled` | nicht verschickt: abgebrochen | not sent: cancelled |
| `admin_keybox_none` (no keybox row) | keine geplant | none planned |
| `admin_duration` | {minutes} Minuten | {minutes} minutes |
| `admin_no_name` (contact data erased) | (ohne Name) | (no name) |
| `admin_notice_none` (no notice stored) | nicht gespeichert | not stored |
| `admin_booking_title` (`<title>`) | Buchung {date}, {time} | Booking {date}, {time} |
| `admin_flag_tag` (row tag) | Ausserhalb der Zeiten | Outside the times |
| `admin_flag_detail` | Diese Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig. | This booking falls outside the new times. It stays valid. |
| `admin_strip_flagged` (hidden name of a flagged strip day) | {date}, ausserhalb der Zeiten | {date}, outside the times |
| `admin_flag_outside` (singular) | 1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig. | 1 booking falls outside the new times. It stays valid. |
| `admin_flag_refused` (singular / plural) | 1 Buchung hat eine abgelehnte Mail. / {count} Buchungen haben eine abgelehnte Mail. | 1 booking has a refused email. / {count} bookings have a refused email. |
| `admin_flag_link` | {date}, {time} · {name} | {date}, {time} · {name} |
| `admin_refused_heading` (detail) | Abgelehnte Mails | Refused emails |
| `admin_refused_item` / `admin_refused_item_plain` | {kind} abgelehnt: {reason} / {kind} abgelehnt | {kind} refused: {reason} / {kind} refused |
| `admin_kind_confirmation` / `admin_kind_heat_change` | Bestätigung / Hinweismail | Confirmation / Notice email |
| `admin_not_found_link` (admin 404) | Zu den Buchungen | To the bookings |

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
