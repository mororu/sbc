// `/day/{yyyy-mm-dd}`: a selectable day. Anything else redirects (302) to the nearest selectable
// day, or to `/` when there is none. Never an error page.
import { redirect } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadDayView } from '#lib/server/day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const page = loadDayView(params.date, getLocale());
	if (page.kind === 'redirect') redirect(302, page.to);
	if (page.kind !== 'day') redirect(302, '/');
	return { page };
};
