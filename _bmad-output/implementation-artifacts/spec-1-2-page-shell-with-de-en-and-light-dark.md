---
title: 'Story 1.2: Page shell with DE/EN and light/dark'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'bc6fa06df9993a84c5cc17fd04e77e83e4ee410a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-sauna-booking-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/` is a bare placeholder: no design tokens, no header, no language or theme switch, no footer, and the footer's target pages do not exist.

**Approach:** Build the guest page shell from DESIGN.md: Lärche colour, typography, spacing and border tokens as CSS custom properties (light + dark); app header with brand, DE | EN switch and theme switch; skip link; footer linking to stub `/info`, `/privacy`, `/imprint`; line icon set; global focus, forced-colours, reduced-motion and reflow rules. Home `/` keeps a placeholder body inside the shell.

## Boundaries & Constraints

**Always:** Every hex value lives only in `src/lib/styles/tokens.css` (frontmatter values of DESIGN.md, exact). All text from `messages/` in DE (informal *du*, Swiss spelling) and EN. `<html lang>` is `de-CH` for `de`, `en` for `en`. Exactly one guest cookie (Paraglide locale cookie, essential, no banner); `localStorage` key `theme` (`light`|`dark`) is the only storage use. Theme applied by an inline `<head>` script before first paint. All links work without JavaScript. Targets ≥ 44×44, focus ring 3 px `--focus` at 2 px offset, never removed. No third-party scripts, fonts or requests.

**Ask First:** Any new runtime dependency; any change to the Paraglide locale strategy; copy that contradicts EXPERIENCE.md.

**Never:** No calendar, date strip or start-time rows (1.4/1.5). No real content on `/info`, `/privacy`, `/imprint` (1.9). No admin contact link in the footer (1.9 adds it with the setting from 1.8). No admin pages. No "follow device" option once a theme is stored. No web fonts, shadows, pills or gradients.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First visit, EN browser | no cookie, `Accept-Language: en` | page in EN, `<html lang="en">` | N/A |
| First visit, other | no cookie, `de`/`fr`/none | page in DE, `<html lang="de-CH">` | N/A |
| Switch language | tap "English" on `/info?x=1` | GET `/lang/en?to=/info?x=1` sets locale cookie, 303 to `/info?x=1` in EN | N/A |
| Unsafe return target | `/lang/en?to=https://evil.example` or `//evil` or missing | cookie set, 303 to `/` | never redirect off-origin |
| Unknown locale | `/lang/fr?to=/` | no cookie change, 303 to `/` | N/A |
| Theme, nothing stored | OS dark | dark tokens, switch pressed | storage throws → follow OS |
| Theme stored | `localStorage.theme='light'`, OS dark | light on first paint, no flash | invalid value ignored |

</frozen-after-approval>

## Code Map

Story 1.1 left: `src/hooks.server.ts` (Paraglide middleware replacing `%paraglide.lang%` in `src/app.html`), `src/routes/+layout.svelte` (bare children), `src/routes/(guest)/+page.svelte` (placeholder `m.placeholder_*`), `messages/{de,en}.json`, Paraglide strategy cookie → preferredLanguage → baseLocale in `vite.config.ts` and the `i18n:types` script. Cookie name and helpers come from `#lib/paraglide/runtime.js` (`cookieName`, `locales`, `isLocale`, `getLocale`). Layer lint: routes and components may not import the db; `src/lib/components` is ordinary app code.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/styles/tokens.css` -- all light colours on `:root`, dark twins under `:root[data-theme='dark']` and `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`; typography roles (UX-DR4) as `--type-<role>-*` vars, spacing/size scale (UX-DR5), radius 3 px / 0 -- the single token file.
- [x] `src/app.css` -- base: `color-scheme`, body background/text, system stack, `tabular-nums` utility, focus ring, `.visually-hidden`, `forced-colors` and `prefers-reduced-motion` rules, ≤150 ms fades elsewhere -- global rules.
- [x] `src/app.html` -- inline theme script in `<head>` (try/catch, sets `data-theme` only for a stored valid value) -- no flash.
- [x] `src/hooks.server.ts` -- map `%paraglide.lang%` to `de-CH`/`en` -- language attribute.
- [x] `src/routes/lang/[locale]/+server.ts` -- GET: valid locale → set Paraglide cookie (path `/`, 1 year, `SameSite=Lax`, `httpOnly: false` as Paraglide reads it client-side), 303 to `to` if it is a same-origin path (starts with `/`, not `//` or `/\`), else `/` -- no-JS language switch.
- [x] `src/lib/components/Icon.svelte` -- 24×24 line icons (flame, snowflake, lock, chevron-left, chevron-right, check, mail, key, phone, sun, moon, error), `currentColor`, round caps/joins, `size: 'row' | 'default'` (17/1.6 vs 20/2), always `aria-hidden` -- icon set.
- [x] `src/lib/components/AppHeader.svelte`, `LanguageSwitch.svelte`, `ThemeSwitch.svelte` -- brand left; "DE | EN" links (`hreflang`, `lang`, accessible names "Deutsch"/"English", `aria-current="true"` on active, href to `/lang/{l}?to={current path+search}`), theme `<button aria-pressed>` "Dunkles Design"/"Dark mode", moon in light, sun in dark, writes `localStorage.theme` and `data-theme` -- header.
- [x] `src/lib/components/SkipLink.svelte`, `AppFooter.svelte` -- skip link "Zu den Zeiten"/"Skip to times" → `#main` (main has `tabindex="-1"`); footer links So funktioniert's · Datenschutz · Impressum, stacked on phones, 44 px high -- shell pieces.
- [x] `src/routes/+layout.svelte`, `src/routes/(guest)/+layout.svelte` -- root imports `app.css` + tokens; guest layout: skip link, header, `<main id="main">` capped at 560 px centred from 600 px, footer -- composition.
- [x] `src/routes/(guest)/+page.svelte`, `info/+page.svelte`, `privacy/+page.svelte`, `imprint/+page.svelte` -- one `h1`, unique `<title>` ending "· Sauna Luegisee" -- home + stubs.
- [x] `messages/de.json`, `messages/en.json` -- all shell strings; drafted copy (EN footer labels, page titles) flagged in README -- i18n.
- [x] `src/lib/styles/tokens.test.ts` -- parse `tokens.css`, compute WCAG contrast: every text role (text, muted, primary, hot, cold-start, taken, error, focus, on-primary on primary, on-error on error) ≥ 4.5:1 and `line-strong` (alpha-composited) ≥ 3:1 against background and surface, both modes; assert no hex colour appears in any other file under `src/` -- contrast + token discipline.
- [x] `src/routes/lang/[locale]/server.test.ts` -- matrix rows for the language route -- redirect safety.
- [x] `README.md` -- contrast table (generated from the test's numbers), theme/language mechanics, list of drafted copy for operator review -- documentation.

**Acceptance Criteria:**
- Given any guest page at 320 px, 200 % text and WCAG text-spacing overrides, when viewed, then nothing is cut off and there is no horizontal page scroll; at ≥ 600 px the column is 560 px max and centred.
- Given keyboard navigation from page load, when Tab is pressed first, then the skip link appears top-left on surface with a line-strong border and Enter moves focus to `main`.
- Given the theme switch, when tapped, then mode flips without reload, `aria-pressed` and icon update, and a reload keeps the choice.
- Given any guest page, when the network log is inspected, then only same-origin requests occur and only the locale cookie is set.

## Design Notes

Theme script (inline, before CSS paints):

```html
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
```

`ThemeSwitch` reads the effective mode on mount (`data-theme` or `matchMedia('(prefers-color-scheme: dark)')`); before hydration the button renders unpressed with both icons hidden by CSS according to `[data-theme]`/media query, so SSR never shows the wrong icon. The CSP hash for this script is an Epic 5 task. `line`/`line-subtle`/`line-strong`/`scrim` are 8-digit hex in DESIGN.md; keep them so, and composite against the background for the contrast test.

## Verification

**Commands:**
- `npm test` -- expected: contrast, token-discipline and language-route tests pass
- `npm run check` and `npm run lint` -- expected: clean
- `npm run build` -- expected: succeeds

**Manual checks:**
- In the browser pane: `/` in light and dark, DE and EN, at 320/360/600/1024 px; Tab to the skip link; reload after choosing dark (no flash); footer links reach the three stubs.

## Suggested Review Order

**Tokens and global rules**

- Entry point: every colour, type role and size; dark twins for the stored choice and the device setting.
  [`tokens.css:7`](../../src/lib/styles/tokens.css#L7)

- The device-dark block must stay identical to the stored-dark block (tested).
  [`tokens.css:165`](../../src/lib/styles/tokens.css#L165)

- Focus ring, reduced motion and forced colours are global, never per component.
  [`app.css:55`](../../src/app.css#L55)

**Theme**

- Runs before first paint; its hash is pinned for the future CSP.
  [`app.html:8`](../../src/app.html#L8)

- Hidden and without aria-pressed until hydrated; syncs across tabs.
  [`ThemeSwitch.svelte:22`](../../src/lib/components/ThemeSwitch.svelte#L22)

**Language**

- No-JS switch: sets the only guest cookie, `no-store`, 303 back.
  [`+server.ts:8`](../../src/routes/lang/%5Blocale%5D/%2Bserver.ts#L8)

- Return target: same-origin paths only, ASCII-safe for the Location header.
  [`locale-switch.ts:7`](../../src/lib/i18n/locale-switch.ts#L7)

- `de` renders as `de-CH` on `<html>` and on the switch links.
  [`hooks.server.ts:19`](../../src/hooks.server.ts#L19)

- The links keep the current path and query.
  [`LanguageSwitch.svelte:16`](../../src/lib/components/LanguageSwitch.svelte#L16)

**Shell composition**

- Skip link first, then header, `main`, footer in a 560 px column.
  [`+layout.svelte:11`](../../src/routes/(guest)/%2Blayout.svelte#L11)

- Theme, language, contrast table and drafted copy for operators.
  [`README.md:42`](../../README.md#L42)

**Tests**

- Contrast floors, colour discipline and the README table.
  [`tokens.test.ts:64`](../../src/lib/styles/tokens.test.ts#L64)

- Inline script behaviour and its CSP hash.
  [`app-html.test.ts:18`](../../src/app-html.test.ts#L18)

- `<html lang>` through the real hook.
  [`hooks.server.test.ts:16`](../../src/hooks.server.test.ts#L16)

- Language route: cookie, cache header and redirect safety.
  [`server.test.ts:26`](../../src/routes/lang/%5Blocale%5D/server.test.ts#L26)
