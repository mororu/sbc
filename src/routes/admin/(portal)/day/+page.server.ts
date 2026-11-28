// `/admin/day` (Story 3.2): goes to today when it lies in a season, else to the first day of the next
// season, else to today (always accepted).
import { redirect } from '@sveltejs/kit';
import { adminDayHref } from '#lib/admin-nav.ts';
import { defaultAdminDay } from '#lib/server/admin-day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	redirect(303, adminDayHref(defaultAdminDay()));
};
