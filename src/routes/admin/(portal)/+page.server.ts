// `/admin` (Stories 3.1, 3.2, 3.4): the admin home: the worker warning, the flags, the reply
// reminders ("Antworten") and the next bookings. The call list (3.6) joins the left column later.
// The `replyDone` action marks a reply reminder done (`replyDoneAction`, shared with the day view).
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminHome } from '#lib/server/admin-view.ts';
import { replyDoneAction } from '#lib/server/reply-action.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ home: loadAdminHome(getLocale()) });

export const actions: Actions = {
	replyDone: ({ request }) => replyDoneAction(request)
};
