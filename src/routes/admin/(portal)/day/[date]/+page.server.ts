// `/admin/day/{yyyy-mm-dd}` (Stories 3.2, 3.4): the bookings of one day, with the open reply
// reminders of that day's deleted bookings at the top. A date with nothing to show (not a season
// day, no live booking or block, not today) or a malformed one is an admin 404.
// The `replyDone` action marks a reply reminder done (`replyDoneAction`, shared with the home).
import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminDayView } from '#lib/server/admin-day-view.ts';
import { replyDoneAction } from '#lib/server/reply-action.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const view = loadAdminDayView(params.date, getLocale());
	if (!view) error(404);
	return { view };
};

export const actions: Actions = {
	replyDone: ({ request }) => replyDoneAction(request)
};
