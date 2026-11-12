---
title: "Story 1.9: So funktioniert's, privacy statement and Impressum pages"
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'ca1c3d2e18968b2dda0218ad6794d8fb9c999a90'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/info`, `/privacy` and `/imprint` are stubs, and the footer has no admin contact. Guests cannot read how the wagon works, how their data is handled, or who runs it.

**Approach:**
- Replace the stubs with structured pages built from message slots in DE and EN. Each slot holds a placeholder that starts with `[PLATZHALTER]` until the operators supply the text.
- Add the admin contact as a `mailto:` link in the footer of every guest page.
- Provide a helper that lists the slots still holding the placeholder, for Story 5.5.

## Boundaries & Constraints

**Always:**
- **Text lives in `messages/de.json` and `en.json`,** one key per slot. Placeholders start with exactly `[PLATZHALTER]` in both languages. After the marker they may carry drafted factual text (field purposes, 30-day retention after the season ends, no tracking) that the operators can adopt.
- **Pages:** each page has the guest header and footer, one `h1`, a unique `<title>` ("So funktioniert's · Sauna Luegisee", "Datenschutz · Sauna Luegisee", "Impressum · Sauna Luegisee"; EN "How it works", "Privacy", "Imprint", the strings already shipped in Story 1.2) and an `h2` per slot.
  - `/info` has these slots: location, heating (hot vs cold start, lighting the fire), keybox, cancelling (by email to the admins), contact.
  - `/privacy` has these slots: operator contact, the purposes of name, email and mobile, retention, backups (period from Story 5.3), no tracking.
  - `/imprint` has these slots: operator, address, contact, responsible person.
- **Untranslated text:** in English mode, a slot whose EN message is an empty string shows the DE text wrapped in `lang="de"`.
- **Footer:** it shows the admin contact after Impressum, as a `mailto:` link with the address as visible text, 44 px high, muted like the other links. The address is URI-encoded in the href.
  - It is read by a guest layout server load through a query that selects only `admin_contact`.
  - With no address set, the footer shows no contact link.
- **No migration,** and no guest data on these pages.

**Ask First:** Writing real operator text (only placeholders here). Any change to the booking pages.

**Never:**
- No CMS and no admin editing (Epic 3).
- No third-party embeds such as maps or fonts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Info DE | `/info`, locale de | `h1` "So funktioniert's", 5 `h2` slots, each text starting with "[PLATZHALTER]", title "So funktioniert's · Sauna Luegisee" | N/A |
| Privacy EN | `/privacy`, locale en | `h1` "Privacy", 6 slots in EN | N/A |
| Untranslated | EN message of a slot is `""` | that slot shows the DE text inside an element with `lang="de"` | N/A |
| Footer | any guest page, the seeded setting | the last footer item is `<a href="mailto:platzhalter@sauna-luegisee.ch">platzhalter@sauna-luegisee.ch</a>` | N/A |
| No contact | `admin_contact` NULL | no contact link; the page renders | N/A |
| Readiness helper | the current catalogues | `placeholderSlots()` lists every slot key whose DE or EN value starts with `[PLATZHALTER]` | N/A |

</frozen-after-approval>

## Code Map

- `src/routes/(guest)/info/+page.svelte`, `privacy/`, `imprint/` -- the Story 1.2 stubs using `m.info_title()`, `m.stub_body()` and `PageTitle`. Their `h1` styling is the date-heading type.
- `src/lib/components/AppFooter.svelte` -- the three links (44 px, muted, stacked on phones). Add the contact `<li>`.
- `src/routes/(guest)/+layout.svelte` -- renders `AppFooter`. There is no `+layout.server.ts` yet; add one that returns `{ adminContact }`.
- `src/lib/server/db/queries/booking.ts` -- already reads `setting.adminContact` (line ~35). Add `getAdminContact(db = getDb())` in `queries/` and export it.
- `src/lib/server/booked-view.ts` `cancelLine` -- the existing mailto encoding (`encodeURIComponent`, keeping `@`). Reuse it, or move it to a small shared helper.
- `messages/*.json` -- `info_title`, `privacy_title`, `imprint_title` and `stub_body` (remove it). Paraglide `m.key({}, { locale })` gives a specific locale.
- `src/routes/lang/[locale]/server.test.ts`, `src/routes/(guest)/day/[date]/server.test.ts` -- the route-test pattern with mocked env and an in-memory DB.

## Tasks & Acceptance

**Execution:**
- [x] `messages/de.json`, `messages/en.json` -- add the slot keys (`info_location_*`, …) with `[PLATZHALTER]` placeholders, and remove `stub_body` -- the content slots.
- [x] `src/lib/content/pages.ts` (+ test) -- for each page, its ordered slots `{key, heading, text, lang}`, built for a locale with the empty-EN fallback. Also `placeholderSlots()` for Story 5.5 -- one source of the page structure.
- [x] `src/lib/components/ContentPage.svelte` + the three `+page.svelte` -- the title, `h1`, and an `h2` + text per slot, in the tokens' type -- rendering.
- [x] `queries` `getAdminContact`, `src/routes/(guest)/+layout.server.ts`, `+layout.svelte`, `AppFooter.svelte` (+ tests) -- the footer contact link.
- [x] `README.md` -- the slot list, the marker for operators, how to fill a slot (edit the message files), and the empty-EN fallback.

**Acceptance Criteria:**
- Given `npm test`, then a test fails if any slot key lacks a DE or EN entry, or if a placeholder lacks the marker.
- Given a page at 320 px with 200 % text, then there is no horizontal scroll.
- Given `npm run build`, then the client time guard passes.

## Verification

**Commands:**
- `npm test`, `npm run check`, `npm run lint`, `npm run build` -- expected: all clean.

**Manual checks:**
- Open `/info`, `/privacy` and `/imprint` in DE and EN, light and dark, at 360 px. The footer shows the contact link.

## Spec Change Log

- 2026-11-12, implementation:
  - **Trigger:** the spec listed five privacy topics but expected six slots.
  - **Amended in the implementation:** "operator contact" became two slots, `privacy_operator` and `privacy_contact`, mirroring the Impressum.
  - **KEEP:** the slot structure in `PAGES`.

## Suggested Review Order

**Page structure**

- Entry point: one list of slots per page; the empty-EN fallback marks German text with `lang="de"`.
  [`pages.ts:23`](../../src/lib/content/pages.ts#L23)

- Slots still holding the marker or a `[...]` gap, for the launch readiness check.
  [`pages.ts:98`](../../src/lib/content/pages.ts#L98)

- Paragraphs at blank lines, single newlines kept as line breaks.
  [`pages.ts:86`](../../src/lib/content/pages.ts#L86)

**Footer contact**

- The layout load reads the admin contact and degrades to none if the read fails.
  [`+layout.server.ts:17`](../../src/routes/(guest)/+layout.server.ts#L17)

- The footer's last item: a mailto link with a hidden "Kontakt:" label.
  [`AppFooter.svelte:10`](../../src/lib/components/AppFooter.svelte#L10)

**Docs**

- How operators fill a slot, and the drafted copy for review.
  [`README.md:268`](../../README.md#L268)
