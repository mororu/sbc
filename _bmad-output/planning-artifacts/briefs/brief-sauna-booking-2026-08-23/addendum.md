---
title: "Addendum: Sauna Booking Calendar"
status: draft
created: 2026-08-23
updated: 2026-08-23
---

# Addendum

Depth that belongs downstream (PRD, architecture) rather than in the brief.

## Reference Comparable: Seesauna Baldegg

<https://www.seesaunabaldegg.ch/> — a wood-fired sauna wagon on the Baldeggersee shore.
Near-identical concept, already operating, and the source of several decisions here.

| Aspect | Baldegg | This project |
|---|---|---|
| Booking unit | Exclusive private use, up to 6 people | Same |
| Durations | 1h / 1.5h / 2h / 2.5h / 3h | Same ladder |
| Heating | Guests light it themselves | Same |
| Cold start | "If nobody was there before you, come 30–40 min early and fire it up" — a static sentence; the guest works out whether it applies | **Computed per slot and shown in the UI**, plus notification when it changes |
| Access | Keybox, code and instructions emailed 24h ahead | Same |
| Payment | CHF 35–90 by duration, Twint or cash on site | Outside the app; the brief takes no position |
| Season | Ends 10 March | October to April |
| Software | SuperSaas, off the shelf | Custom |

The cold-start rule is the single most valuable thing taken from Baldegg. The difference
is where the thinking happens: they put the rule in prose and leave the guest to apply
it; here the calendar applies it and says the answer out loud.

## Rejected and Deferred Alternatives

**A distinct "fire slot" booking type.** Considered making the first slot of each day a
separate, longer, explicitly-labelled product so that lighting the fire reads as a perk
rather than a chore. Dropped in favour of Baldegg's simpler mechanic: a free pre-heat
window granted automatically to whoever has a cold start. Same effect, no second booking
type, no pricing tier to explain.

**An explicit email verification token at booking.** Unnecessary in v1: the keybox code
arrives by email 24 hours ahead, so a fake address yields no code and no sauna. The code
delivery *is* the verification. This stops being sufficient the moment a per-person
booking cap exists, because a hoarder can block slots with junk addresses without ever
needing to get in — at that point verification must move to booking time.

**A per-person booking cap.** Wanted, configurable, deferred past v1. The reason the
email address is captured from day one: a cap cannot be retrofitted onto a season of
anonymous bookings.

**Guest self-service cancellation.** Deferred. First winter runs on email to the admins
plus manual deletion. Worth revisiting once there is evidence of how often people
actually cancel.

## Open Questions for the PRD

- **Wood supply** — who buys and stocks it, where it lives, and whether guests are
  expected to replace what they burn. Analytics estimate consumption from cold-start
  counts, but nothing says who acts on that number.
- **Cleaning** — who does it, how often, and whether the admin block is scheduled ahead
  or reactive to the booking pattern.
- **The admins** — how many neighbours, and whether one shared password stays adequate
  as the group grows or changes between seasons.
- **No-shows** — accepted as a fact of life for the first winter. No deposit, no penalty,
  no tracking. Revisit with a season of data.
- **Wagon relocation** — the sauna is on wheels and sited seasonally. Nothing in v1
  models more than one location, which is correct for now and a known limit if a second
  site ever appears.
- **Data retention** — names, emails and phone numbers accumulate across a season.
  Swiss data protection expects a stated retention period and a reason for each field.
  The phone number's stated reason is the inside-24-hours phone call.
