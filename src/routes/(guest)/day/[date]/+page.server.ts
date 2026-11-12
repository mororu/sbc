// `/day/{yyyy-mm-dd}`: a selectable day. Anything else redirects (302) to the nearest selectable
// day, or to `/` when there is none. Never an error page. `?error=conflict|past&time=hhmm` shows a
// refused booking's message first (FR-6); the query never carries guest data.
import { redirect } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadDayView } from '#lib/server/day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	const page = loadDayView(params.date, getLocale(), {
		error: url.searchParams.get('error'),
		time: url.searchParams.get('time')
	});
	if (page.kind === 'redirect') redirect(302, page.to);
	if (page.kind !== 'day') redirect(302, '/');
	return { page };
};
