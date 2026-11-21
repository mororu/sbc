// `/admin/booking/{id}` (Story 3.2): a live booking's detail. An unknown, deleted or malformed id is
// an admin 404.
import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminBookingView } from '#lib/server/admin-day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const view = loadAdminBookingView(params.id, getLocale());
	if (!view) error(404);
	return { view };
};
