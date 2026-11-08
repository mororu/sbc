---
name: Sauna Luegisee
description: Booking calendar for one wood-fired sauna wagon on a lake shore. Warm larch-wood palette (Lärche) in a calm Nordic-minimal layout (Fjord). Mobile-first web, light and dark.
status: final
created: 2026-11-08
updated: 2026-11-08
colors:
  # Palette "Lärche" (mockups/color-themes.html, variation 2). Light first, then -dark twins.
  background: '#F5EEE2'
  surface: '#FFFCF6'
  text: '#2B2118'
  muted: '#665645'
  primary: '#76461C'
  on-primary: '#FFFFFF'
  hot: '#9A4A12'
  cold-start: '#2F6652'
  taken: '#6F6152'
  error: '#B42318'
  on-error: '#FFFFFF'
  focus: '#2E5C8A'
  line: '#2B211829'          # text at 16 % alpha: decorative hairlines, hatch
  line-subtle: '#2B211814'   # text at 8 % alpha: pressed fill, quiet dividers
  line-strong: '#2B21188C'   # text at 55 % alpha: component boundaries (>= 3:1)
  scrim: '#2B211866'         # text at 40 % alpha: dims the page behind a dialog
  background-dark: '#1D1712'
  surface-dark: '#2B231B'
  text-dark: '#F3EADC'
  muted-dark: '#BFAE97'
  primary-dark: '#D9A066'
  on-primary-dark: '#1D1712'
  hot-dark: '#EBA265'
  cold-start-dark: '#8FCBB2'
  taken-dark: '#9A8B79'
  error-dark: '#F59B8F'
  on-error-dark: '#1D1712'
  focus-dark: '#9CC3EA'
  line-dark: '#F3EADC2E'        # text-dark at 18 % alpha
  line-subtle-dark: '#F3EADC17' # text-dark at 9 % alpha
  line-strong-dark: '#F3EADC66' # text-dark at 40 % alpha (>= 3:1)
  scrim-dark: '#0D0A0899'       # near-black at 60 % alpha; never a light scrim
typography:
  # One family everywhere: the system sans stack. No web fonts.
  brand:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 12px
    fontWeight: '500'
    letterSpacing: 0.22em
  date-heading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 34px
    fontWeight: '300'
    lineHeight: '1.05'
    letterSpacing: -0.01em
  date-eyebrow:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13px
    fontWeight: '400'
    letterSpacing: 0.14em
  strip-day:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 18px
    fontWeight: '300'
    lineHeight: '1.2'
  strip-weekday:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 11px
    fontWeight: '500'
    letterSpacing: 0.1em
  slot-time:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 26px
    fontWeight: '300'
    lineHeight: '1'
  slot-time-taken:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1'
  state-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13px
    fontWeight: '500'
    letterSpacing: 0.06em
  notice:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: '1.4'
  section-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 12px
    fontWeight: '500'
    letterSpacing: 0.16em
  field-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13.5px
    fontWeight: '500'
    lineHeight: '1.4'
  field-error:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13.5px
    fontWeight: '500'
    lineHeight: '1.4'
  name:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.3'
  summary-time:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 44px
    fontWeight: '300'
    lineHeight: '1'
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 52px
    fontWeight: '200'
    lineHeight: '1'
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 16px
    fontWeight: '300'
    lineHeight: '1.55'
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 14px
    fontWeight: '300'
    lineHeight: '1.5'
  note:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: '1.4'
  segment:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 15px
    fontWeight: '300'
  segment-selected:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 15px
    fontWeight: '500'
  field:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 16px
    fontWeight: '300'
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 16px
    fontWeight: '500'
    letterSpacing: 0.04em
  switch:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13px
    fontWeight: '400'
    letterSpacing: 0.08em
  switch-active:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 13px
    fontWeight: '600'
    letterSpacing: 0.08em
rounded:
  none: 0px
  DEFAULT: 3px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 28px
  gutter: 24px          # page side padding, every surface
  slot-gap: 14px        # between start-time rows and between admin entries
  list-top: 26px        # date strip to first row
  section-gap: 20px     # between form sections and between settings cards
  target-min: 44px      # minimum tap target (NFR-1)
  field-height: 48px    # minimum; grows with text size
  button-height: 54px   # minimum; grows with text size
  hatch-band: 12px      # width of the hatched band on taken rows
  content-max: 560px    # guest column cap on wide screens
  admin-max: 1040px     # admin content cap on laptops
  detail-max: 640px     # booking detail column cap on laptops
  dialog-max: 480px     # impact dialog width on laptops
components:
  app-header:
    padding: '14px {spacing.gutter} 0'
    brand-type: '{typography.brand}'
    brand-transform: uppercase
    foreground: '{colors.text}'
  language-switch:
    item-size: '{spacing.target-min}'
    type: '{typography.switch}'
    foreground: '{colors.muted}'
    active-type: '{typography.switch-active}'
    active-foreground: '{colors.text}'
    active-decoration: 'underline 1.5px, offset 6px'
  theme-switch:
    size: '{spacing.target-min}'
    icon-size: 18px
    foreground: '{colors.muted}'
  skip-link:
    type: '{typography.button}'
    padding: '{spacing.3} {spacing.4}'
    background: '{colors.surface}'
    border: '1px solid {colors.line-strong}'
    radius: '{rounded.DEFAULT}'
  admin-nav:
    border-bottom: '1px solid {colors.line}'
    tab-min-height: '{spacing.target-min}'
    tab-padding: '0 10px'
    type: '{typography.switch}'
    foreground: '{colors.muted}'
    active-type: '{typography.switch-active}'
    active-foreground: '{colors.text}'
    active-border-bottom: '2px solid {colors.text}'
    badge-padding: '0 6px'
    badge-min-width: 20px
  date-heading:
    eyebrow-type: '{typography.date-eyebrow}'
    eyebrow-transform: uppercase
    eyebrow-foreground: '{colors.muted}'
    heading-type: '{typography.date-heading}'
    arrow-size: '{spacing.target-min}'
  date-strip:
    border-bottom: '1px solid {colors.line-strong}'
    day-width: 44px
    day-padding: '4px 0 12px'
    day-type: '{typography.strip-day}'
    weekday-type: '{typography.strip-weekday}'
    weekday-foreground: '{colors.muted}'
  date-strip-day-selected:
    fontWeight: '600'
    border-bottom: '2px solid {colors.primary}'
  date-strip-day-disabled:
    foreground: '{colors.muted}'
    decoration: 'line-through'
  start-time-row:
    columns: 'minmax(76px, max-content) 1fr auto'
    padding: '16px 14px'
    radius: '{rounded.DEFAULT}'
    time-type: '{typography.slot-time}'
    time-numerals: tabular-nums
    label-type: '{typography.state-label}'
    label-transform: uppercase
    notice-type: '{typography.notice}'
    notice-foreground: '{colors.muted}'
    icon-size: 17px
    icon-stroke: 1.6
    pressed-background: '{colors.line-subtle}'
  start-time-row-hot:
    border: '2px solid {colors.hot}'
    label-foreground: '{colors.hot}'
    icon: flame
  start-time-row-cold-start:
    border: '2px dashed {colors.cold-start}'
    label-foreground: '{colors.cold-start}'
    icon: snowflake
  start-time-row-taken:
    border: '1px solid {colors.line}'
    foreground: '{colors.taken}'
    background: '{colors.background}'
    hatch: 'left band {spacing.hatch-band} wide, repeating-linear-gradient(135deg, {colors.line} 0 2px, transparent 2px 9px); never behind text'
    time-type: '{typography.slot-time-taken}'
    time-decoration: line-through
    icon: lock
  state-badge:
    type: '{typography.state-label}'
    transform: uppercase
    padding: '6px 10px'
    border-width: 2px
    border-style: 'solid (hot) / dashed (cold start)'
    radius: '{rounded.DEFAULT}'
  heat-change-line:
    type: '{typography.state-label}'
    transform: uppercase
    gap: 7px
    arrow-foreground: '{colors.muted}'
  booking-summary:
    padding: '8px {spacing.gutter} 18px'
    border-bottom: '1px solid {colors.line}'
    time-type: '{typography.summary-time}'
  segmented-control:
    border: '1px solid {colors.line-strong}'
    radius: '{rounded.DEFAULT}'
    min-height: '{spacing.target-min}'
    divider: '1px solid {colors.line-strong}'
    type: '{typography.segment}'
    legend-type: '{typography.section-label}'
  segmented-control-selected:
    background: '{colors.text}'
    foreground: '{colors.background}'
    type: '{typography.segment-selected}'
    icon: check
  segmented-control-disabled:
    foreground: '{colors.muted}'
    decoration: line-through
  text-field:
    min-height: '{spacing.field-height}'
    border-bottom: '1px solid {colors.line-strong}'
    type: '{typography.field}'
    label-type: '{typography.field-label}'
    label-foreground: '{colors.muted}'
    label-gap: '{spacing.2}'
  text-field-textarea:
    min-height: 132px
    lineHeight: '1.5'
    resize: vertical
  text-field-focus:
    border-bottom: '2px solid {colors.focus}'
    foreground: '{colors.text}'
  text-field-error:
    border-bottom: '2px solid {colors.error}'
    message-type: '{typography.field-error}'
    message-foreground: '{colors.error}'
  button-primary:
    min-height: '{spacing.button-height}'
    background: '{colors.primary}'
    foreground: '{colors.on-primary}'
    border: '1.5px solid transparent'
    type: '{typography.button}'
    radius: '{rounded.DEFAULT}'
    margin: '{spacing.gutter}'
  button-secondary:
    min-height: '{spacing.target-min}'
    padding: '0 18px'
    background: transparent
    border: '1px solid {colors.line-strong}'
    foreground: '{colors.text}'
    type: '{typography.button}'
    radius: '{rounded.DEFAULT}'
  button-destructive:
    min-height: '{spacing.target-min}'
    padding: '0 18px'
    background: '{colors.error}'
    foreground: '{colors.on-error}'
    border: '1.5px solid transparent'
    type: '{typography.button}'
    radius: '{rounded.DEFAULT}'
  inline-message:
    type: '{typography.note}'
    padding: '10px 14px'
    border: '1.5px solid currentColor'
    radius: '{rounded.DEFAULT}'
    error-foreground: '{colors.error}'
    info-foreground: '{colors.text}'
  loading-line:
    type: '{typography.note}'
    foreground: '{colors.muted}'
  season-notice:
    padding: '{spacing.gutter}'
    heading-type: '{typography.date-heading}'
    body-type: '{typography.body}'
    border-top: '1px solid {colors.line}'
  confirmation:
    padding: '90px 28px 0'
    eyebrow-type: '{typography.section-label}'
    heading-type: '{typography.display}'
    badge-type: '{typography.button}'
    badge-padding: '10px 14px'
    body-type: '{typography.body}'
    details-type: '{typography.body-sm}'
    details-label-foreground: '{colors.muted}'
  impact-dialog:
    background: '{colors.surface}'
    border: '1px solid {colors.line}'
    radius: '{rounded.DEFAULT}'
    padding: '{spacing.gutter}'
    gap: 14px
    max-width: '{spacing.dialog-max}'
    max-height: 90dvh
    title-type: '{typography.slot-time}'
    body-type: '{typography.body}'
    scrim: '{colors.scrim}'
    scrim-dark: '{colors.scrim-dark}'
  impact-mini-row:
    border: '1px solid {colors.line}'
    radius: '{rounded.DEFAULT}'
    padding: '14px'
    gap: '{spacing.2}'
    name-type: '{typography.name}'
    consequence-type: '{typography.notice}'
  call-list-entry:
    padding: '16px 14px'
    border: '1px solid {colors.line}'
    radius: '{rounded.DEFAULT}'
    gap: 10px
    time-type: '{typography.slot-time}'
    name-type: '{typography.name}'
    date-type: '{typography.note}'
    date-foreground: '{colors.muted}'
    label-type: '{typography.section-label}'
    notice-type: '{typography.body}'
    last-told-type: '{typography.note}'
    last-told-foreground: '{colors.muted}'
    required-marker: '1.5px solid {colors.error}, text {colors.error}'
    optional-marker: '1px solid {colors.line-strong}, text {colors.muted}'
    marker-type: '{typography.state-label}'
  reply-reminder:
    padding: '16px 14px'
    border: '1px dashed {colors.line-strong}'
    radius: '{rounded.DEFAULT}'
    name-type: '{typography.name}'
    when-type: '{typography.body-sm}'
    when-foreground: '{colors.muted}'
  count-badge:
    type: '{typography.state-label}'
    min-width: 24px
    padding: '2px 8px'
    border: '1.5px solid {colors.text}'
    radius: '{rounded.DEFAULT}'
    numerals: tabular-nums
  change-tag:
    type: '{typography.section-label}'
    transform: uppercase
    padding: '2px 6px'
    border: '1px solid {colors.text}'
    foreground: '{colors.text}'
    radius: '{rounded.DEFAULT}'
  sub-group-label:
    type: '{typography.section-label}'
    transform: uppercase
    foreground: '{colors.muted}'
    margin-top: 18px
  admin-booking-row:
    columns: '1fr auto 20px'
    padding: '14px 0'
    min-height: '{spacing.target-min}'
    border-bottom: '1px solid {colors.line}'
    time-type: '{typography.strip-day}'
    detail-type: '{typography.body-sm}'
  admin-day-table:
    header-type: '{typography.section-label}'
    header-foreground: '{colors.muted}'
    cell-type: '{typography.body-sm}'
    cell-padding: '12px 8px'
    row-border: '1px solid {colors.line}'
  booking-detail:
    max-width: '{spacing.detail-max}'
    back-type: '{typography.brand}'
    eyebrow-type: '{typography.date-eyebrow}'
    heading-type: '{typography.date-heading}'
    term-type: '{typography.body-sm}'
    term-foreground: '{colors.muted}'
    value-type: '{typography.body}'
    notice-type: '{typography.notice}'
    rule: '1px solid {colors.line}'
  settings-card:
    background: '{colors.surface}'
    border: '1px solid {colors.line}'
    radius: '{rounded.DEFAULT}'
    padding: '{spacing.5}'
    gap: 14px
    heading-type: '{typography.section-label}'
    heading-foreground: '{colors.text}'
    laptop-columns: 2
    laptop-column-gap: '{spacing.6}'
  footer:
    padding: '22px {spacing.gutter}'
    type: '{typography.note}'
    foreground: '{colors.muted}'
  focus-ring:
    outline: '3px solid {colors.focus}'
    offset: 2px
---

## Brand & Style

**Sauna Luegisee** is a booking calendar for one wood-fired sauna wagon on a public lake shore, run by neighbours in their spare time. The page should feel like the wagon itself: oiled larch planks, a calm winter morning by the lake, nothing to sell. It is the opposite of a booking platform. No promotions, no urgency, no stock photography.

Two picks define the look. The **Lärche** palette (oiled larch wood, warm and handmade) gives the colour. The **Fjord** direction (calm Nordic minimal) gives the form. Fjord means a lot of air, light type for the big numbers, hairlines instead of filled areas, almost no shadow, and near-square corners. The start time stands large and light. Its heat state sits beside it in small, spaced capitals. Labels and notices stay at 400–500, so they read in glare and in low light.

The one thing the visuals must carry is the **heat state**. Hot and cold start always differ in four ways at once: icon, border style, label text and colour. Colour is never the only signal.

**This spine wins on any conflict with a mock in `mockups/`.** Mocks only illustrate. The guest screens in `mockups/directions.html` contain known wrong examples (EXPERIENCE.md, Inspiration & Anti-patterns). The admin mocks predate this version: they still show placeholder-style small labels, `line` underlines, weight-200 times, one summed nav count and a light scrim in dark mode. Follow this file instead.

## Colors

Every role has a light and a `-dark` twin. Dark mode follows the device setting, and a switch on the page can override it (EXPERIENCE.md, Component Patterns). Ratios are WCAG contrast ratios; alpha tokens are measured blended over the actual background. Every text role meets WCAG 2.2 AA (4.5:1) and every component boundary meets 3:1, in both modes (NFR-1). Palette reference: [`mockups/color-themes.html`](mockups/color-themes.html), variation 2 "Lärche" only.

| Role | Light | Dark | Contrast (light / dark) | Used for |
|---|---|---|---|---|
| `background` | `#F5EEE2` | `#1D1712` | n/a | Page canvas. Start-time rows and forms sit directly on it. |
| `surface` | `#FFFCF6` | `#2B231B` | n/a | Raised areas only: impact dialog, settings cards, skip link. |
| `text` | `#2B2118` | `#F3EADC` | 15.4 / 13.0 on surface; 13.7 / 14.9 on bg | All primary text, times, selected segment fill, active admin tab underline. |
| `muted` | `#665645` | `#BFAE97` | 6.9 / 7.2 on surface; 6.1 / 8.2 on bg | Notices, eyebrows, field labels, weekday labels, helper text. |
| `primary` | `#76461C` | `#D9A066` | `on-primary` on it: 7.9 / 7.7; as underline: 6.8 / 7.8 on bg | The "book" button, the confirm button in a non-destructive impact dialog, the sign-in button, the selected-day underline. Nothing else. |
| `hot` | `#9A4A12` | `#EBA265` | 6.1 / 7.3 on surface; 5.4 / 8.4 on bg | Hot label, icon and solid border. |
| `cold-start` | `#2F6652` | `#8FCBB2` | 6.5 / 8.4 on surface; 5.8 / 9.6 on bg | Cold-start label, icon and dashed border. Pine green, a cool counter-hue to `hot`. |
| `taken` | `#6F6152` | `#9A8B79` | 5.8 / 4.7 on surface; 5.2 / 5.4 on bg | Taken rows (bookings and blocks alike). Always on plain `background`, never on the hatch. |
| `error` | `#B42318` | `#F59B8F` | 6.4 / 7.3 on surface; `on-error` on it: 6.6 / 8.4 | Inline errors, the destructive button, the call-required marker. |
| `focus` | `#2E5C8A` | `#9CC3EA` | 6.0 / 9.6 on bg | Focus ring and focused field underline. |
| `line-strong` | `text` at 55 % | `text-dark` at 40 % | **3.5 / 3.4 on bg; 3.6 / 3.3 on surface** (non-text, ≥ 3:1) | Every boundary that identifies a control: text-field underline, segmented-control outline and dividers, secondary-button border, optional marker, reply-reminder outline, date-strip baseline, skip link. |
| `line` | `text` at 16 % | `text-dark` at 18 % | 1.4 / 1.7, decorative only | Hairlines that carry no meaning on their own: section rules, booking-summary rule, taken-row border, dialog and card borders, admin nav baseline, taken hatch. |
| `line-subtle` | `text` at 8 % | `text-dark` at 9 % | decorative | Pressed-row fill, quiet dividers. |
| `scrim` | `text` at 40 % | near-black `#0D0A08` at 60 % | n/a | Dims the page behind the impact dialog. Dark mode always uses its own dark scrim, never a light one. |

Rules:

- **`hot` and `cold-start` are reserved for heat state.** Never use them for decoration, buttons or admin status.
- **`primary` marks the one main action per screen** and the selected day. It never shows a state and never marks the active admin tab.
- **`error` is for things that went wrong or need action now.** A cold start is not an error and never uses `error`.
- `taken` hides *why* time is taken. Bookings and blocks look the same to guests (FR-1).
- No gradients, no tinted fills behind heat-state rows. Fjord uses borders, not fills. The only patterned fill is the taken hatch, confined to its left band.
- **`line` never stands alone as the boundary of a control.** Use `line-strong`.

**Forced colours** (`@media (forced-colors: active)`): filled buttons keep their transparent 1.5px border, so the shape survives. The selected segment uses `SelectedItem` / `SelectedItemText`, and it also carries the check icon in every mode. Heat-state borders are real CSS borders, never shadows. Icons use `currentColor`. Disabled days and segments use `GrayText`. The hatch may vanish. Lock, label and struck time still say "taken".

## Typography

One family: the **system sans stack** (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`). No web fonts, so nothing extra loads on 4G at the lake (NFR-2). All clock times use `font-variant-numeric: tabular-nums`. Sizes, weights and spacing live in the frontmatter only. On drift, the frontmatter wins.

| Role | Token | Where |
|---|---|---|
| Brand | `{typography.brand}` (uppercase) | "SAUNA LUEGISEE" in the header; back link on booking detail |
| Date heading | `{typography.date-heading}` | "12. Januar"; booking-detail time range |
| Date eyebrow | `{typography.date-eyebrow}` (uppercase) | "DIENSTAG" above the date |
| Strip day | `{typography.strip-day}` / `{typography.strip-weekday}` | Date strip number / weekday; admin booking-row time |
| Start time | `{typography.slot-time}` | Time in a free start-time row; call-list time; dialog title |
| Taken time | `{typography.slot-time-taken}` | Time in a taken row, struck through |
| State label | `{typography.state-label}` (uppercase) | "SCHON HEISS", "KALTSTART", "BELEGT"; markers; heat-change line |
| Notice | `{typography.notice}` | Arrival line under the state label; dialog consequence line |
| Section label | `{typography.section-label}` (uppercase) | "DAUER", "PERSONEN", "KONTAKT"; admin section headings; sub-group labels; change tag |
| Field label | `{typography.field-label}` (sentence case) | Visible label above every input |
| Field error | `{typography.field-error}` | Error message under a field |
| Name | `{typography.name}` | Guest names in admin entries and the dialog mini row |
| Summary time | `{typography.summary-time}` | Chosen start time on the booking form |
| Display | `{typography.display}` | "Gebucht!" |
| Body | `{typography.body}` / `{typography.body-sm}` | Running text, details lists |
| Note | `{typography.note}` | Field purpose lines, footer, inline messages, "Lädt …" |
| Field | `{typography.field}` | Input text. 16px stops iOS from zooming on focus. |
| Button | `{typography.button}` | Buttons and the confirmation badge |
| Switch | `{typography.switch}` / `{typography.switch-active}` | DE \| EN, theme switch, admin nav tabs |

Rules: clock times are weight 300 or heavier, for glare. Weight 200 is used only for `{typography.display}` (52px, a word, not a time). Anything that carries meaning below 16px (state label, notice, note, labels, errors) is 400–500. The Fjord mock set notices at 300 and times at 200. This spine raises both.

## Layout & Spacing

The scale is 4 · 8 · 12 · 16 · 20 · 24 · 28 px (`{spacing.1}`–`{spacing.7}`), plus named tokens lifted from Fjord:

- `{spacing.gutter}` side padding on every surface, guest and admin. At 360px this leaves 312px of content; at 320px, 272px.
- `{spacing.slot-gap}` between start-time rows and between admin entries. `{spacing.list-top}` from the date strip to the first row. `{spacing.section-gap}` between form sections and between settings cards.
- `{spacing.target-min}` is the floor for every tap target: language and theme items, date arrows, strip days, segments, list rows, admin tabs, standalone links (NFR-1).
- Fields use `{spacing.field-height}` and the primary button `{spacing.button-height}` as **minimum** heights. They grow with the text size, never clip.

Grid: the guest side is a single column at every width, capped at `{spacing.content-max}` and centred on wider screens. The admin side is a single column on phones. From 1024px it splits into two columns up to `{spacing.admin-max}` (EXPERIENCE.md, Responsive & Platform). The date heading may wrap its arrows below the date when space runs out.

## Elevation & Depth

Fjord has almost no elevation. Hierarchy comes from type size, weight and hairlines, not shadow. Start-time rows, forms and lists sit flat on `{colors.background}`, separated by `{colors.line}` borders. `{colors.surface}` is the only raised tone, used for the impact dialog, settings cards and the focused skip link, with a 1px `{colors.line}` border and no shadow. A modal dialog dims the page behind it with `{colors.scrim}`, or `{colors.scrim-dark}` in dark mode.

## Shapes

Corners are near-square: `{rounded.DEFAULT}` on every row, segment group, button, badge, tag, card and dialog. `{rounded.none}` on the date strip and field underlines. No pills, no circles, no soft cards. The 3px edge reads as planed wood, not as an app.

Borders carry meaning:

| Border | Meaning |
|---|---|
| 2px solid `{colors.hot}` | Hot |
| 2px dashed `{colors.cold-start}` | Cold start |
| 1px solid `{colors.line}` + hatched left band | Taken |
| 2px solid `{colors.primary}` (bottom only) | Selected day |
| 2px solid `{colors.text}` (bottom only) | Active admin tab |
| 2px solid `{colors.focus}` (bottom only) | Focused field |
| 1px solid `{colors.line-strong}` | A control (field, segment, secondary button) |
| 1.5px solid `{colors.error}` | Call required / error |

Icons are line icons on a 24 × 24 grid with round caps and joins, stroke `currentColor`. They are 17px in rows (stroke 1.6) and 20px elsewhere (stroke 2). The set is flame, snowflake, lock, chevron left and right, check, mail, key, phone, sun and moon, all drawn in the same style. Icons are always paired with text.

## Components

Visual specs only. Behaviour lives in EXPERIENCE.md, Component Patterns. Names match across both files. Guest composition: [`mockups/directions.html`](mockups/directions.html), direction B "Fjord" (day view, booking form, confirmation).

- **App header** (`{components.app-header}`): brand at left. At right, the **language switch** "DE | EN", then the **theme switch** (sun or moon icon). Each item is 44 × 44. The active language uses `active-type`, `{colors.text}`, underlined. The inactive one is `{colors.muted}`.
- **Skip link** (`{components.skip-link}`): first element on the day views. Off-screen until focused, then shown at top left on `{colors.surface}` with a `line-strong` border.
- **Admin nav** (`{components.admin-nav}`): a row of tabs under the header over a `{colors.line}` baseline: Übersicht, Buchungen, Blocks, Einstellungen, Auswertung, Abmelden. Inactive tabs `{colors.muted}`. The active tab is weight 600 in `{colors.text}` with a 2px `{colors.text}` underline over the baseline. `primary` is never used here. On phones the row scrolls horizontally. On laptops it is capped at `{spacing.admin-max}` and "Abmelden" sits at the far right. "Übersicht" carries **two** small count badges (`badge-padding`, `badge-min-width`): phone icon + call-list count, then mail icon + reply-reminder count. Never one summed number. Illustrated in [`mockups/key-admin-home.html`](mockups/key-admin-home.html) (its single badge is outdated).
- **Date heading** (`{components.date-heading}`): eyebrow weekday above, date below. Previous and next day arrows (44 × 44 chevrons) sit at the right, aligned to the heading's baseline, and wrap below it at narrow widths.
- **Date strip** (`{components.date-strip}`): a horizontal row of 44px-wide day cells over a `line-strong` baseline. Weekday (muted, uppercase) over day number. Selected: weight 600 with a 2px `{colors.primary}` underline that overlaps the baseline. A day outside a season is `{colors.muted}`, struck through and not tappable.
- **Start-time row** (`{components.start-time-row}`): three-column grid (time · state · chevron), `{rounded.DEFAULT}`. The time column grows with the text. Column 2 holds the state label with icon, column 3 a chevron (free rows only). The notice spans columns 2–3 below.
  - *Hot* (`{components.start-time-row-hot}`): solid `{colors.hot}` border, flame icon, label "SCHON HEISS" / "ALREADY HOT" in `{colors.hot}`.
  - *Cold start* (`{components.start-time-row-cold-start}`): **dashed** `{colors.cold-start}` border, snowflake icon, label "KALTSTART" / "COLD START" in `{colors.cold-start}`. The notice line gives the arrival time.
  - *Taken* (`{components.start-time-row-taken}`): `{colors.line}` border, lock icon, label "BELEGT" / "TAKEN", all in `{colors.taken}`. The hatch fills only a `{spacing.hatch-band}` band at the left edge. Time, label and notice sit on plain `{colors.background}`. The time is struck through. Notice: "bis 17:00" / "until 17:00". No chevron.
  - *Pressed*: `{colors.line-subtle}` fill. *Focused*: `{components.focus-ring}`.
- **State badge** (`{components.state-badge}`): the heat state as a bordered tag (icon + uppercase label), solid for hot and dashed for cold start, on the booking summary. The larger version on the confirmation uses `{components.confirmation}` `badge-type` and `badge-padding`.
- **Heat-change line** (`{components.heat-change-line}`): from-state, arrow, to-state, e.g. "HEISS → KALTSTART". Each state is its icon + label in its own heat colour. The arrow is `{colors.muted}`. Used in call-list entries and the impact-dialog mini row.
- **Booking summary** (`{components.booking-summary}`): a back link with the short date ("‹ Di, 12. Januar"), then the chosen start time at left and the state badge at right, over a hairline.
- **Segmented control** (`{components.segmented-control}`): a `fieldset` whose legend is a section label, then a 44px-minimum group with `line-strong` outline and dividers. Selected: `{colors.text}` fill, `{colors.background}` text, weight 500, check icon. Unavailable: `{colors.muted}` and struck through. A note under the duration control gives the end time ("Minuten · bis 19:30") and, if durations are unavailable, why.
- **Text field** (`{components.text-field}`): a **visible label above the field**, always shown, in `{typography.field-label}` `{colors.muted}`, `label-gap` above the input. Never a placeholder as label; a placeholder may only show an example. Underline only, in `line-strong`. Focus: 2px `{colors.focus}` underline. Error: 2px `{colors.error}` underline, message below in `{typography.field-error}` `{colors.error}`, prefixed by an error icon. A purpose or note line in `{typography.note}` muted sits under the field.
  - *Textarea* (`{components.text-field-textarea}`): same label and underline, 132px minimum, resizes vertically. Used for the access instructions DE / EN.
- **Primary button** (`{components.button-primary}`): full width minus gutters, `{colors.primary}` / `{colors.on-primary}`. On the booking form the label always includes the time ("18:15 buchen"). Busy state: label changes to the progress text, same colours.
- **Secondary button** (`{components.button-secondary}`): transparent with a `line-strong` border.
- **Destructive button** (`{components.button-destructive}`): `{colors.error}` fill. Used only for the confirming delete inside the impact dialog and for "Buchung löschen" at the end of booking detail.
- **Inline message** (`{components.inline-message}`): bordered note with icon. Error uses `{colors.error}` with the error icon. Confirmation or info uses `{colors.text}` with the check icon. Shown at the top of the content it refers to.
- **Loading line** (`{components.loading-line}`): "Lädt …" in note type, muted, at the top of the dimmed list.
- **Season notice** (`{components.season-notice}`): replaces the start-time list before or after the season. Heading with the dates, one body sentence below.
- **Confirmation** (`{components.confirmation}`): eyebrow date, "Gebucht!" / "Booked!", then the large state badge carrying the notice exactly as in EXPERIENCE.md, Voice and Tone ("Schon heiss um 18:15." or "Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein."). Below a hairline: the keybox sentence in body, then a details list (`dt` muted / `dd`) for *Wann*, *Personen*, *Absagen*.
- **Impact dialog** (`{components.impact-dialog}`): `{colors.surface}` panel with a hairline and 3px corners over the scrim. On phones it is anchored to the bottom edge, full width. On laptops it is centred, at most `{spacing.dialog-max}` wide. It scrolls inside when content exceeds `max-height`, so the buttons stay reachable. Order: title (e.g. "Buchung löschen?"), the "what" line ("Anna Meier · Di 12. Januar, 16:00–17:00") in body, the impact mini row, then the buttons. Buttons: stacked full width on phones, side by side and right-aligned on laptops; destructive (or primary) first, then "Abbrechen" as secondary. Illustrated in [`mockups/key-admin-delete-dialog.html`](mockups/key-admin-delete-dialog.html) (its dark-mode scrim is outdated).
- **Impact mini row** (`{components.impact-mini-row}`): a hairline box inside the dialog. Top line: the affected guest's name and time ("Tom, 17:15:") in name type, followed by the heat-change line. Below in notice type: the consequence ("weniger als 24 h." + the *Anruf nötig* marker, or "bekommt eine Mail."), then "Neuer Hinweis: komm zwischen 16:35 und 16:45." Without an affected booking it holds the single line "Kein Effekt auf andere Buchungen."
- **Call list entry** (`{components.call-list-entry}`): bordered box, `gap` between lines. Line 1: the marker (*Anruf nötig*: 1.5px `{colors.error}` border and text; *optional*: `line-strong` border, muted text), always text, never colour alone. Line 2: time in `slot-time`, then name with the date line ("Heute, Di 12. Januar") muted below. Line 3: the heat-change line. Then the label "NEUER HINWEIS" (section label) over the notice to give in body, then "zuletzt gesagt: …" in muted note type. Last line: the `tel:` link (phone icon, number as text, 44px) at left and the secondary "Angerufen" button at right; they wrap on narrow screens.
- **Reply reminder** (`{components.reply-reminder}`): dashed `line-strong` box with the guest name, "Di 12. Januar, 16:00–17:00 · gelöscht" muted, the email as a `mailto:` link with the mail icon, and the secondary buttons "Text kopieren" and "Erledigt".
- **Count badge** (`{components.count-badge}`): a number in a 1.5px `{colors.text}` box next to the section headings "Anrufliste" and "Antworten". Zero shows "0".
- **Change tag** (`{components.change-tag}`): the text tag "HINWEIS GEÄNDERT" in a 1px `{colors.text}` box. Same form for "ALTER CODE 4711". Text only, never colour.
- **Sub-group label** (`{components.sub-group-label}`): "HEUTE · DI 12. JANUAR", "MORGEN · MI 13. JANUAR" above each day's rows in "Nächste Buchungen". The first label has no top margin.
- **Admin booking row** (`{components.admin-booking-row}`): grid with time range and heat state (icon + label) on line 1, "Tom Brunner · 2 Personen" plus any change tag on line 2, chevron at right spanning both lines. Hairline between rows. When the keybox email went out, a muted "Code 4711" follows the party size.
- **Admin day table** (`{components.admin-day-table}`, laptop only): columns time · name · party · email · mobile · notice · last-told notice · keybox code sent. Header in section label, rows with hairlines, whole row is the link to booking detail.
- **Booking detail** (`{components.booking-detail}`): capped at `{spacing.detail-max}` on laptops. Header: back link to the day ("‹ DI, 12. JANUAR", brand type, 44px), eyebrow "DIENSTAG, 12. JANUAR", heading: the time range ("16:00–17:00"). Then a two-column definition list (`dt` muted body-sm, `dd` body): Name, E-Mail, Handy, Personen, Dauer, Schlüsselmail. Then "Hinweis jetzt" and "Zuletzt gesagt" side by side, each with its state label + icon and notice line; a difference gets the change tag. After a `rule`, "Buchung löschen" as a destructive button, full width on phones, auto width on laptops.
- **Sign-in form**: same text field and primary button as the booking form, one password field, centred column at `{spacing.content-max}`.
- **Block form**: uses the same text field and segmented control specs.
- **Settings card** (`{components.settings-card}`): one `{colors.surface}` card per group, heading in section label `{colors.text}`, fields and notes, then its own secondary "Speichern" at the end. Paired values (Beginn / Ende, Von / Bis, Kürzeste / Längste Zeit) sit in two columns inside the card. Phones stack the cards with `{spacing.section-gap}`. Laptops flow them into two columns up to `{spacing.admin-max}`. Illustrated in [`mockups/key-admin-settings.html`](mockups/key-admin-settings.html).
- **Analytics panel**: question as heading in `{typography.slot-time}`, the one-line reading in `{typography.body}`, then bars as `{colors.text}` blocks with the value printed beside each bar, backed by a real table of the numbers. Cold-start figures use `{colors.cold-start}` plus the snowflake, and hot figures use `{colors.hot}` plus the flame, never colour alone.
- **Footer** (`{components.footer}`): muted links to *So funktioniert's*, *Datenschutz*, *Impressum*, and the admin contact address. Stacked vertically on phones, each 44px high.
- **Focus ring** (`{components.focus-ring}`): 3px `{colors.focus}` outline at 2px offset on every interactive element. Fields use the 2px underline instead.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Code heat state four ways: icon + border style + label + colour | Let colour alone tell hot from cold start or taken from free |
| Solid border = hot, dashed = cold start, hatched band + lock + struck time = taken | Fill rows with tinted backgrounds or gradients |
| Keep taken text on plain background; hatch only in the left band | Let the hatch run behind any text |
| Clock times at weight 300 or heavier; meaning below 16px at 400–500 | Weight 200 for times, labels, notices or notes |
| `line-strong` for every control boundary | `line` as the only edge of a field, segment or button |
| A visible label above every input | Placeholder text as the label |
| One `{colors.primary}` action per screen | Use `primary`, `hot` or `cold-start` for decoration or the active admin tab |
| A dark scrim in dark mode | A light scrim over a dark page |
| 3px corners everywhere | Pills, rounded cards, soft shadows |
| System sans stack, tabular numerals for every time | Web fonts or proportional digits in time columns |
| Every tap target ≥ 44px, heights as minimums | Shrinking cells, fixed heights that clip enlarged text |
| Same look for bookings and blocks on the guest side | Show names, reasons or block types to guests |
| Light and dark from the same token roles | Hard-code a hex outside the frontmatter |
