# Accessibility review: DESIGN.md + EXPERIENCE.md (Sauna Luegisee)

Reviewer lens: WCAG 2.2 AA plus outdoor mobile use (cold fingers and gloves, one hand, glare, dusk, slow 4G), screen readers in German and English, forced colours, zoom/reflow. Reviewed 2026-11-08 against `DESIGN.md`, `EXPERIENCE.md` and direction B "Fjord" in `.working/directions-1.html`. Spines not edited.

## Verdict

The spines are well above average: heat state is coded four ways, every text token passes 4.5:1 in both modes (re-verified below), targets are 44px, and the accessibility floor covers names, radiogroups, dialogs and reduced motion. Three gaps must be fixed before build: the form fields have no persistent visible labels (the Fjord mock uses the placeholder as the label), the `line` token used as the only visible boundary of fields and segments is about 1.4:1, and taken-row text sits on the hatch at below 4.5:1. The rest are cheap specification additions (focus management after removals and submits, forced-colours fallbacks, native controls, lang on mixed-language text, email format), none needing design rework.

Counts: critical 0 · high 3 · medium 13 · low 10.

## Contrast recomputation

Computed with the WCAG relative-luminance formula; alpha tokens blended over the actual background.

| Pair | Light bg / surface | Dark bg / surface | Result |
|---|---|---|---|
| `text` | 13.66 / 15.38 | 14.88 / 12.96 | pass |
| `muted` | 6.11 / 6.88 | 8.21 / 7.15 | pass |
| `primary` (underline) | 6.84 / 7.70 | 7.75 / 6.75 | pass |
| `hot` (label, icon, solid border) | 5.42 / 6.10 | 8.36 / 7.28 | pass (text and 3:1 non-text) |
| `cold-start` (label, icon, dashed border) | 5.79 / 6.52 | 9.59 / 8.35 | pass (dashed border clears 3:1 easily) |
| `taken` | 5.19 / 5.85 | 5.36 / 4.67 | pass on plain bg |
| `taken` on a hatch stripe (`line` blended) | **3.79** | **3.24** | **fail 4.5:1** (H3) |
| `taken` on a hatch stripe at `line-subtle` | 4.48 | 4.28 | still fails |
| `error` | 5.70 / 6.42 | 8.42 / 7.33 | pass |
| `focus` ring | 6.04 / 6.80 | 9.64 / 8.39 | pass |
| `on-primary` on `primary` | 7.89 | 7.75 | pass |
| `on-error` on `error` | 6.57 | 8.42 | pass |
| Selected segment (`background` on `text`) | 13.66 | 14.88 | pass |
| Text on pressed fill (`line-subtle`): text / muted / hot / cold | 11.7 / 5.23 / 4.64 / 4.96 | 11.9 / 6.55 / 6.67 / 7.66 | pass (hot light is close) |
| `line` (16 % / 18 %) as a boundary | **1.37 / 1.38** | **1.66 / 1.69** | **fails 3:1 where it is the only boundary** (H2) |
| `line-subtle` | 1.16 | 1.25 | decorative only, fine |
| `hot` vs `cold-start` against each other | 1.07 | 1.15 | colour adds almost nothing (fine, by design; label/icon/border carry it) |

The ratios in DESIGN.md, Colors are correct. What is missing is the non-text rows (borders, hatch, underline) and the hatch-under-text case.

---

## High

### H1. Text fields have no persistent visible label
- **Location:** DESIGN.md, Components, *Text field* ("label/placeholder `{colors.muted}`"); `{components.text-field}.placeholder-foreground`; Fjord mock (`.b-field` shows "E-Mail", "Handy" inside the field; the focused field shows only "Anna Meier"). EXPERIENCE.md, Accessibility Floor says "Visible labels (not placeholder-only)", so the spines contradict each other and the mock wins by default when a developer copies it.
- **WCAG:** 3.3.2 Labels or Instructions, 1.3.1 Info and Relationships, 2.5.3 Label in Name.
- **Why it matters here:** once autofill or typing fills a field, the guest in glare cannot tell which line is email and which is mobile; placeholder text in `muted` disappears on input.
- **Fix:** In DESIGN.md, Components, *Text field*, replace "label/placeholder" with: "Visible label above the field in `{typography.section-label}` style, `{colors.muted}`, always shown; no placeholder text (or an example only, never the label)." Add `label-type` and `label-gap: {spacing.2}` to `{components.text-field}` and remove `placeholder-foreground`. Use `<label for>`; purpose line linked via `aria-describedby`. Note in Inspiration & Anti-patterns that the mock's placeholder-as-label is rejected.

### H2. `line` (1.4:1) is the only visible boundary of fields, segments and secondary buttons
- **Location:** DESIGN.md frontmatter `line` / `line-dark` (marked "decorative" in the Colors table); used by `{components.text-field}.border-bottom`, `{components.segmented-control}.border` and `.divider`, `{components.button-secondary}.border`, `{components.call-list-entry}` optional marker.
- **WCAG:** 1.4.11 Non-text Contrast (3:1 for visual information needed to identify a component).
- **Why it matters here:** an underline-only field at 1.37:1 is effectively invisible on a phone in sun; unselected segments ("60", "120") read as loose numbers, not as tappable choices.
- **Fix:** Add a token `line-strong` = `text` at 50 % (`#2B211880`, 3.06 / 3.16 on bg/surface) and `line-strong-dark` = `text-dark` at 40 % (`#F3EADC66`, ≥ 3.1 on both). Alternatively reuse `{colors.muted}` (6.1 / 8.2). Use it for: text-field underline, segmented-control outline and dividers, secondary-button border, and the date-strip baseline under the strip. Keep `line` for purely decorative hairlines (section dividers, booking-summary rule, taken row border, dialog border). Add these rows to the Colors table with their non-text ratio.

### H3. Taken-row text fails contrast where the hatch crosses it
- **Location:** DESIGN.md, `{components.start-time-row-taken}` (hatch `repeating-linear-gradient(135deg, {colors.line} 0 2px, transparent 2px 9px)` behind `taken`-coloured label "BELEGT", notice "bis 17:00" at 13.5px and the 18px weight-200 struck-through time).
- **WCAG:** 1.4.3 Contrast (Minimum); also legibility in glare.
- **Numbers:** `taken` over a stripe 3.79 (light) / 3.24 (dark). Even at `line-subtle` it is 4.48 / 4.28. The 18px weight-200 time with a strike line on a striped background is the least legible element on the screen.
- **Fix (pick one, all cheap):** (a) confine the hatch to a 12px band on the left edge of the row (or to the empty area of column 3) and keep text on plain `{colors.background}`; or (b) give the time, label and notice spans `background: {colors.background}` with `padding: 0 4px` so text sits on a solid chip. Also set `{typography.slot-time-taken}` weight to 400 (see M1). Add "Taken text never sits on the hatch" to DESIGN.md, Do's and Don'ts.

---

## Medium

### M1. Weight 200 for the main numerals is too thin outdoors and maps to 100 on older Android
- **Location:** DESIGN.md typography `slot-time` (26px/200), `slot-time-taken` (18px/200), `date-heading` (34px/200), `summary-time` (44px/200), `display` (52px/200); Typography rule "weights 200–300 only at 16px and above".
- **WCAG:** not a formal failure (1.4.3 ignores stroke width), but the practical glare/dusk legibility goal of NFR-1.
- **Why:** CSS font matching for weight 200 picks the next lighter available face first; on Android versions with static Roboto that is Thin (100). SF "Thin" at 26px in sun is hairline. The start time is the primary content of the app.
- **Fix:** In DESIGN.md, raise `slot-time` and `date-heading` to 300, `slot-time-taken` to 400, keep 200 only for `summary-time` and `display` (≥ 44px). Change the Typography rule to "weight 200 only at 40px and above; 300 at 16px and above".

### M2. Forced-colours / high-contrast mode loses the selected segment and button shapes
- **Location:** DESIGN.md `{components.segmented-control-selected}` (selected = `text` fill only + weight 500); `{components.button-primary}`, `{components.button-destructive}` (filled, no border); taken hatch.
- **WCAG:** 1.4.11, 1.3.1 (state must survive user colour overrides).
- **Why:** In Windows contrast themes backgrounds are replaced, so the selected segment becomes indistinguishable except for 300 → 500 weight, and filled buttons lose their outline. Borders (solid vs dashed, error marker, selected-day underline) survive, so heat state is fine as long as it is a real `border`, not a `box-shadow`.
- **Fix:** Add a short "Forced colours" paragraph to DESIGN.md, Colors: (1) buttons get `border: 1.5px solid transparent`; (2) `@media (forced-colors: active)` selected segment uses `background: SelectedItem; color: SelectedItemText` (or add a check icon to the selected segment in all modes); (3) heat-state borders are CSS borders, never shadows; (4) icons use `currentColor`; (5) disabled days/segments use `GrayText`. The hatch may disappear; lock + label + strike still carry "taken".

### M3. Guest status messages and busy states need defined announcement and focus behaviour
- **Location:** EXPERIENCE.md Component Patterns *Primary button* ("disabled" while "Wird gebucht …"), State Patterns *Switching day* ("Lädt …"), *Conflict on submit*, Accessibility Floor *Live updates*.
- **WCAG:** 4.1.3 Status Messages, 2.4.3 Focus Order.
- **Issues:** (a) Setting `disabled` on the focused submit button drops focus to `<body>` in several browsers and VoiceOver does not read the label change. (b) Day switching keeps focus on the strip but the new list is not announced. (c) The conflict lands on a fresh server-rendered page, where `aria-live` does not fire on load.
- **Fix (EXPERIENCE.md, Component Patterns and State Patterns):** (a) Busy button: `aria-disabled="true"` (ignore further clicks in JS) instead of `disabled`, plus a polite `role="status"` region that says "Wird gebucht …". (b) Switching day: list container gets `aria-busy="true"` while loading; on arrival a polite status reads "Dienstag, 13. Januar: 4 freie Zeiten" (or the empty-state line); "Lädt …" lives in that same status region; update `document.title`. (c) Conflict / "hat schon angefangen" / network failure: render the message as the first element in `main` with `tabindex="-1"` and move focus to it on load (already stated, keep), prefix `<title>` with "Fehler: " / "Problem: ".

### M4. Admin focus is lost when "Angerufen" or "Erledigt" removes the entry
- **Location:** EXPERIENCE.md Component Patterns *Call list entry*, *Reply reminder*, *Count badge*; Accessibility Floor "The call list count change after 'Angerufen' is announced"; UJ-4 step 6–7.
- **WCAG:** 2.4.3 Focus Order, 4.1.3 Status Messages.
- **Why:** the activated button disappears with its entry, so keyboard and screen-reader focus falls to the page start. The refused case ("Der Hinweis hat sich inzwischen geändert …") re-renders the entry in place and must also be announced.
- **Fix:** add to *Call list entry* and *Reply reminder*: "After the entry leaves, focus moves to the next entry's heading, or to the section heading if none is left. A polite status says 'Tom angerufen. Anrufliste: 0.' / 'Erledigt. Antworten: 0.' On refusal, focus moves to the refusal message inside the re-rendered entry." Mark each entry as a list item with a heading (`h3`: "17:15 · Tom") so SR users can jump between entries.

### M5. Impact dialog: specify native semantics, scrolling, and what happens when the impact changes on confirm
- **Location:** EXPERIENCE.md Component Patterns *Impact dialog*; DESIGN.md Components *Impact dialog*; Accessibility Floor *Dialogs*.
- **WCAG:** 4.1.2 Name, Role, Value; 2.4.3; 3.3.4 Error Prevention; 1.4.10 Reflow.
- **Issues:** (a) Role, name and description are not specified. (b) "If it changed, the dialog shows the new impact again": with focus still on "Buchung löschen", a second tap or Enter confirms an impact the admin has not read, and SR users hear nothing. (c) Bottom-anchored on phones: at 200 % text the content can exceed the viewport and push the buttons off-screen. (d) "heiss → Kaltstart": "→" is read as "Pfeil nach rechts" or skipped.
- **Fix:** Build it with native `<dialog>` + `showModal()` (gives focus containment, Esc, inert background for free); `aria-labelledby` = title, `aria-describedby` = consequence line. On a changed impact: replace content, show a line "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." and move focus to the dialog title (not the destructive button). Panel `max-height: 90dvh; overflow-y: auto`. Arrow glyph `aria-hidden`, with visually hidden "wird zu" / "becomes".

### M6. Form error timing and double announcements
- **Location:** EXPERIENCE.md Component Patterns *Booking form* ("Validate on blur and on submit"), *Inline message* ("errors: `assertive`"), Accessibility Floor *Forms*.
- **WCAG:** 3.3.1 Error Identification, 4.1.3, 3.3.3 Error Suggestion.
- **Issues:** Errors fired on blur of an empty field while a guest is tabbing or switching apps are noisy; an assertive live region plus "focus to first invalid field" makes screen readers read the error twice or cut off the field name.
- **Fix:** In EXPERIENCE.md: "On blur, validate only fields that have content; no live announcement for field errors, they are read through `aria-describedby` + `aria-invalid` when focused. On submit, show a short summary at the top ('2 Angaben fehlen oder stimmen nicht') and move focus to the first invalid field. Only form-level failures (conflict, network) use the live region." Strengthen the email error with an example ("z. B. name@beispiel.ch").

### M7. Segmented controls: use native radios, and put units and the end time in the accessible name
- **Location:** EXPERIENCE.md Component Patterns *Segmented control: duration / party size*; DESIGN.md `{components.segmented-control*}`.
- **WCAG:** 1.3.1, 4.1.2, 3.3.2.
- **Issues:** Segments read "60, 90, 120" without unit; the end-time note ("bis 19:30") changes visually but is not announced; custom ARIA radiogroups plus "disabled but announced as nicht verfügbar" is fragile (disabled radios are skipped by arrow keys and often unreachable).
- **Fix:** Specify `<fieldset>` + `<legend>` ("Dauer" / "Personen", styled as `section-label`) with visually-hidden-input radios and styled labels: arrow keys and checked state come free. Accessible name per option: "90 Minuten, bis 19:30". Unavailable durations: keep as disabled radios, and add one visible note line explaining why ("120–180 Min. nicht möglich: nächste Buchung um 20:00"), linked via `aria-describedby` on the fieldset.

### M8. No skip link; the date strip can add up to 60 tab stops before the start times
- **Location:** EXPERIENCE.md Component Patterns *Date strip* (one cell per day to the booking horizon, 1–60 days per settings); Interaction Primitives "Admin on laptop: full keyboard operation".
- **WCAG:** 2.4.1 Bypass Blocks (keyboard users), 2.4.3.
- **Fix:** Add to EXPERIENCE.md, Accessibility Floor: "A 'Zu den Zeiten' / 'Skip to times' skip link is the first focusable element on the day views (visible on focus)." Optionally make the strip a single tab stop with roving tabindex and arrow keys; the skip link alone is enough for this project.

### M9. `lang` must be set on mixed-language fragments, switch links and emails
- **Location:** EXPERIENCE.md Foundation ("Admin-only text may stay German", FR-27), Component Patterns *App header + language switch*, Accessibility Floor *Language*, Emails as surfaces.
- **WCAG:** 3.1.1 Language of Page, 3.1.2 Language of Parts.
- **Issues:** German admin strings inside an English page will be read with English phonetics ("Anruf nötig", "Hinweis geändert"); "DE" / "EN" are spelled out letter by letter and give no hint of the target language.
- **Fix:** In EXPERIENCE.md: `<html lang="de-CH">` / `lang="en"`; any German string left in English mode is wrapped with `lang="de"`. Language links: visible "DE | EN", accessible names "Deutsch" (`lang="de"`) and "English" (`lang="en"`), `hreflang` set, `aria-current="true"` on the active one. Emails: `lang` on the HTML root and a `Content-Language` header matching the booking language.

### M10. Fixed heights and the 76px time column break at 200 % text and 320px
- **Location:** DESIGN.md `{components.start-time-row}.columns: '76px 1fr auto'`, `{components.segmented-control}.height`, `{spacing.field-height}`, `{spacing.button-height}`, `{components.date-heading}` (34px date beside two 44px arrows); EXPERIENCE.md Accessibility Floor (says 360px and 200 % zoom, not 320px or text-only scaling).
- **WCAG:** 1.4.4 Resize Text, 1.4.10 Reflow (320 CSS px), 1.4.12 Text Spacing.
- **Numbers:** at 320px with 24px gutters the column is 272px; "12. Dezember" at 34px plus 88px of arrows is about 280px. "18:15" at 26px is about 65px, so at 200 % text (Android font scaling, desktop text zoom) it overflows the 76px column.
- **Fix:** In DESIGN.md use `min-height` instead of `height` for segments, fields and buttons; row columns `minmax(76px, max-content) 1fr auto`; date heading may wrap the arrows below the date. In EXPERIENCE.md, Accessibility Floor change to "Works at 320 CSS px and with text at 200 % and WCAG text-spacing overrides without loss of content."

### M11. Meaningful text at 10–12.5px is small for cold, glare and older eyes
- **Location:** DESIGN.md `strip-weekday` 10px, `section-label` 11px, `brand` 12px, `note` 12.5px (used for **error messages**, field purpose lines, inline messages, footer).
- **WCAG:** not a formal failure; practical legibility (NFR-1).
- **Fix:** `strip-weekday` → 11px, `section-label` → 12px, `note` → 13.5px. Field error messages use `{typography.notice}` (13.5px/400) at weight 500. Cheap token change.

### M12. Text links are not covered by the 44px target rule
- **Location:** EXPERIENCE.md Accessibility Floor *Targets* (lists strip days, segments, language, theme, arrows, `tel:`); not listed: booking-summary back link "‹ Di, 12. Januar", "Mehr dazu im Datenschutz", "Weitere Zeit buchen", footer links (12.5px), reply-reminder `mailto:` link, admin booking-detail links, admin nav tabs on laptop.
- **WCAG:** 2.5.8 Target Size (Minimum) needs 24px; gloves need 44px.
- **Fix:** Add to EXPERIENCE.md Accessibility Floor: "Standalone links (back link, footer links, 'Weitere Zeit buchen', `mailto:` in reminders) have a 44px-high hit area; adjacent targets keep at least 8px between them; inline links in running text are at least 24px high." Footer: stack links vertically on phones.

### M13. Emails: plain-text part, dark-mode mail clients, and readable code
- **Location:** EXPERIENCE.md Emails as surfaces ("Plain text with light HTML"), Voice and Tone *Emails* (keybox "Code first, large").
- **WCAG:** 1.3.1, 1.4.3, 3.1.1 (as applied to HTML email); practical.
- **Fix:** Specify in EXPERIENCE.md: send `multipart/alternative` with a complete `text/plain` part (same content and order, code on its own line). HTML part: `lang` set, `<meta name="color-scheme" content="light dark">`, no background colours on wrappers (or always set text and background together so Gmail/Outlook dark inversion cannot produce dark-on-dark), code as real text in a heading, not an image or table art. Write the keybox code with spaces ("4 7 1 1") so it is read digit by digit and is easy to read in the cold. Admin contact as a `mailto:` link; any phone number as `tel:+41…` in E.164. Subject lines already front-load the arrival time (good).

---

## Low

### L1. Solid vs dashed at 1.5px is a weak cue at arm's length
- **Location:** DESIGN.md `{components.start-time-row-hot}` / `-cold-start`, `{components.state-badge}`. Browser dash length scales with border width; at 1.5px the dashes are short and read as "slightly lighter solid" in glare. Hot and cold are also nearly equal in luminance (1.07:1) and both shift towards olive for deuteranopes, so colour adds little.
- **Fix:** 2px borders for heat-state rows and badges. The label and icon remain the primary cue (already true).

### L2. Glyphs and icon-only buttons need explicit names
- **Location:** DESIGN.md *Booking summary* ("‹ Di, 12. Januar"), *Date heading* arrows, *Theme switch*.
- **WCAG:** 1.1.1, 4.1.2.
- **Fix:** "‹" `aria-hidden`; link name "Zurück zu Dienstag, 12. Januar". Arrows: "Vorheriger Tag" / "Nächster Tag" ("Previous day" / "Next day"), `disabled` at bounds (already specified).

### L3. Date strip and date heading names
- **Location:** EXPERIENCE.md *Date strip*, *Date heading*.
- **Fix:** Each cell's accessible name is the full date ("Mittwoch, 13. Januar"); weekday source text in sentence case with CSS `uppercase` (avoid letter-by-letter spelling of "DI", "MI"). Put "Heute" inside the `h1` ("Heute, 12. Januar") so screen-reader users hear it. Out-of-season days: render as non-links (`<span>`) rather than links with `aria-disabled`. Use `<time datetime>` for dates and start times.

### L4. Theme switch semantics
- **Location:** EXPERIENCE.md *Theme switch* (label flips with state).
- **Fix:** `<button aria-pressed>` with a fixed name "Dunkles Design" / "Dark mode", pressed when dark. Do not change the label and the pressed state at the same time.

### L5. Page titles, admin headings and count-badge names unspecified
- **Location:** EXPERIENCE.md Information Architecture, *Count badge*.
- **WCAG:** 2.4.2 Page Titled, 1.3.1, 2.4.6.
- **Fix:** One line in Accessibility Floor: unique `<title>` per route ("Di, 12. Januar · Sauna Luegisee", "18:00 buchen · …", "Gebucht · …"); admin home `h1` "Übersicht" with `h2` "Anrufliste" / "Antworten" / "Nächste Buchungen"; badge in nav gets visually hidden text ("1 Anruf offen") so "Übersicht 1" is not ambiguous; admin nav `aria-current="page"`.

### L6. Spines cite WCAG 2.1; the contrast table omits non-text pairs
- **Location:** DESIGN.md Colors intro; EXPERIENCE.md Accessibility Floor.
- **Fix:** Name WCAG 2.2 AA as the target (adds 2.4.11 Focus Not Obscured, 2.5.7 Dragging, 2.5.8 Target Size, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication; the spines already meet most of them). Add rows for `line-strong`, hot/cold borders and the hatch to the Colors table.

### L7. Dark-mode scrim is light
- **Location:** DESIGN.md `{components.impact-dialog}.scrim: '{colors.text} at 40 %'`. In dark mode `text-dark` is cream, so the scrim lightens the page (to `#726B62`) and weakens the dialog edge.
- **Fix:** fixed scrim `#000` at 50 % in both modes (`[ASSUMPTION]` already, so cheap to change).

### L8. Slow-4G submit has no timeout path
- **Location:** EXPERIENCE.md *Primary button*, State Patterns *Submit network failure*.
- **Fix:** After about 15 s, show (in the status region) "Das dauert gerade länger. Bitte warte noch, wir buchen nicht doppelt." and keep the idempotency guarantee already stated in Interaction Primitives. Never tell the guest it failed when the result is unknown.

### L9. Input tolerance and attributes for cold fingers
- **Location:** EXPERIENCE.md *Booking form (text fields)*, *Sign-in form*.
- **WCAG:** 3.3.8 Accessible Authentication (paste allowed), 1.3.5 Identify Input Purpose (already met).
- **Fix:** Mobile accepts spaces, `+41`, `0041`, `07…`; email `autocapitalize="off" spellcheck="false"`; never block paste in the password field; add a hidden `username` field ("admin") so password managers can save the shared password.

### L10. Analytics and native handoffs
- **Location:** DESIGN.md *Analytics panel*; EXPERIENCE.md Interaction Primitives *Native handoffs*.
- **Fix:** Bars come with a real `<table>` (or `dl`) of the numbers; bars `aria-hidden`. On laptops without a mail client the `mailto:` does nothing: add a small "Text kopieren" secondary button to each reply reminder (and show the number as text next to `tel:` links, already the case).

---

## Already good (keep)

- Heat state coded four ways, with screen-reader names spelled out per row (EXPERIENCE.md, Accessibility Floor).
- Every text token ≥ 4.5:1 in both modes; focus ring 6.0 / 9.6:1 with 3px width and 2px offset.
- 44px targets including strip days; arrows as the swipe alternative (2.5.7).
- Contact details kept for the session after a conflict (3.3.7 Redundant Entry).
- No toasts, no captcha, no consent banner, no web fonts, server-rendered first paint (good for slow 4G and low battery); dark mode follows the device.
- Initial focus on "Abbrechen" in the impact dialog; destructive action always previewed.
- "Anruf nötig" marker is text plus border, never colour alone; count shows "0" instead of hiding.
