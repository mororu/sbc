// `/admin/booking/{id}` (Stories 3.2, 3.3): a live booking's detail with its delete dialog, or the
// gone view of a deleted one. An unknown or malformed id is an admin 404.
// The `delete` action (FR-18) posts the impact token the dialog showed to the delete command, which
// recomputes it: success is a 303 to the booking's day; `stale` and `past` are 409, `not_found` 410,
// a lock timeout 503 ("Das hat nicht geklappt …", nothing changed).
import { error, fail, redirect } from '@sveltejs/kit';
import { adminDayHref } from '#lib/admin-nav.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { isAdminBookingId, loadAdminBookingView } from '#lib/server/admin-day-view.ts';
import { now } from '#lib/server/clock.ts';
import { deleteBooking, isLockTimeout, type DeleteBookingResult } from '#lib/server/commands/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** What the page gets back after fail(). */
export type DeleteFailure = { code: 'stale' | 'past' | 'not_found' | 'failed' };

export const load: PageServerLoad = ({ params }) => {
	const view = loadAdminBookingView(params.id, getLocale());
	if (!view) error(404);
	return { view };
};

const STATUS = { stale: 409, past: 409, not_found: 410 } as const;

export const actions: Actions = {
	delete: async ({ params, request }) => {
		if (!isAdminBookingId(params.id)) error(404);
		const data = await request.formData();
		const token = data.get('impactToken');
		let result: DeleteBookingResult;
		try {
			result = deleteBooking({ bookingId: Number(params.id), impactToken: typeof token === 'string' ? token : '' }, { now: now() });
		} catch (e) {
			// Another writer held the lock too long: nothing was deleted; the admin may try again.
			if (isLockTimeout(e)) return fail(503, { code: 'failed' } satisfies DeleteFailure);
			throw e;
		}
		if (result.ok) redirect(303, adminDayHref(result.date));
		return fail(STATUS[result.code], { code: result.code } satisfies DeleteFailure);
	}
};
