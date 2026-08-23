---
title: "Product Brief: Sauna Booking Calendar"
status: final
created: 2026-08-23
updated: 2026-08-23
---

# Product Brief: Sauna Booking Calendar

## Executive Summary

A group of neighbours rebuilt an old worksite container on wheels into a wood-fired
sauna. Each winter, from October to April, the wagon is parked at the public swimming
place on the lake shore and opened to anyone who wants to use it. What it lacks is a way
for people to claim a slot without a group chat and a lot of goodwill.

This product is the booking calendar for that wagon: a mobile-first page where anyone can
see the coming weeks, reserve the whole wagon for up to six people, and receive a keybox
code the day before. Anything to do with payment stays outside the app.

Its one real idea is that **the calendar knows whether the sauna will be hot.** A wood
stove takes 30–40 minutes to come up from cold, and whoever arrives to a cold wagon has
to light it. Because the calendar knows which slots are already taken, it can tell each
guest which situation they are walking into — *"nobody before you, come 30 minutes early
and fire it up"* or *"already hot at 18:00"* — instead of leaving them to work it out
from a grid. That same signal, gathered over a season, is what tells the neighbours how
much wood they are burning, when to clean, and whether to do it again next year.

## The Problem

A sauna on a public shore is a scarce resource with no gatekeeper. Without a shared
calendar, claiming a slot means asking around, and people turn up to find the wagon
occupied or stone cold.

The cold start is the sharper problem. A wood sauna is not a light switch. The first
guest of the day lights the fire and waits; everyone after them walks into a hot room a
stranger heated. If nobody can tell in advance which of those two evenings they have
booked, the outcome is predictable: guests arrive expecting warmth, find a cold box,
blame the sauna, and stop coming. Meanwhile nobody volunteers for the first slot, so the
fire never gets lit at all.

Existing tools do not help here. Generic schedulers sell time; they have no concept of a
resource that stays warm after the previous booking ends.

## The Solution

A single mobile-first page showing availability for the coming weeks, with every slot
labelled by its heat state — a cold start with its free pre-heat window, or already hot
because the slot before it is taken. Booking takes a name, an email and a phone number,
reserves the whole wagon exclusively for up to six people, and sends a keybox code 24
hours ahead. The emailed code doubles as proof the address was real: no code, no sauna.

Heat state is not fixed at booking. A later booking can turn someone's cold start warm,
and a cancellation can do the reverse — so the app tells the affected guest when it
changes. Only one guest is ever affected: a slot counts as hot if and only if the slot
directly before it is taken, so a change ripples exactly one booking forward and no
further. Gaps do not count as warm. An empty hour between two bookings reports the later
one as a cold start even though the wagon is probably still warm — the rule errs toward
telling people to bring matches, never the other way.

Behind it, an admin portal for the neighbours who run the wagon: block out slots for
cleaning, maintenance or private use, remove bookings, and see what the season actually
did.

## Who This Serves

**Guests** — anyone at the lake who wants a sauna, most of them on a phone, in the cold,
deciding tonight. They need to know when they can go and what they will find when they
get there. They will not create an account.

**The neighbour-operators** — the handful of people who built the wagon, keep it stocked
and clean it. They run this in their spare time. They need to carve out slots when the
wagon is unavailable, and enough evidence at the end of winter to decide whether next
season is worth it.

## Analytics: Four Questions

The analytics exist to answer four specific questions, not to fill a dashboard:

1. **When should we clean?** — bookings by day and week, so the block lands on a quiet morning.
2. **How much wood are we burning?** — cold starts are a proxy for fires lit, a by-product of the heat-state feature.
3. **Is this worth repeating next winter?** — unique guests, repeat rate, slots left empty.
4. **Are empty slots empty because nobody wants them, or because they are cold starts nobody will take?** — the test of whether the headline feature works.

## Scope

**In, for the first winter:**

- Public booking page, mobile-first, **German by default with English alongside** — app, emails and keybox instructions alike
- A season running October to April
- Availability for the coming weeks with a heat state shown on every slot, and a 30–40 minute free pre-heat window offered on every cold start
- Booking of the whole wagon: 1 to 3 hours in 30-minute steps, up to six people
- Name, email and mobile number per booking
- Booking horizon configurable, defaulting to 2 weeks ahead
- Confirmation email on booking; keybox code emailed 24 hours before the slot, carrying the authoritative heat state at that moment
- Automatic email to the one affected guest when their heat state changes more than 24 hours out — always for hot-to-cold, which obliges them to arrive early and light the fire. It fires only when the state differs from what that guest was last told, so repeated booking and cancelling cannot spam them
- Inside 24 hours email is too slow: the admin portal flags the affected guest and an admin phones them. This is what the mobile number is for
- Admin portal on a single shared account: block slots for cleaning, maintenance and private use; delete bookings; see the contact details of guests a change affects
- The four analytics questions above

**Out, deliberately:**

- **Payment of any kind.** Handled outside the app.
- **Guest self-service cancellation.** In the first winter a guest emails the admins and an admin deletes the slot. Telling the next guest their sauna just went cold is the app's job, not the admin's — unless the slot is less than 24 hours away, in which case it is a phone call.
- **A per-person booking limit.** Wanted later, configurable. It needs verified identity at booking time to mean anything, which is why the email address is captured from day one.
- **Guest accounts.**

## Success Criteria

- The fire gets lit: on days with bookings, the first guest turns up and heats the wagon. The app cannot observe this — it is here because it is the outcome that matters, and it will be judged by whether anyone complains.
- Nobody is surprised by a cold sauna they did not expect.
- Cold-start slots still get booked — if they sit empty all winter, the headline feature has not worked.
- Booking a slot on a phone, outdoors, takes under a minute.
- In April the neighbours can answer "again next year?" from the admin portal rather than from memory.
