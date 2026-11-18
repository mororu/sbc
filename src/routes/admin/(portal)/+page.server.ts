// `/admin` (Story 3.1): the admin home. For now only the worker warning; the call list (3.6), the
// replies (3.4) and the next bookings (3.2) fill its columns later.
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminHome } from '#lib/server/admin-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ home: loadAdminHome(getLocale()) });
