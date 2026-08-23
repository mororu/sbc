---
title: "Architecture Inputs — Sauna Booking Calendar"
status: notes
created: 2026-08-23
updated: 2026-08-23
purpose: Handoff for the next session. Inputs to bmad-architecture, not the architecture itself.
---

# Architecture Inputs — Sauna Booking Calendar

Working notes carried out of the product-brief session. **This is not the architecture
document.** `bmad-architecture` will produce `architecture.md` in this folder; this file
is the raw material it should consume, plus the state of play so the next session can
start cold.

---

## 1. Where things stand

| | |
|---|---|
| Repo | `github.com/mororu/sbc`, cloned to `/Users/manuelagner/Documents/webs/sauna-booking` |
| BMAD | v6.11.0, modules `core` + `bmm`, 49 skills in `.claude/skills` |
| `uv` | Installed (0.12.5, Homebrew). BMAD scripts need it |
| Product brief | **Final** — `_bmad-output/planning-artifacts/briefs/brief-sauna-booking-2026-08-23/brief.md` |
| Addendum | Same folder — Baldegg teardown, rejected alternatives, open questions |
| Memlog | Same folder, `.memlog.md` — 56 entries, full decision trail |
| Next BMAD step | `bmad-prd`, then `bmad-ux` (UI-heavy), then `bmad-architecture` |

Optional BMAD modules not installed: `bmb`, `cis`, `tea`. Add with
`npx bmad-method install --modules bmm,tea --tools claude-code`.

---

## 2. The core rule, stated precisely

Everything distinctive about this product follows from one definition. Get it wrong and
the feature is wrong.

> **A slot is HOT if and only if the slot immediately preceding it is booked.
> Otherwise it is a COLD START.**

Consequences that fall out of it, all confirmed with the user:

- **Gaps do not count as warm.** Booked 17:00, empty 18:00, booked 19:00 → 19:00 is a
  cold start, even though the wagon is probably still warm. Deliberately conservative:
  the rule may tell someone to bring matches unnecessarily, never the reverse.
- **Blast radius of any change is exactly one booking** — the slot immediately after the
  one that changed. No cascade, no week-wide recalculation.
- **Heat state is derived, never stored as truth.** It is a function of neighbouring
  bookings and changes when they do. What *is* stored is the last state each guest was
  *told*, which is what makes anti-flap notification possible.
- **A cold start grants a free 30–40 minute pre-heat window** before the booked time.
- Cold-start counts are the proxy for fires lit, which is how the analytics estimate
  wood consumption. The feature and the metric share one computation.

### Notification rules

| Condition | Behaviour |
|---|---|
| State changes, > 24h before slot | Automatic email to the one affected guest |
| Hot → cold | Always sends. Urgent: they must now arrive early and light the fire |
| Cold → hot | Good news, lower priority |
| State differs from what that guest was last told | Precondition for sending at all — prevents flapping when someone books and cancels repeatedly |
| State changes, < 24h before slot | Email is too slow. Admin portal flags it; an admin **phones** the guest. This is the sole justification for collecting the mobile number |
| At T-24h | Keybox email goes out carrying the **authoritative** heat state at that moment. The booking confirmation only states how things stood at booking |

---

## 3. Hosting — OPEN

Two candidates. Not decided.

**Option A — share the existing Infomaniak VPS Lite** (1 vCPU, 2 GB RAM, 20 GB disk)
that runs beehiveJournal. Runtime headroom is genuinely fine: measured budget is
~550–800 MB for OS + Docker + nginx + both Node apps, leaving over 1 GB free. Both apps
are effectively zero-concurrency. **RAM is not the constraint; disk and build are.**

**Option B — a separate VPS for the sauna app.** Removes every shared-tenancy constraint
below and isolates the blast radius. Costs money.

### Constraints that apply ONLY under Option A

- **The sauna app cannot ship its own nginx.** beehiveJournal's compose binds `80:80`
  and `443:443`; a second nginx cannot. The sauna app must be added as a server block in
  the *existing* nginx with its own hostname and its own cert via the existing certbot.
- **The app container must not publish a port.** `expose: 3000` on the internal bridge
  only, matching beehiveJournal's NFR9.
- **Do not build both apps on the box.** `docker compose build` runs `npm ci` with full
  devDependencies plus a native compile of `better-sqlite3` and `argon2`. That is the
  peak memory event on a 1 vCPU / 2 GB machine, and an OOM during a sauna deploy can
  take down the *working* beehive app. Add a 2 GB swapfile at minimum; better, build in
  CI and have the VPS only pull images.
- **Disk is already under pressure** — see §6.

### Constraints that apply either way

- Season is October–April, so the app sits idle roughly five months a year. Whatever is
  rented should be sized for a quiet box, not a busy one.
- Backups must leave the machine. A booking database whose only copy is on the VPS is
  one dead VPS away from "who is coming on Saturday?" being unanswerable.

---

## 4. Recommended stack: mirror beehiveJournal

Not a decision — a strong default for `bmad-architecture` to accept or argue with.

| Layer | Proposal | Why |
|---|---|---|
| Framework | SvelteKit + `adapter-node` | Proven on the neighbouring project; small bundles matter for a cold phone on 4G at a lake |
| Database | SQLite + Drizzle ORM | A few hundred rows per season. No DB server process — the single biggest reason two apps fit on 2 GB |
| Auth (admin) | One shared account, shared password | Explicitly chosen in the brief. Guests never authenticate |
| Proxy / TLS | nginx + certbot | Shared under Option A, own under Option B |
| Container | Multi-stage Docker, non-root, named volume for data | Copy beehiveJournal's Dockerfile shape |

The marginal cost of a second app in this shape is roughly 120 MB RAM and a few hundred
MB of disk. Reusing the stack also inherits a written runbook, a backup script, and a
deployment pattern already debugged in production.

### New infrastructure this app needs that beehiveJournal does not

- **Outbound SMTP.** Confirmation, T-24h keybox mail, and heat-change notifications must
  actually arrive. Use Infomaniak SMTP or a transactional provider. Do not run a mail
  server. **Verify whether outbound port 25 is blocked on the plan.**
- **A scheduler.** Something fires the T-24h keybox email and evaluates pending
  heat-state changes. Host cron hitting an authenticated endpoint matches how certbot
  renewal and backups already run. A settle delay before sending is what implements the
  anti-flap rule.
- **Internationalisation from day one.** German default, English alongside, across UI,
  emails and keybox instructions. Retrofitting i18n is painful — pick the approach at
  architecture time, not later.

---

## 5. Data model sketch

Enough to argue with, not a schema.

- `booking` — start, duration (60–180 min, 30-min steps), guest name, email, mobile,
  party size (≤ 6), created_at, `last_notified_heat_state`
- `block` — admin-created unavailability: start, end, reason (cleaning / maintenance /
  private). Blocks are **not** bookings and must not count as "preceding slot booked"
  for heat purposes — a cleaning block does not heat the sauna. *(Flagged: needs an
  explicit decision. A private-use block arguably does.)*
- `setting` — configurable booking horizon (default 14 days), season start/end,
  pre-heat window minutes, admin credentials
- Heat state: **computed**, never a stored column. Only `last_notified_heat_state` is
  persisted, and only to suppress duplicate notifications.

Exclusive whole-wagon booking, so no per-seat inventory. One location only — the wagon
is on wheels but nothing in v1 models a second site.

---

## 6. Lesson from beehiveJournal — do not repeat

Reviewed at `/Users/manuelagner/Documents/webs/beehiveJournal` during this session. Two
individually-correct decisions combined into a live problem, and it is worth carrying the
pattern forward as a warning:

Photos are stored as BLOBs inside `db.sqlite` (so the single file stays the complete
backup artefact), while `scripts/backup.sh` retains **30 full copies** of that file in
`/data/backups` — on the same volume, on the same 20 GB disk. Disk therefore holds
`31 × database size`. The architecture doc sized the DB at under 5 MB, where 30 copies is
150 MB and entirely sensible; the photos feature invalidated that assumption and
retention was never revisited. The DB can reach roughly **450 MB** before the disk fills,
after which SQLite writes fail and `backup.sh` dies on `set -e` — losing the app and its
backups together.

**Owner decided to leave it for now** (2026-08-23), partly because a separate VPS may
make it moot.

The transferable rule: **a retention policy is an assumption about data growth.** When a
feature changes how fast data grows, the retention policy is part of that feature's
blast radius. The sauna app stores little, but the same trap appears the moment anyone
suggests photos of the wagon.

---

## 7. Open questions to resolve in the PRD

Carried from `addendum.md`, plus what this session added:

- **Wood supply** — who buys and stocks it; whether guests replace what they burn. The
  analytics estimate consumption but nothing says who acts on the number.
- **Cleaning** — who, how often, scheduled ahead or reactive to booking patterns.
- **The admins** — how many neighbours; whether one shared password survives a change of
  season or of people.
- **No-shows** — accepted for winter one. No deposit, no penalty, no tracking. Revisit
  with data.
- **Data retention** — names, emails and phone numbers accumulate all season. Swiss data
  protection expects a stated retention period and a reason per field. The mobile
  number's stated reason is the inside-24-hours phone call; nothing yet says when any of
  it is deleted.
- **Do admin blocks affect heat state?** Cleaning almost certainly does not heat the
  wagon; a private-use block probably does. Needs deciding — it changes the core rule.
- **Hosting** — Option A or B (§3).
