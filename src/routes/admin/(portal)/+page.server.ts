// `/admin` (Stories 3.1, 3.2): the admin home: the worker warning, the flags and the next bookings.
// The call list (3.6) and the replies (3.4) fill the left column later.
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminHome } from '#lib/server/admin-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ home: loadAdminHome(getLocale()) });
