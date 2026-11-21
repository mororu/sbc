// `/admin/day/{yyyy-mm-dd}` (Story 3.2): the bookings of one day. A date with nothing to show (not a
// season day, no live booking or block, not today) or a malformed one is an admin 404.
import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminDayView } from '#lib/server/admin-day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const view = loadAdminDayView(params.date, getLocale());
	if (!view) error(404);
	return { view };
};
