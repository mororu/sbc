// `/admin` (Stories 3.1, 3.2, 3.4, 3.6): the admin home: the worker warning, the flags, the call
// list ("Anrufliste"), the reply reminders ("Antworten") and the next bookings. The `called` action
// marks a guest called (`calledAction`); `replyDone` marks a reply reminder done (`replyDoneAction`,
// shared with the day view).
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadAdminHome } from '#lib/server/admin-view.ts';
import { calledAction } from '#lib/server/call-action.ts';
import { replyDoneAction } from '#lib/server/reply-action.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ home: loadAdminHome(getLocale()) });

export const actions: Actions = {
	called: ({ request }) => calledAction(request),
	replyDone: ({ request }) => replyDoneAction(request)
};
