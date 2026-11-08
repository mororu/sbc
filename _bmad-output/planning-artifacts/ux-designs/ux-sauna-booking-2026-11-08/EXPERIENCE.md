---
title: "Experience: Sauna Booking Calendar"
status: final
created: 2026-11-08
updated: 2026-11-08
sources:
  - ../../prds/prd-sauna-booking-2026-11-08/prd.md
  - ../../briefs/brief-sauna-booking-2026-08-23/brief.md
  - ../../briefs/brief-sauna-booking-2026-08-23/addendum.md
  - ../../architecture-inputs.md
---

# Sauna Luegisee: Experience Spine

Glossary terms (start time, heat state, hot, cold start, arrival time, earliest arrival, latest arrival, notice, last-told notice, heat change, affected booking, changeover, block, call list, keybox email, booking horizon, season, operating hours, pre-heat window, settle delay, 24-hour cutoff) are used exactly as in the PRD §4 Glossary. Requirements are cited by PRD id. This spine owns *how it works*. DESIGN.md owns *how it looks*.

**The spines win on any conflict with a mock in `mockups/`.** Mocks only illustrate; everything needed to build is written here or in DESIGN.md. The guest screens in `mockups/directions.html` contain known wrong examples, listed under Inspiration & Anti-patterns.

## Foundation

- **Form factor:** mobile-first responsive web, one codebase, no native app (PRD §7). Guests are almost always on a phone, outdoors and cold, often deciding the same day. The 360px phone is the design width (NFR-1); layouts must also hold at 320 CSS px.
- **UI system:** none. Plain HTML components styled from DESIGN.md tokens. No component library. Native controls (radios, `<dialog>`, `<label>`) wherever they exist.
- **Two audiences, one site:**
  - *Guests*: public, no sign-in, no account (FR-1, FR-5).
  - *Admins*: one shared password (FR-15). The admin portal must work **equally well on a phone and a laptop**. Admins get the same responsive care as guests, not a desktop-only back office.
- **Language:** German by default, English alongside. Switchable from every page and remembered on the device (FR-26). The admin portal follows the same switch. Admin-only text may stay German if time runs short (FR-27).
- **Theme:** dark mode follows the device setting. An explicit light/dark switch sits next to DE | EN on every page.
- **Stakes and scope:** a small community app with a deadline of mid-December 2026. Season analytics views may follow during the season (PRD §8.2).

## Information Architecture

URLs are a route sketch for architecture. Path names may change, but the surfaces and how they connect may not. Every guest page carries the app header (brand, language switch, theme switch) and the footer.

### Guest surfaces

Composition reference for the day view, booking form and confirmation: [`mockups/directions.html`](mockups/directions.html), direction B "Fjord" (copy not binding).

| Surface | Route (sketch) | Reached from | Purpose | PRD |
|---|---|---|---|---|
| Calendar day view (home) | `/` → today, `/day/{yyyy-mm-dd}` | Shared link, QR at the wagon, footer brand | Start times of one day with heat state and arrival time; date strip to the booking horizon; before-season and after-season states | FR-1–FR-4, FR-8 |
| Booking form | `/book/{date}/{hhmm}` | Tap a free start-time row | Duration, party size, name, email, mobile; privacy line per field | FR-5, FR-6, FR-9 |
| Confirmation | `/booked/{opaque-id}` (no guest data in URL) | Successful submit | The notice at booking, booking details, when the keybox email comes, how to cancel | FR-7, FR-10 |
| So funktioniert's | `/info` | Footer, confirmation | Location, how heating works, keybox, how to cancel (by email), contact | n/a |
| Privacy statement | `/privacy` | Footer, booking form | Operator contact, field purposes, 30-day retention after season end, no tracking | FR-29 |
| Impressum | `/imprint` | Footer | Legal operator details | n/a |

### Admin surfaces

No public link to the admin area. Operators bookmark `/admin`. Every admin page has the **admin nav** (Übersicht, Buchungen, Blocks, Einstellungen, Auswertung, Abmelden): a tab row under the header, scrolling horizontally on phones. Illustrations: [`mockups/key-admin-home.html`](mockups/key-admin-home.html) (admin home, phone and laptop), [`mockups/key-admin-delete-dialog.html`](mockups/key-admin-delete-dialog.html) (booking detail with the delete impact dialog, "Anruf nötig" and "bekommt eine Mail" cases), [`mockups/key-admin-settings.html`](mockups/key-admin-settings.html) (settings cards, with the pre-heat validation error).

| Surface | Route (sketch) | Purpose | PRD |
|---|---|---|---|
| Sign-in | `/admin/login` | Shared password, one field | FR-15 |
| Admin home | `/admin` | **Call list** with count, **reply reminders** with count, next bookings (today and tomorrow), flags (bookings outside a shortened season or operating hours, refused non-urgent emails) | FR-21, FR-31, FR-20, FR-14 |
| Bookings by day | `/admin/day/{date}` | Date strip + list of bookings and blocks with guest details and the keybox code each sent keybox email contained | FR-16, FR-20 |
| Booking detail | `/admin/booking/{id}` | All FR-16 fields, email status incl. code sent, **Delete** with impact dialog | FR-16, FR-18 |
| Blocks | `/admin/blocks`, `/admin/blocks/new` | Upcoming blocks with delete; form for start, end, reason with impact preview | FR-17, FR-18, FR-19 |
| Settings | `/admin/settings` | Season, operating hours, changeover, booking horizon, pre-heat window, keybox code, access instructions DE/EN, admin contact, password | FR-20 |
| Analytics *(can follow)* | `/admin/analytics` | The four April questions | FR-22–FR-25 |

### Emails as surfaces

All guest emails are sent in the booking's language (FR-27), state clock times and dates (never "same time tomorrow", NFR-3), and are signed "Sauna Luegisee". No images or tracking pixels (NFR-8). Format:

- `multipart/alternative` with a complete `text/plain` part carrying the same content in the same order as the HTML part.
- HTML part: `lang` on the root, `Content-Language` header matching the booking language, `<meta name="color-scheme" content="light dark">`. No background colour on wrappers; where a colour is set, text and background are always set together, so dark-mode inversion in mail clients cannot produce dark-on-dark.
- The keybox code is real text in a heading, never an image, with digits spaced ("4 7 1 1") so it reads digit by digit. Admin contact as `mailto:`; any phone number as `tel:+41…`.

| Email | Trigger | Must contain | PRD |
|---|---|---|---|
| Confirmation | On booking | Date, start time, duration, party size, notice at booking, "this can change and we'll tell you", how to cancel (email to admin contact), when the keybox email arrives | FR-10 |
| Keybox email | At the 24-hour cutoff, or right after the confirmation if booked later | Keybox code, access and return instructions, **current notice** (authoritative) | FR-11 |
| Heat change, good news | Cold start → hot, after the settle delay, before the keybox email | Date and new notice ("already hot at …") | FR-12 |
| Heat change, urgent | Hot → cold start, a later earliest arrival, or an earlier latest arrival | Marked urgent in the subject; date and arrival time | FR-12 |
| Reply to cancelled guest | Admin taps the email in a reply reminder | Prefilled `mailto:` in the booking's language, sent from the admin's own mail program | FR-31 |

Closure: every IA surface is reached by a Key Flow below, except Blocks and Settings, which are reached by supporting flows without a PRD journey, and Bookings by day, which is reached from the admin navigation and opens the same booking detail as UJ-4.

## Voice and Tone

Microcopy. Brand posture lives in DESIGN.md, Brand & Style. Rule (NFR-10): speak like a neighbour, not a booking system. Short, concrete, friendly. **Every notice gives a clock time and never hedges.** German uses the informal *du*. Swiss spelling (*heiss*, not *heiß*). English is the same voice, not a literal translation.

### Heat-state messages (start-time row notice, confirmation badge, emails)

| Situation | Label | Notice (DE) | Notice (EN) |
|---|---|---|---|
| Hot | SCHON HEISS / ALREADY HOT | Ofen läuft. Komm um 18:15. | The stove's going. Come at 18:15. |
| Cold start (normal) | KALTSTART / COLD START | Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein. | Nobody before you: come between 17:20 and 17:30 and light the fire. |
| Cold start, less time to heat than the pre-heat window (FR-3) | KALTSTART | Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf. | Only 15 minutes to heat: come at 17:45. It will still be warming up. |
| Cold start, arrival time already past (FR-3) | KALTSTART | Komm so bald wie möglich und heiz ein. Zum Start ist die Sauna noch nicht ganz heiss. | Come as soon as you can and light the fire. It won't be fully hot at the start. |
| Taken | BELEGT / TAKEN | bis 17:00 | until 17:00 |
| Limited durations | (added to the notice) | Nur 60 Min. · … / Bis 90 Min. · … | 60 min only · … / Up to 90 min · … |
| Confirmation badge | n/a | Schon heiss um 18:15. / Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein. | Already hot at 18:15. / Cold start: come between 17:20 and 17:30 and light the fire. |
| Confirmation link back to the calendar | n/a | Weitere Zeit buchen | Book another time |

### Dates

- Full: "Dienstag, 12. Januar" / "Tuesday, 12 January". Short: "Di 12. Januar" / "Tue 12 January".
- Admin date line under a name: "Heute, Di 12. Januar", "Morgen, Mi 13. Januar", later "Do 14. Januar".
- Admin sub-group label: "Heute · Di 12. Januar", "Morgen · Mi 13. Januar".
- Day view `h1`: "Heute, 12. Januar" on today, else "Dienstag, 12. Januar" (eyebrow and date are one heading).

### Season and empty states

| State | DE | EN |
|---|---|---|
| Before season (FR-1) | Die Saison beginnt am 9. Januar. Buchen kannst du ab dem 26. Dezember. | Season opens 9 January. Booking opens 26 December. |
| Booking open, season not started | Die Saison beginnt am 9. Januar. Hier sind die ersten Tage. | Season opens 9 January. Here are the first days. |
| After the last season, or no season set | Die Saison ist vorbei. Danke fürs Kommen, bis nächsten Winter. | The season is over. Thanks for coming, see you next winter. |
| Day fully taken | An diesem Tag ist alles belegt. Schau dir einen anderen Tag an. | Nothing free this day. Try another day. |
| Today, all start times past | Für heute sind alle Zeiten vorbei. Morgen geht's weiter. | Today's times are over. See you tomorrow. |
| Day switch status | Dienstag, 13. Januar: 4 freie Zeiten | Tuesday, 13 January: 4 free times |
| Admin: call list empty | Niemand muss angerufen werden. | Nobody needs a call. |
| Admin: reminders empty | Keine offenen Antworten. | No replies waiting. |
| Admin: no bookings on day | Keine Buchungen an diesem Tag. | No bookings this day. |
| Admin: no blocks | Keine Blocks geplant. | No blocks planned. |

### Errors and refusals

| Situation | DE | EN |
|---|---|---|
| Invalid email (FR-5) | Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie, z. B. name@beispiel.ch. | That email address doesn't look right. Please check it, e.g. name@example.ch. |
| Invalid mobile (FR-5) | Bitte gib eine Handynummer an, unter der wir dich erreichen, z. B. 079 123 45 67. | Please enter a mobile number we can reach you on, e.g. +41 79 123 45 67. |
| Submit summary | 2 Angaben fehlen oder stimmen nicht. | 2 details are missing or wrong. |
| Conflict on submit (FR-6) | 18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da. | Someone just took 18:00. Here's the day as it is now. Your details are still filled in. |
| Start time began while on the form | 18:00 hat schon angefangen. Wähl bitte eine andere Zeit. | 18:00 has already started. Please pick another time. |
| Network or server failure on submit | Das hat nicht geklappt, die Buchung ist nicht gespeichert. Versuch es bitte nochmal. | That didn't work, so nothing is booked yet. Please try again. |
| Submit slow (about 15 s) | Das dauert gerade länger. Bitte warte noch, wir buchen nicht doppelt. | This is taking longer. Please wait, we won't book twice. |
| Admin: wrong password | Das Passwort stimmt nicht. | That password isn't right. |
| Admin: rate limited (FR-15) | Zu viele Versuche. Versuch es in einer Minute wieder. | Too many tries. Try again in a minute. |
| Admin: mark called refused (FR-21) | Der Hinweis hat sich inzwischen geändert. Gib bitte diesen neuen Hinweis durch. | The notice has changed since. Please give this new one. |
| Admin: action failed | Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal. | That didn't work. Nothing changed. Please try again. |
| Admin: already done by another admin | Schon erledigt. / Diese Buchung gibt es nicht mehr. | Already done. / This booking no longer exists. |
| Admin: impact changed in the dialog | Die Auswirkung hat sich geändert. Bitte prüf sie nochmal. | The impact has changed. Please check it again. |
| Admin: block overlaps bookings (FR-17) | Dieser Block überschneidet 2 Buchungen: Mo 18:00 (Anna), Mo 19:30 (Ben). Blocks löschen keine Buchungen. | This block overlaps 2 bookings: … Blocks never remove bookings. |
| Admin: block inside a changeover (FR-17) | Zwischen diesen zwei Buchungen ist kein Platz für einen Block. | There's no room for a block between these two bookings. |

### Field labels and purpose lines (FR-9)

Every input has a visible label above it.

- **Name** · *Damit wir die Buchung an der Sauna zuordnen können.* / **Name** · *So we know whose booking it is at the wagon.*
- **E-Mail** · *Für die Bestätigung und den Schlüsselcode.* / **Email** · *For your confirmation and the keybox code.*
- **Handy** · *Nur falls wir dich kurzfristig anrufen müssen.* / **Mobile** · *Only in case we need to call you at short notice.*
- Below the fields: *Mehr dazu im Datenschutz.* (link) / *More in our privacy statement.*
- Section labels: DAUER / DURATION, PERSONEN / PEOPLE, KONTAKT / CONTACT. Duration option names: "90 Minuten, bis 19:30". Unavailable note: "120–180 Min. nicht möglich: nächste Buchung um 20:00."

### Admin strings

| Where | DE | EN |
|---|---|---|
| Admin nav | Übersicht · Buchungen · Blocks · Einstellungen · Auswertung · Abmelden | Overview · Bookings · Blocks · Settings · Analytics · Sign out |
| Nav badges (hidden text) | 2 Anrufe offen · 1 Antwort offen | 2 calls open · 1 reply open |
| Admin home headings | Anrufliste · Antworten · Nächste Buchungen | Call list · Replies · Next bookings |
| Call list markers | Anruf nötig · optional | Call needed · optional |
| Call list entry | Neuer Hinweis · zuletzt gesagt: … · Angerufen | New notice · last told: … · Called |
| Call status | Tom angerufen. Anrufliste: 0. | Called Tom. Call list: 0. |
| Reply reminder | Di 12. Januar, 16:00–17:00 · gelöscht · Text kopieren · Erledigt | Tue 12 January, 16:00–17:00 · deleted · Copy text · Done |
| Reminder status | Erledigt. Antworten: 0. | Done. Replies: 0. |
| Booking row tags | Hinweis geändert · Alter Code 4711 | Notice changed · Old code 4711 |
| Booking detail terms | Name · E-Mail · Handy · Personen · Dauer · Schlüsselmail · Hinweis jetzt · Zuletzt gesagt | Name · Email · Mobile · People · Duration · Keybox email · Notice now · Last told |
| Keybox email status | verschickt Mo 16:00 · Code 4711 / geplant Fr 17:15 / abgelehnt: {Grund} | sent Mon 16:00 · code 4711 / planned Fri 17:15 / refused: {reason} |
| Past booking | Hat schon begonnen. | Already started. |
| Impact consequence | bekommt eine Mail. · weniger als 24 h. ANRUF NÖTIG · Kein Effekt auf andere Buchungen. | gets an email. · less than 24 h. CALL NEEDED · No effect on other bookings. |
| Impact new notice | Neuer Hinweis: komm zwischen 16:35 und 16:45. | New notice: come between 16:35 and 16:45. |
| Heat-change line (hidden text for "→") | heiss wird zu Kaltstart | hot becomes cold start |
| Flagged bookings | {n} Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig. | {n} bookings fall outside the new times. They stay valid. |
| Settings saved | Gespeichert. | Saved. |
| Signed out | Bitte melde dich wieder an. | Please sign in again. |
| Analytics empty | Noch keine Daten für diese Saison. | No data for this season yet. |

**Impact dialog per trigger** (title · "what" line · confirm button):

| Trigger | Title | What line | Confirm (style) |
|---|---|---|---|
| Delete booking (FR-18) | Buchung löschen? | Anna Meier · Di 12. Januar, 16:00–17:00 | Buchung löschen (destructive) |
| Delete block (FR-19) | Block löschen? | Reinigung · Mo 11. Januar, 09:00–11:00 | Block löschen (destructive) |
| Save block (FR-17) | Block speichern? | Reinigung · Mo 11. Januar, 09:00–11:00 | Block speichern (primary) |
| Save pre-heat window (FR-20) | Vorheizzeit ändern? | 30–40 → 40–50 Minuten · {n} Buchungen bekommen eine neue Ankunftszeit | Speichern (primary) |

The cancel button is always "Abbrechen" / "Cancel" (secondary).

**Settings** (card heading → field labels → notes):

| Card | Field labels | Note under the card |
|---|---|---|
| Saison | Beginn · Ende | – |
| Betriebszeiten | Von · Bis | – |
| Wechselzeit | Minuten | Gilt nur für neue Buchungen. |
| Buchungshorizont | Tage | – |
| Vorheizzeit | Kürzeste Zeit (Minuten) · Längste Zeit (Minuten) | – |
| Schlüsselbox-Code | Code | Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben. |
| Anleitung DE / EN | Deutsch · English | – |
| Kontaktadresse | E-Mail | – |
| Passwort | Neues Passwort | Alle anderen Admins werden abgemeldet. |

English labels: Season (Start · End), Operating hours (From · To), Changeover (Minutes), Booking horizon (Days), Pre-heat window (Shortest time (minutes) · Longest time (minutes)), Keybox code (Code), Instructions DE / EN (German · English), Contact address (Email), Password (New password).

After a keybox code change: "3 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:" then one link per booking ("Di 12. Januar, 17:15 · Tom Brunner"). EN: "3 upcoming bookings got their keybox email with the old code 4711:".

**Settings validation errors:**

| Case | DE | EN |
|---|---|---|
| Pre-heat ends swapped | Die kürzeste Zeit darf nicht länger sein als die längste. | The shortest time can't be longer than the longest. |
| Pre-heat out of range | Bitte eine Zahl von 15 bis 90, in 5er-Schritten. | Please enter 15 to 90, in steps of 5. |
| Changeover out of range | Bitte eine Zahl von 0 bis 60, in 5er-Schritten. | Please enter 0 to 60, in steps of 5. |
| Booking horizon out of range | Bitte eine Zahl von 1 bis 60. | Please enter 1 to 60. |
| Season end before start | Das Ende muss nach dem Beginn liegen. | The end must be after the start. |
| Hours "Bis" before "Von" | „Bis“ muss nach „Von“ liegen. | "To" must be after "From". |
| Empty required field | Bitte ausfüllen. | Please fill this in. |
| Invalid contact address | Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie. | That email address doesn't look right. Please check it. |

### Emails (subject + key line)

| Email | Subject (DE / EN) | Key line |
|---|---|---|
| Confirmation | Gebucht: Sauna Luegisee, Di 12. Januar, 18:00 / Booked: Sauna Luegisee, Tue 12 January, 18:00 | "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein. Ändert sich das, sagen wir dir Bescheid. Den Schlüsselcode schicken wir dir am Mo 11. Januar um 18:00. Absagen: schreib an {admin contact}." |
| Keybox email | Schlüsselcode für Di 12. Januar, 18:00 / Keybox code for Tue 12 January, 18:00 | Code first, large: "Code: 4 7 1 1". Then the current notice, then the access and return instructions from settings. |
| Heat change, good news | Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss / Good news: Sat 16 January, 18:30 is already hot | "Vor dir ist jetzt jemand in der Sauna. Komm am Sa 16. Januar einfach um 18:30, der Ofen läuft." |
| Heat change, urgent | Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00 / Important: cold start Sat 16 January, 18:30, come between 17:50 and 18:00 | "Die Buchung vor dir ist weggefallen. Niemand heizt vor dir: komm am Sa 16. Januar zwischen 17:50 und 18:00 und heiz ein." |
| Heat change, later earliest arrival | Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00 / Important: new arrival time for Sat 16 January, 18:00 | "Komm bitte erst ab 17:25, vorher ist die Sauna noch besetzt. Komm zwischen 17:25 und 17:30 und heiz ein." |
| Heat change, earlier latest arrival | Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00 / Important: new arrival time for Sat 16 January, 18:00 | "Wir heizen jetzt länger vor. Komm zwischen 17:10 und 17:20 und heiz ein." |
| Reply to cancelled guest (prefilled) | Deine Sauna-Buchung ist gelöscht / Your sauna booking is cancelled | "Hallo Lena, wir haben deine Buchung vom Di 12. Januar, 18:00 gelöscht. Danke für die Nachricht, bis bald an der Sauna! Sauna Luegisee" |

| Do | Don't |
|---|---|
| "Komm zwischen 17:20 und 17:30." | "Bitte erscheinen Sie ca. 30–40 Min. früher." |
| "Schon heiss um 18:15." | "Voraussichtlich vorgeheizt." |
| Clock times and weekdays with dates, in every subject | "Morgen um dieselbe Zeit", relative durations, subjects without a date |
| *Zeit*, *Buchung*, *belegt* | "Slot", "Reservation", "Ressource", "Status: confirmed" |
| Plain thanks and one exclamation at most ("Gebucht!") | Exclamation chains, emoji, marketing |

## Component Patterns

Behavioural. Visual specs live in DESIGN.md, Components. Names match.

| Component | Use | Behavioural rules |
|---|---|---|
| App header + language switch | Every page | "DE \| EN" are two links. Accessible names "Deutsch" (`lang="de"`) and "English" (`lang="en"`), `hreflang` set, `aria-current="true"` on the active one. Switching reloads the same page in the other language, keeps the current day and form input, and stores the choice on the device (essential cookie or local storage, NFR-8). The booking language is the language active at submit (FR-27). |
| Theme switch | Every page, next to DE \| EN | First visit follows `prefers-color-scheme`. A two-state `<button aria-pressed>` with the fixed name "Dunkles Design" / "Dark mode", pressed in dark. Tapping switches mode and stores the choice on the device. Once stored, there is no "follow device again" option. |
| Skip link | Day views (guest and admin) | First focusable element: "Zu den Zeiten" / "Skip to times" (admin: "Zu den Buchungen"). Visible on focus. Jumps past the date strip. |
| Admin nav | Every admin page | Tabs are links; the current one has `aria-current="page"`. "Übersicht" carries two badges, call list count and reply-reminder count, each with hidden text ("2 Anrufe offen", "1 Antwort offen"). Never summed. Both show "0" when empty. "Abmelden" signs out at once. |
| Date heading | Calendar day view, admin day view | Shows the selected day as one `h1` with eyebrow + date ("Heute, 12. Januar" on today). Arrows "Vorheriger Tag" / "Nächster Tag" step one day and are `disabled` (not hidden) at the first and last selectable day. |
| Date strip | Calendar day view, admin day view | A `nav` with one cell per day from today to the end of the booking horizon (FR-1); the admin strip is not limited by the horizon. Each cell's name is the full date ("Mittwoch, 13. Januar"); weekday source text in sentence case, uppercased by CSS. Days outside a season are struck-through `<span>`s, not links. Tap selects a day, updates the URL (`/day/{date}`) so Back works, and sets `aria-current="date"`. The selected day scrolls into view. On phones the strip scrolls horizontally; arrows are the non-swipe alternative. |
| Start-time row | Calendar day view | Lists, in time order, every offered start time that has not passed (FR-1, FR-4), plus one taken row per booking or block. Free row: the whole row is one link to the booking form. Taken row: not interactive, shows only "bis {end}" (no name, no reason, FR-1). Start times only of the third kind (FR-4 / §4) offer only the durations that end there, with "Nur 60 Min." in the notice. The heat state never depends on duration (FR-2). Times use `<time datetime>`. |
| State badge | Booking summary, confirmation | Always icon + label + border style; never interactive. Carries the same notice text as the row it came from, so the guest sees one consistent message from day view to email. |
| Heat-change line | Call list entry, impact mini row | Reads from-state → to-state, measured against the last-told notice. The arrow is `aria-hidden` with hidden text "wird zu" / "becomes". |
| Booking summary | Booking form | Repeats the date, start time and heat state with its notice. The back link "‹ Di, 12. Januar" has the name "Zurück zu Dienstag, 12. Januar"; "‹" is `aria-hidden`. |
| Segmented control: duration | Booking form | `<fieldset>` + `<legend>` "Dauer", native radios visually hidden behind styled labels, so arrow keys and checked state come free. 60 · 90 · 120 · 150 · 180. Each option's name includes unit and end time ("90 Minuten, bis 19:30"). Durations that would overlap a block, end less than one changeover before the next booking, or run past operating hours or the season are disabled radios (FR-5), with one visible note saying why, linked to the fieldset via `aria-describedby`. **Preselected: 60 when it is offered; otherwise the shortest offered duration (on a start time only of the third kind, the only one offered).** The note shows the end time ("bis 19:30"). |
| Segmented control: party size | Booking form | Same native-radio pattern, legend "Personen". 1–6. Preselected 2. |
| Text field | Booking form, sign-in, block form, settings | Visible `<label for>` above every input; purpose or note line linked via `aria-describedby`. Booking form: Name (`autocomplete=name`), E-Mail (`type=email`, `autocomplete=email`, `autocapitalize=off`, `spellcheck=false`), Handy (`type=tel`, `autocomplete=tel`; accepts spaces, `+41`, `0041`, `07…`). On blur, validate only fields that have content; field errors are not announced live, they are read via `aria-describedby` + `aria-invalid` when focused. On submit: summary at the top ("2 Angaben fehlen oder stimmen nicht."), focus to the first invalid field, typed values kept (FR-5). Each field has its purpose line (FR-9). No consent checkbox, no captcha, no verification step. Name, email and mobile are kept for this browser session only, so a conflict or a second booking does not re-ask. Textarea variant for the access instructions DE / EN. |
| Primary button | Booking form ("{time} buchen"), sign-in, non-destructive impact-dialog confirm | One tap submits. While sending: label "Wird gebucht …", `aria-disabled="true"` (further taps ignored), focus stays on it, and a polite `role="status"` region says "Wird gebucht …". After about 15 s the status shows the "dauert gerade länger" line; never claim failure while the result is unknown. |
| Secondary button | Impact dialog, call list entry, reply reminder, settings cards | Safe or neutral actions ("Abbrechen", "Angerufen", "Text kopieren", "Erledigt", "Speichern"). Uses `aria-disabled` while its request runs. |
| Destructive button | Impact dialog (delete booking, delete block), end of booking detail | Only for deletes. The one on booking detail opens the impact dialog; the one in the dialog confirms. |
| Inline message | Any form or list | Appears at the top of the affected content and stays until the cause is gone. Form-level failures (conflict, network, admin action failed) use a live region (`role="alert"`); confirmations ("Gespeichert.") use `role="status"`. No toasts that vanish on their own. |
| Loading line | Day switch | See State Patterns, Switching day. |
| Season notice | Calendar day view | Replaces the start-time list outside a bookable season (see State Patterns). |
| Footer | Every guest page | So funktioniert's · Datenschutz · Impressum · admin contact (`mailto:`). |
| Sign-in form | `/admin/login` | A hidden `username` field ("admin") so password managers can save the shared password, one visible password field (`autocomplete=current-password`, paste allowed) and a button. After success, go to admin home or the page that was asked for. After FR-15 rate limiting: message plus button disabled until the minute is over. |
| Admin booking row | Bookings by day, admin home | Tap opens booking detail. Shows time range, heat state (icon + label), name, party size. Tag "Hinweis geändert" when the current notice differs from the last-told notice. Once the keybox email went out it shows "Code 4711"; if that is not the current code, the tag "Alter Code 4711" instead. |
| Sub-group label | Admin home, Nächste Buchungen | Groups rows by day: "Heute · Di 12. Januar", "Morgen · Mi 13. Januar". Rendered as `h3`. |
| Admin day table | Bookings by day, ≥ 1024px | Same data as admin booking rows in a table with column headers (`<th scope="col">`). Whole row links to booking detail. |
| Booking detail | Admin | Read-only list of FR-16 fields. "Hinweis jetzt" and "Zuletzt gesagt" side by side; the change tag if they differ. Keybox email status incl. the code it contained ("verschickt Mo 16:00 · Code 4711" / "geplant Fr 17:15" / "abgelehnt: {Grund}"). Refused non-urgent emails listed here (FR-14). "Buchung löschen" is shown only for future bookings (FR-18). |
| Impact dialog | Booking detail, blocks list, block form, settings (pre-heat window) | Opens before any booking or block delete (FR-18, FR-19), block save (FR-17) or pre-heat window save (FR-20). Native `<dialog>` via `showModal()`: focus contained, background inert, Esc and scrim tap cancel. `aria-labelledby` = title, `aria-describedby` = consequence line. Content per trigger: see Voice and Tone, Impact dialog per trigger. The affected booking appears as the mini row, with its heat change **measured against its last-told notice** ("Tom, 17:15: heiss → Kaltstart") and the consequence: "bekommt eine Mail." (FR-12), "weniger als 24 h. ANRUF NÖTIG" (FR-13), or "Kein Effekt auf andere Buchungen.", then "Neuer Hinweis: …". Initial focus on "Abbrechen". Buttons: stacked on phones, side by side on laptops; confirm first, "Abbrechen" second. **The impact is recomputed on confirm and while open.** If it changed, nothing is deleted or saved: the dialog replaces its content, shows "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." and moves focus to the dialog title, never to the confirm button. On close, focus returns to the trigger; after a successful delete, to the page `h1`. |
| Reply reminder | Admin home; also shown right after a deletion | Created on every booking deletion (FR-31). Shows guest name, the deleted booking's date and time with "· gelöscht", and the email address as text and as a `mailto:` link with subject and body prefilled in the booking's language (see Voice and Tone). "Text kopieren" copies address, subject and body for laptops without a mail program. "Erledigt" removes it for all admins. Stays until marked done. After removal: focus moves to the next reminder's heading, or to the "Antworten" heading if none is left, and a polite status says "Erledigt. Antworten: 0." |
| Call list entry | Admin home | One per booking on the call list (FR-21), as a list item with an `h3` ("17:15 · Tom Brunner"). Order: *Anruf nötig* first, then by start time. Date line ("Heute, Di 12. Januar"), heat-change line, "Neuer Hinweis" with the **notice to give**, "zuletzt gesagt: …", plus the reason when it came from a refused email (FR-14). Mobile number as text and `tel:` link. "Angerufen" stores the displayed notice as the last-told notice. If the notice changed meanwhile, the action is refused, the entry re-renders with the new notice, and focus moves to the refusal message inside it (FR-21). Entries leave the list when called, when the notice returns to the last-told notice (FR-13), when the booking is deleted (FR-18), or when the start time passes. After removal: focus moves to the next entry's heading, or to the "Anrufliste" heading if none is left, and a polite status says "Tom angerufen. Anrufliste: 0." |
| Count badge | Admin home section headings | Shows the number of call list entries and of open reply reminders. Zero shows "0". Count changes are announced through the call or reminder status. |
| Change tag | Admin booking row, booking detail | Plain text tag; read as part of the row. |
| Block form | `/admin/blocks/new` | Date, start time, end time (5-minute steps), reason as a segmented control (Reinigung · Wartung · Privat). "Prüfen" shows the impact dialog. Overlaps and blocks inside a changeover are refused with the conflicting bookings listed (FR-17). |
| Settings card | `/admin/settings` | One card per group, each with its own "Speichern"; labels and notes per Voice and Tone, Settings. Allowed values per FR-20; out-of-range values are refused inline with the settings validation strings, value kept, focus to the first error. Saving the pre-heat window goes through the impact dialog first ("{n} Buchungen bekommen eine neue Ankunftszeit": later earliest or earlier latest arrivals). Shortening the season or hours lists the bookings that stay valid but are flagged. Success: "Gespeichert." inside the card. **After a keybox code change**, the card lists every upcoming booking whose keybox email was already sent with the old code, each linking to its booking detail; the list shrinks as those start times pass (FR-20). Password change warns "Alle anderen Admins werden abgemeldet." |
| Analytics panel *(can follow)* | `/admin/analytics` | One panel per question (FR-22–FR-25). Heading is the question in plain words, then a one-line reading ("Kaltstart-Zeiten wurden etwa halb so oft gebucht wie heisse"), then bars (`aria-hidden`) backed by a real table of the numbers. Season selector at top. No interactivity beyond that. |
| Focus ring | All | See State Patterns, Focus. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Calendar day view | Server-rendered day with start times on first paint, usable within 3 s on 4G (NFR-2). No skeleton screens. |
| Switching day | Calendar day view, admin day | The list stays, dimmed, with `aria-busy="true"`, until the new day arrives. The strip selection moves at once. After 1 s, "Lädt …" appears in a polite status region at the top of the list. On arrival that region reads "Dienstag, 13. Januar: 4 freie Zeiten" (or the empty-state line) and `document.title` updates. |
| Before season | Calendar day view | Before booking opens: season notice "Die Saison beginnt am 9. Januar. Buchen kannst du ab dem 26. Dezember." No date strip. When booking is open but the season has not begun: land on the first season day, with a note above the strip. Strip days before the season are struck through (FR-1). |
| After season | Calendar day view | Season notice "Die Saison ist vorbei …", no date strip. Footer remains. If an admin has already set a next season, the before-season state applies instead. With no season set at all, the after-season text is shown. |
| Day fully taken / today all past | Calendar day view | Taken rows remain visible; a one-line empty message sits above them. Past start times are not shown (FR-1). |
| Conflict on submit (FR-6) | Booking form → calendar day view | The booking is refused. The guest returns to the refreshed day with the error message as the first element in `main` (`tabindex="-1"`, focused on load) and `<title>` prefixed "Fehler: ". The taken time now shows as taken, and the new offers appear with their own heat state. Name, email and mobile are kept. Tapping a new row opens the form with them filled in. |
| Start time passed while on form | Booking form | Submit refused with the "hat schon angefangen" message, back to the day, same focus and title treatment. Same data retention as a conflict. |
| Stale form opened | Booking form (old tab, Back) | If the start time is already taken or past when the form loads, go straight to the day with the conflict or "hat schon angefangen" message. |
| Confirmation revisited | `/booked/{id}` | Shows the same confirmation with the line "So stand es bei der Buchung. Änderungen schicken wir dir per Mail." |
| Too little time to heat (FR-3) | Start-time row, form, confirmation, emails | Cold start with a single arrival time and the "Nur {n} Minuten zum Einheizen" notice. Still bookable. Not shown as an error. |
| Arrival time already past (FR-3) | Start-time row, form, confirmation | "Komm so bald wie möglich und heiz ein …" notice. Still bookable (no minimum lead time, FR-8). |
| Heat state changed while on form | Booking form | The confirmation always shows the notice at the moment of booking (FR-7). If it differs from what the form showed, the confirmation badge carries it and a line says "Das hat sich gerade geändert." |
| Submit network failure | Booking form | Inline error at top (focused, title prefixed "Fehler: "), all input kept, button re-enabled. Nothing is booked. |
| Submit slow | Booking form | After about 15 s, the status region shows "Das dauert gerade länger …". The idempotent submit guarantees no double booking. |
| Validation error | Booking form, block form, settings | Inline under the field, value kept, focus to first error. |
| Focus | All | `{components.focus-ring}` on every interactive element; fields use the `{colors.focus}` underline. Never removed. |
| Failed send (FR-14) | Admin home, booking detail | Refused keybox or urgent heat-change email → call list entry *Anruf nötig* with reason "Schlüsselmail abgelehnt" or "Warnmail abgelehnt". Other refused emails → shown on booking detail and as a flag on admin home. Guests see nothing. |
| Flagged bookings (FR-20) | Admin home, booking detail | After a season or operating-hours change: "{n} Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig." with links. |
| Old keybox code (FR-20) | Settings, booking rows, booking detail | After a code change, upcoming bookings whose keybox email carried the old code show "Alter Code 4711" and are listed in the keybox card. Nothing is resent. |
| Impact changed while the dialog is open | Impact dialog | Nothing happens on confirm; the new impact is shown and focus moves to the dialog title (see Component Patterns). |
| Admin action failed | Delete, Angerufen, Erledigt, Speichern, Block speichern | Inline error "Das hat nicht geklappt. Nichts wurde geändert …" at the affected item, focus to it; the item stays unchanged. |
| Done by another admin | Call list, reminders, booking detail | The view refreshes. The item is gone with a status line "Schon erledigt." or, on booking detail, "Diese Buchung gibt es nicht mehr." with a link back to the day. |
| Call list / reminders empty | Admin home | Section stays visible with count "0" and the empty line. Never hidden, so "zero" is a visible answer. |
| Blocks list empty | Blocks | "Keine Blocks geplant." plus the "Neuer Block" button. |
| Signed out / session ended | Any admin page | Redirect to sign-in with "Bitte melde dich wieder an." and return to the page after sign-in. |
| Rate-limited sign-in | Sign-in | Message and disabled button until one minute has passed (FR-15). |
| Past booking | Booking detail | No delete button. Note "Hat schon begonnen." (FR-18). |
| Analytics without data | Analytics | "Noch keine Daten für diese Saison." per panel. |

## Interaction Primitives

- **Tap to act.** Every action is a visible link or button. No long-press, no swipe-only action, no hover-only affordance.
- **Horizontal scroll** only on the date strip and the admin nav on phones; the strip always has arrow buttons as the alternative.
- **Every step has a URL.** The browser Back button works between day, form and confirmation. A resubmitted form never creates a second booking.
- **Native handoffs:** `tel:` for call list numbers, `mailto:` for reply reminders and the admin contact, always with the number or address also shown as text.
- **Destructive actions** always go through the impact dialog. No undo after confirm.
- **Admin on laptop:** full keyboard operation (Tab order = reading order, Enter submits, Esc closes the dialog). No custom shortcuts.
- **Motion:** short fades of 150 ms or less; none under reduced motion.
- **Banned:** a guest cancel or change button, colour-only states, auto-dismissing toasts for anything important, carousels, pull-to-refresh, captchas, consent banners (none needed, NFR-8), modal stacks deeper than one.

## Accessibility Floor

Behavioural. Target: WCAG 2.2 AA. Contrast values live in DESIGN.md, Colors (all text roles ≥ 4.5:1 and all control boundaries ≥ 3:1, in light and dark).

- **360px, one hand (NFR-1).** Every guest flow works on a 360px-wide screen with the thumb. The primary button sits at the end of the form in natural scroll order. No horizontal page scrolling. Works at 320 CSS px, with text at 200 % and with WCAG text-spacing overrides, without loss of content.
- **Targets ≥ 44px** for every interactive element, including strip days, segments, language items, the theme switch, arrows, admin tabs and `tel:` links. Standalone links (back link, footer links, "Weitere Zeit buchen", `mailto:` in reminders) have a 44px-high hit area. Adjacent targets are at least 8px apart. Inline links in running text are at least 24px high.
- **Skip link** "Zu den Zeiten" first on the day views, past the date strip.
- **Heat state for screen readers.** Icons are `aria-hidden`. Each free row is one link whose accessible name reads the time, the state and the notice: "18:15, schon heiss. Ofen läuft, komm um 18:15. Buchen." / "18:30, Kaltstart. Komm zwischen 17:50 und 18:00 und heiz ein. Buchen." Taken rows read "16:00 bis 17:00, belegt". The hot/cold difference is never carried by border style or colour alone.
- **Landmarks, headings, titles.** One `h1` per page (the date on the day view, "Übersicht" on admin home with `h2` "Anrufliste" / "Antworten" / "Nächste Buchungen"). Unique `<title>` per route: "Di, 12. Januar · Sauna Luegisee", "18:00 buchen · Sauna Luegisee", "Gebucht · Sauna Luegisee". The date strip is a `nav` with `aria-current="date"`.
- **Forms.** Persistent visible labels above every input (never placeholder-as-label), purpose and error lines tied with `aria-describedby`, `aria-invalid` on error, focus to the first error on submit. Segmented controls are native radios in a `fieldset`.
- **Dialogs.** Native `<dialog>`: focus moves in and is contained, Esc closes, focus returns to the trigger. Content scrolls inside so the buttons stay reachable at 200 % text.
- **Focus after change.** When an entry disappears ("Angerufen", "Erledigt", delete), focus moves to the next item or the section heading, never to the page start. Status messages use `role="status"`.
- **Live updates.** Form-level errors use `role="alert"`. Field errors are not announced live. Day switches, busy states and count changes use polite status regions.
- **Focus** always visible (`{components.focus-ring}`), never removed.
- **Reduced motion.** With `prefers-reduced-motion`, no transitions, and the date strip jumps instead of smooth-scrolling.
- **Forced colours.** States survive Windows contrast themes (DESIGN.md, Colors, Forced colours).
- **Language.** `<html lang="de-CH">` or `lang="en"` per the active language. Any German string left in English mode (FR-27) is wrapped in `lang="de"`. Emails set `lang` and `Content-Language`.

## Responsive & Platform

| Width | Guest | Admin |
|---|---|---|
| < 600px (design width 360px) | Single column, `{spacing.gutter}` sides, strip scrolls | Single column. Nav tabs scroll. Admin home stacks call list → reply reminders → next bookings. Booking detail is a stacked list. Settings cards stack. Impact dialog anchors to the bottom edge, buttons stacked. |
| 600–1023px | Single column, capped at `{spacing.content-max}`, centred. Strip shows all days without scrolling when they fit. | Single column, wider rows. |
| ≥ 1024px | Same capped column | Two columns up to `{spacing.admin-max}`: call list + reminders left, next bookings right. Settings cards in two columns. Bookings by day as the admin day table. Booking detail capped at `{spacing.detail-max}`. Impact dialog centred, buttons side by side. Analytics panels side by side. |

Breakpoints are 600px and 1024px. Target browsers: current Safari on iOS and Chrome on Android, and current desktop browsers. No PWA, no offline mode. Network failures are handled per State Patterns. Times are always Europe/Zurich wall-clock, including across the 28 March 2027 clock change (NFR-3).

## Key Flows

Mirrors PRD §3.3 by id and names. Examples use a 15-minute changeover and a 30–40-minute pre-heat window.

### UJ-1. Lena books a cold start for tonight (Lena, on the shore after a swim, 15:30)

1. Lena opens the link on a phone. The calendar day view shows today, Tuesday 12 January, in German. The heading reads "Heute, 12. Januar". The selected strip day is underlined.
2. Lena scrolls the start-time rows. 18:00 has a dashed border and a snowflake: **KALTSTART**, "Niemand vor dir: komm zwischen 17:20 und 17:30 und heiz ein."
3. Lena taps the row. The booking form opens with the booking summary "18:00 · KALTSTART" and the arrival line. Duration 60 and party size 2 are preselected.
4. Lena taps 90 in duration (note "bis 19:30") and 3 in party size.
5. Lena types name, email and mobile under their visible labels. Each field shows its purpose line.
6. Lena taps "18:00 buchen". The button reads "Wird gebucht …".
7. **Climax:** the confirmation shows "Gebucht!" and the dashed badge "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein." Because 18:00 is less than 24 hours away, the keybox line says "Der Schlüsselcode ist schon unterwegs in dein Postfach." The confirmation email and the keybox email arrive at once (FR-11).

**Failure path (FR-6):** while Lena is typing, someone books 17:00–18:00. Lena's submit is refused because 18:00 is now inside the changeover. Lena lands on the refreshed day, focus on "18:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da." 17:00 shows as taken ("bis 18:00"). **18:15** is offered as SCHON HEISS ("Ofen läuft. Komm um 18:15."). **18:30** is still KALTSTART with "Nur 15 Minuten zum Einheizen: komm um 18:15. Die Sauna wärmt dann noch auf." (the earliest arrival moves to 18:15, after the 17:00 booking's changeover). Lena taps 18:15. The form opens with the details filled in, and Lena books.

### UJ-2. Jonas's booking turns hot, then cold again (Jonas, booked on Monday, Saturday 18:30)

1. Monday 11 January: Jonas books Saturday 16 January, 18:30. Saturday already has 16:00–17:00. The confirmation and its email say "Kaltstart: komm zwischen 17:50 und 18:00 und heiz ein." That is now Jonas's last-told notice.
2. Wednesday: someone books the hot 17:15 start for 60 minutes, ending 18:15. Jonas's booking is now back to back.
3. The notice holds for the settle delay (10 minutes). The heat-change email goes out: subject "Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss". Body "Vor dir ist jetzt jemand in der Sauna. Komm am Sa 16. Januar einfach um 18:30, der Ofen läuft."
4. Thursday: an admin deletes the 17:15 booking (UJ-4 pattern). The impact dialog shows "Jonas, Sa 18:30: heiss → Kaltstart · bekommt eine Mail."
5. **Climax:** after the settle delay, Jonas gets the urgent email "Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00". The subject gives the arrival time, so Jonas knows to bring matches before even opening the body.

**Quiet path:** had the 17:15 booking been made and deleted within the settle delay, the notice would still match Jonas's last-told notice at send time, and Jonas would receive nothing (FR-12).

### UJ-3. Sara gets the keybox email the day before (Sara, booked a week ago, Sunday 10:00)

1. Sara booked Sunday 17 January, 10:00 in English a week ago. Sara's confirmation said the code arrives "on Sat 16 January at 10:00".
2. Saturday 10:00 (the 24-hour cutoff, sent within 15 minutes, NFR-4): the keybox email arrives in English. Subject "Keybox code for Sun 17 January, 10:00".
3. The code stands first, large. Below it the access and return instructions from settings (EN version).
4. **Climax:** the current notice, marked as the one that counts: "Nobody before you: come between 09:20 and 09:30 and light the fire." This becomes Sara's last-told notice. Any later heat change goes to the call list, not to Sara's inbox (FR-13).

**Failure path (FR-14):** the mail service refuses the email. Sara's booking appears on the call list as *Anruf nötig* with reason "Schlüsselmail abgelehnt". An admin phones Sara with the code and the notice.

### UJ-4. Ruth deletes a booking and phones the guest behind it (Ruth, operator, 11:00, on a phone)

1. Ruth reads a guest's email asking to cancel today's 16:00–17:00 booking.
2. Ruth opens `/admin` and signs in with the shared password. Admin home shows "Anrufliste 0" and "Antworten 0".
3. Ruth taps today's 16:00 booking under "Heute · Di 12. Januar" in "Nächste Buchungen". Booking detail opens with the guest's details.
4. Ruth taps "Buchung löschen". The impact dialog "Buchung löschen?" opens: "Tom, 17:15: heiss → Kaltstart, weniger als 24 h. ANRUF NÖTIG. Neuer Hinweis: komm zwischen 16:35 und 16:45." Focus sits on "Abbrechen".
5. Ruth confirms. The booking is gone. Its pending emails are cancelled.
6. Right away the reply reminder for the cancelling guest appears, with name, email and "Di 12. Januar, 16:00–17:00 · gelöscht". Ruth taps the email. Ruth's mail program opens a prefilled message in the guest's booking language. Ruth sends it, comes back and taps "Erledigt".
7. Admin home now shows "Anrufliste 1". Tom's entry: 17:15, "Heute, Di 12. Januar", "heiss → Kaltstart", a tap-to-call number, "Neuer Hinweis: Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.", "zuletzt gesagt: Schon heiss um 17:15."
8. **Climax:** Ruth taps the number, phones Tom, reads the notice from the screen and taps "Angerufen". The entry leaves the list and the status says "Tom angerufen. Anrufliste: 0." The count drops to 0 for every admin, and Tom's last-told notice is now the cold start.

**Failure path (FR-21):** someone books 16:00 again before Ruth taps "Angerufen", so Tom is hot again. The entry has already left the list, since the notice matches the last-told notice again (FR-13). If the notice changed to something else, "Angerufen" is refused with "Der Hinweis hat sich inzwischen geändert …" and the entry shows the new notice to give.

### UJ-5. The operators decide in April (the operators, end-of-season meeting, laptop)

1. Someone opens `/admin/analytics` on a laptop at the meeting, signed in with the shared password.
2. The season selector shows the 2027 season. Four panels sit side by side, each headed by its question.
3. "Wann sollen wir putzen?": bookings and booked hours by weekday, hour and week (FR-22).
4. "Wie viel Holz verbrennen wir?": cold-start bookings per week, labelled "Schätzung der angezündeten Feuer" (FR-23).
5. "Lohnt sich das?": bookings, booked hours, unique guests, share of repeat guests, share of bookable hours left empty (FR-24).
6. **Climax:** "Bleiben Zeiten leer, weil sie Kaltstarts sind?" gives its one-line reading, e.g. "Kaltstart-Zeiten wurden etwa halb so oft gebucht wie heisse" (FR-25). The group decides from numbers, not memory.

**Empty path:** a panel without data shows "Noch keine Daten für diese Saison."

### Supporting flows (no PRD journey, derived from FRs)

- **Block a cleaning morning (an operator, phone).** Blocks → "Neuer Block" → Monday 09:00–11:00, Reinigung → "Prüfen" → impact dialog "Block speichern?" shows the affected booking's later earliest arrival and whether it "bekommt eine Mail" or needs a call, or "Kein Effekt auf andere Buchungen." → "Block speichern". Failure: overlap with a booking is refused and lists it (FR-17).
- **Rotate the keybox code (an operator, laptop).** Einstellungen → Schlüsselbox-Code → new code → "Speichern" → "Gespeichert." and the note "Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben." If keybox emails with the old code already went out for upcoming bookings, the card lists them with links, and their rows show "Alter Code 4711" (FR-20).
- **Visit before the season (any guest, December).** Home shows the before-season notice with season and booking-open dates (FR-1).

## Inspiration & Anti-patterns

- **Picked: palette Lärche** ([`mockups/color-themes.html`](mockups/color-themes.html), variation 2): warm, oiled larch wood, light and dark.
- **Picked: direction Fjord** ([`mockups/directions.html`](mockups/directions.html), direction B): calm Nordic minimal. Light large times, small spaced capitals for state, hairlines, 3px corners, date strip with underline, segmented controls, bordered start-time rows. Its three screens (day view, booking form, confirmation) are the composition reference for those surfaces.
- **Rejected directions:** *Stube* (warm and handmade, heavier), *Fahrplan* (bold signage), *Liste* (compact list). Also the other palettes: Glut, Dämmerung, Lehm, Nordisch.
- **Known wrong in the guest mocks (do not copy):**
  - The guest **"Stornieren" / "Ändern über den Link in der Mail"** controls. Guests cannot cancel or change in the app (PRD §7). Cancelling is by email to the admins.
  - **"17:45 · Nur 60 Min. · komm ab 17:05"** in the Fjord day view. The arrival ignores the clamp: after the 16:00–17:00 booking plus changeover the earliest arrival is 17:15, so the notice is "komm um 17:15". And "Nur 60 Min." implies a booking at 19:00, yet the same day still offers 18:30 and 19:00 as free. The "18:30: komm zwischen 17:50 und 18:00" arithmetic itself is right; the mock day as a whole is not consistent. All copy must be computed from §4.
  - Field names shown as placeholders inside the inputs. Every input gets a visible label above it.
  - Times at weight 200 and notices at 300. This spine sets times at 300 and notices at 400.
  - "Slot nicht mehr frei" as conflict copy. Use the FR-6 message in Voice and Tone.
- **Rejected patterns:** colour-only state coding; tinted or gradient fills for hot; showing who booked or why time is blocked; guest accounts or sign-in; consent checkboxes or cookie banners (not needed); any claim about actual temperature (the heat state is a rule, not a measurement, PRD §7); optimistic "probably warm" wording for gaps (SM-C2).

## Decisions and Source Gaps

**Decisions confirmed 2026-11-08.** The user accepted all earlier defaults as decisions; they are stated as plain rules above (theme switch, preselects, session-kept contact details, "Heute" heading, admin strip range, no public admin link, block time steps, "Das hat sich gerade geändert.", no-season text, breakpoints and caps, no PWA, motion, scrim, icons, admin visuals). The info page, the Impressum and the informal *du* were confirmed earlier.

Gaps without a source (not invented here):

- **Sender address** is pending registration of sauna-luegisee.ch (PRD open question 1). Email "From" naming waits on it.
- **Operator-authored text:** the access and return instructions and the privacy statement. Not part of UX.
- **No named-protagonist journey for blocks or settings.** The supporting flows are derived from FR-17 and FR-20.
