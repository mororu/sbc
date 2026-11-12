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
| `npm test` | Vitest, once (env parsing, db and queries, time and core, schemas, commands, day and book views, routes, layer rules, build guard) |
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
- With JavaScript, name, email and mobile (only those) are kept in `sessionStorage` under `sauna-booking.contact`, written on input and on submit and read to prefill empty fields, so a conflict, a language switch or a second booking does not re-ask. Nothing else is stored.

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
