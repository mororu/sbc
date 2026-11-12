// `/`: today, or the first selectable day when today is not selectable, or the season notice.
import { redirect } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadDayView } from '#lib/server/day-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const page = loadDayView(null, getLocale());
	// `/` never gets a redirect target today; if it ever does, follow it rather than show an error.
	if (page.kind === 'redirect') redirect(302, page.to);
	return { page };
};
