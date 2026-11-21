# Admin portal routes (Epic 3)

Every `/admin` route except `/admin/login` is guarded in `src/hooks.server.ts` (AD-10, Story 3.1): no page checks the session alone, and an unauthenticated request is redirected to sign-in before any route code runs.

- `login/`: the sign-in form (no shell, its own 560 px column).
- `logout/+server.ts`: POST only; ends the session.
- `(portal)/`: every signed-in page. `+layout.*` is the admin shell (header, nav with the call and reply badges); `+page.*` is the admin home (worker warning, flags, "Antworten" with the reply reminders, next bookings); `+error.svelte` is the admin 404 inside the shell.
- `(portal)/day/+page.server.ts`: `/admin/day` redirects to the default day (Story 3.2).
- `(portal)/day/[date]/`: the bookings of one day, with that day's open reply reminders at the top (Story 3.4); an unknown or malformed date is an admin 404.
- `replyDone` action on `(portal)/` and `(portal)/day/[date]/` (Story 3.4, shared `#lib/server/reply-action.ts`): posts `bookingId` to `markReplyDone`, the only writer of `reply_done_at`: `{ done: true }`, `fail(409, { code: 'already_done', bookingId })` for `conflict`/`not_found`, `fail(503, { code: 'failed', bookingId })` on a lock timeout, an admin 404 for a missing or malformed id.
- `(portal)/booking/[id]/`: a live booking's detail with "Buchung löschen" and the impact dialog (Story 3.3), or "Diese Buchung gibt es nicht mehr." for a deleted one; an unknown or malformed id is an admin 404. Its `delete` action posts the impact token to `deleteBooking`: 303 to the booking's day, or `fail(409 | 410 | 503, { code })` for `stale`/`past`, `not_found` and a lock timeout.

New admin pages go under `(portal)/`. Nav hrefs live in `src/lib/admin-nav.ts`. Reads go through `#lib/server/db/queries`, writes through `#lib/server/commands`. Row ids and guest data appear only here, and guest data only in `mailto:`/`tel:` links.
