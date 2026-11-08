# Spine Pair Review — Sauna Luegisee

## Overall verdict

The pair is a usable contract. A developer can pull tokens, copy, components and flows out of it cleanly. Every clock time, heat state and arrival range in the worked examples checks out against the PRD §4 rules, and the colour contrast claims are accurate. There are no critical findings. The one high finding is a wrong domain rule: the duration preselect assumes 60 minutes always fits. Most of the remaining work is on the admin side, which is less specified than the guest side: admin navigation, confirm labels in the impact dialog, and failure states. Two non-text contrast gaps in DESIGN.md should also be fixed before build.

## 1. Flow coverage — strong

Checked that UJ-1 to UJ-5 from PRD §3.3 each have a Key Flow with the same name, a named protagonist, numbered steps, a climax beat and a failure, quiet or empty path. All five are present. Every worked example was recomputed with a 15-minute changeover and a 30–40-minute pre-heat window:

- UJ-1: 18:00 cold start → 17:20–17:30. After 17:00–18:00 is booked: 18:00 is refused, 18:15 is hot, and 18:30 is clamped. Earliest arrival 18:15 is later than latest 18:00, so the notice is the single time 18:15 with "Nur 15 Minuten". Correct. 90 minutes from 18:00 ends at 19:30. Correct.
- UJ-2: 18:30 with 16:00–17:00 before it gives 17:50–18:00 (the 17:15 clamp is not binding). The 17:15 start is hot. 17:15 + 60 min ends 18:15, and 18:15 + 15 min makes 18:30 back to back. On Thursday the impact is emailed because it is more than 24 h before the start. Correct.
- UJ-3: 10:00 gives 09:20–09:30. The keybox email arrives Sat 16 January 10:00 for Sun 17 January. Weekdays check out for 2027. Correct.
- UJ-4: deleting 16:00–17:00 turns Tom's 17:15 cold → 16:35–16:45. It is under 24 h, so the keybox email has already gone and the booking moves to the call list. In the failure path, rebooking 16:00 makes 17:15 hot again, so the entry leaves the list. Correct.
- Voice/email tables: the confirmation for 18:00 sends the keybox email Mon 11 January 18:00. A booking ending 17:30 before an 18:00 start → "Nur 15 Minuten … 17:45". The urgent 18:30 → 17:50–18:00 example and the later-earliest 18:00 → 17:25–17:30 example (for example a block ending 17:25) are also right. The a11y labels match. Tue 12 January 2027 is correct.

### Findings

- **[low]** Step numbering restarts at the climax in four flows: UJ-1 (…6 then "4. Climax", EXPERIENCE.md:244), UJ-2 (…4 then "2.", :254), UJ-4 (…7 then "5.", :276), UJ-5 (…5 then "3.", :287). Markdown renders these fine, but story citations such as "UJ-1 step 4" become ambiguous. *Fix:* renumber the steps in order.
- **[low]** The anti-pattern line calls "18:30: komm zwischen 17:50 und 18:00" wrong (EXPERIENCE.md:304), but UJ-2 uses the identical arithmetic correctly. A reader could take the rule itself to be wrong. *Fix:* give the reason. In the mock, 17:45 "nur 60 Min." implies a booking at 19:00, so 18:30 could not be offered at all. If 17:15 were booked for 60 minutes, 18:30 would be hot.

## 2. Token completeness — adequate

Checked every frontmatter token and every `{path}` reference in both spines. All resolve. Every colour role has a hex value and a `-dark` twin. The contrast table was recomputed and matches within 0.1. Every text role meets AA in both modes.

### Findings

- **[medium]** `line` is the only visible boundary for text fields (underline) and for the segmented control outline (DESIGN.md:252, :238). It measures 1.37:1 in light and 1.66:1 in dark against `background`. That is below the WCAG 1.4.11 minimum of 3:1 for component boundaries. The Colors table labels `line` "decorative" (DESIGN.md:366), but here it carries information. *Fix:* add a `line-strong` token (≥ 3:1, for example near `muted`) for field underlines and segment outlines. Keep `line` for true hairlines.
- **[medium]** On taken rows, the hatch runs behind the text. Where a stripe sits under it, `taken` text drops to 3.8:1 (light) and 3.2:1 (dark). The time is also weight 200, 18px and struck through (DESIGN.md:219–225). *Fix:* keep the hatch out of the text area (for example, hatch only in a side band or behind a `background` label chip), or raise the taken-time weight to 400.
- **[low]** Several values are not tokens or do not resolve:
  - Confirmation badge "15px" (DESIGN.md:397) conflicts with `badge-type: {typography.button}` (16px).
  - Analytics heading uses "`summary-time` scaled to 26px" (:463); `slot-time` already has that size.
  - The scrim is `'{colors.text} at 40 %'` (:308).
  - Raw px paddings appear where spacing tokens exist.

  *Fix:* use `slot-time`, add a `scrim` colour token, and drop the 15px exception.

## 3. Component coverage — adequate

Cross-checked the 28 components in DESIGN.md Components against the 25 rows in EXPERIENCE.md Component Patterns. Guest components are fully covered on both sides, with real rules.

### Findings

- **[high]** The duration control preselects 60, which the spine claims "always fits" (EXPERIENCE.md:152; Open Item 2). Under PRD §4, a start time that is only of the third kind is offered *only* with the duration that ends one changeover before the next booking. For example, 17:15 before a 19:00 booking is offered only for 90 minutes (FR-2). In that case 60 is a disabled option, and preselecting it is a bug a developer would ship. *Fix:* preselect the shortest offered duration, which is the single offered duration on a third-kind-only start time. Correct the assumption text.
- **[medium]** The impact dialog's confirm action is hard-coded as "Buchung löschen" (destructive, EXPERIENCE.md:164). The same dialog also serves block save, block delete and the pre-heat-window save. The supporting flow uses "Block speichern" (:293), and DESIGN.md:451 limits the destructive button to this dialog. *Fix:* add a small table per trigger giving the confirm label, the button style and the title. For example: delete booking → "Buchung löschen" (destructive); save block → "Block speichern" (primary or secondary).
- **[medium]** Neither spine specifies admin navigation: the top bar, the 44px tab row on phones, and the count badge on "Übersicht" (EXPERIENCE.md:43, :167). Every admin page uses it. The laptop "Bookings by day as a table" (:228) also has no visual spec. *Fix:* add *Admin nav* and *Admin day table* to DESIGN.md Components and to Component Patterns.
- **[low]** Names drift between the files:
  - "Text field" (DESIGN) vs "Booking form (text fields)" (EXPERIENCE).
  - Separate secondary and destructive buttons in DESIGN vs one merged row in EXPERIENCE.
  - The focus ring has no Component Patterns row.
  - The "Lädt …" loading line and the "Hinweis geändert" tag have no visual spec.

  *Fix:* align the names and add one-line specs.

## 4. State coverage — adequate

Walked every IA surface. The guest day view, booking form and confirmation are thorough: season states, the conflict, the too-little-heat case, an arrival time already past, and network failure. The admin surfaces are thinner.

### Findings

- **[medium]** The heat-change case "latest arrival now earlier" (PRD §4 Heat change) is not handled anywhere. It arises when the shorter end of the pre-heat window is raised. It has no email copy, no call-list marker rule, and the settings impact text only says "spätere früheste Ankunft" (EXPERIENCE.md:169). *Fix:* treat it like a later earliest arrival: urgent email or *Anruf nötig*, using the "neue Ankunftszeit" copy. Raise it to the PM as a PRD gap, because FR-12 and FR-13 classify only two cases.
- **[medium]** There is no failure state for admin actions: Delete, Angerufen, Erledigt, Speichern and saving a block, when the request fails. Concurrent outcomes between admins sharing one account are also missing, for example a booking already deleted by another admin or a reminder already marked done. *Fix:* add State Pattern rows covering an inline error, the item left unchanged, and a refreshed view with a "schon erledigt" or "gibt es nicht mehr" line.
- **[low]** Smaller gaps:
  - Booking form opened (stale tab, Back) for a start time that is already taken or past.
  - `/booked/{id}` revisited later.
  - Empty blocks list.
  - "Gespeichert" confirmation after a settings save.
  - A `mailto:` on a laptop with no mail program set up. Showing the address as copyable text would cover it.

  *Fix:* one row each.

## 5. Visual reference coverage — adequate

`mockups/` and `imports/` are empty (admin mocks are being rendered in parallel, so this is not a finding). Inline links to `.working/color-themes-1.html` and `.working/directions-1.html` resolve: DESIGN.md:348 and EXPERIENCE.md:299–300. Both say what they illustrate (variation 2 / direction B only).

### Findings

- **[low]** EXPERIENCE.md links the Fjord screens only under Inspiration, not at the surfaces they show (the day view, booking form and confirmation rows in IA). "Spine wins on conflict" is stated three times (DESIGN.md:348, EXPERIENCE.md:13, :300). Open Items line 332 ("Key-screen mocks … do not exist yet") will go stale when the admin mocks land. *Fix:* add a "→ Composition reference" line under the guest IA. Once the admin mocks exist, link them under the admin IA and remove the Open Item. State spine-wins once.

## 6. Bloat & overspecification — adequate

The large Voice and Tone section earns its place: it is the copy contract that NFR-10 asks for. The EXPERIENCE prose stays neutral.

### Findings

- **[low]** DESIGN.md repeats the full system font stack 22 times in the frontmatter. The Typography table and the Components prose restate every frontmatter number, for example "padding 16 / 14" and "500 · 13px · +0.06em". If the two copies drift, there is no rule for which one wins. *Fix:* have the table and prose cite token names only. Optionally hoist the font stack into a single documented family.

## 7. Inheritance discipline — adequate

The `sources` resolve (the PRD, and the brief at `briefs/brief-sauna-booking-2026-08-23/brief.md`). UJ names match the PRD verbatim. Glossary terms are used correctly. Every EXPERIENCE token reference (`{components.focus-ring}`, `{colors.focus}`, `{spacing.*}`) resolves in DESIGN.md.

### Findings

- **[medium]** The heat-change email subjects carry no date. Examples: "Gute Nachricht: um 18:30 ist es schon heiss", "Wichtig: Kaltstart um 18:30 …", "Wichtig: neue Ankunftszeit für 18:00" (EXPERIENCE.md:126–128). The confirmation and keybox subjects both include the weekday and date. NFR-3 requires emails to state clock times and dates, and a guest with two bookings cannot tell which one changed. *Fix:* add "Sa 16. Januar" (weekday + date) to every heat-change subject and key line.
- **[low]** Smaller inheritance slips:
  - UJ-4 step 6 says "the deleted 16:00 slot" (EXPERIENCE.md:274), a term the spine bans itself (:136).
  - DESIGN.md:454 gives the confirmation copy as "Kaltstart · komm zwischen …", which differs from the canonical EXPERIENCE copy.
  - The call-list exit conditions (:166) omit "booking deleted" (FR-18).
  - `sources` omits the brief addendum and architecture-inputs.md, which the memlog lists as run sources.

  *Fix:* align each one.

## 8. Shape fit — strong

DESIGN.md sections follow the canonical order. EXPERIENCE.md has every required default. Responsive & Platform is present, which the two-device admin rule triggers. Inspiration & Anti-patterns is present, which the picked and rejected directions trigger. The invented Open Items section earns its place by gathering the `[ASSUMPTION]` tags. No findings.

## Mechanical notes

- Duplicate step numbers appear in UJ-1, UJ-2, UJ-4 and UJ-5 (see §1).
- Frontmatter: EXPERIENCE uses `title` where the examples use `name`. DESIGN.md has no `sources`, which the spec does not require. Both carry `status: draft`.
- Name pairs to align: Text field ↔ Booking form (text fields); Secondary / Destructive button rows; the App header + language switch row.
- Copy drift: the confirmation badge text differs between DESIGN.md:454 and EXPERIENCE.md:83.
- No Mermaid diagrams.
- Both `.working/` links resolve.
