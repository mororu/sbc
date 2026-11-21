# Admin portal routes (Epic 3)

Every `/admin` route except `/admin/login` is guarded in `src/hooks.server.ts` (AD-10, Story 3.1): no page checks the session alone, and an unauthenticated request is redirected to sign-in before any route code runs.

- `login/`: the sign-in form (no shell, its own 560 px column).
- `logout/+server.ts`: POST only; ends the session.
- `(portal)/`: every signed-in page. `+layout.*` is the admin shell (header, nav with the call and reply badges); `+page.*` is the admin home (worker warning, flags, next bookings); `+error.svelte` is the admin 404 inside the shell.
- `(portal)/day/+page.server.ts`: `/admin/day` redirects to the default day (Story 3.2).
- `(portal)/day/[date]/`: the bookings of one day; an unknown or malformed date is an admin 404.
- `(portal)/booking/[id]/`: a live booking's detail; an unknown, deleted or malformed id is an admin 404.

New admin pages go under `(portal)/`. Nav hrefs live in `src/lib/admin-nav.ts`. Reads go through `#lib/server/db/queries`, writes through `#lib/server/commands`. Row ids and guest data appear only here, and guest data only in `mailto:`/`tel:` links.
