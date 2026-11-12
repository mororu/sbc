// `/booked/{publicId}`: the confirmation. An unknown id is a plain 404 that reveals nothing.
// `?new=1` (and `&changed=1`) come only from the book action's 303: the visit right after booking.
// Without them the page is a revisit. Neither flag is guest data.
import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadBookedView } from '#lib/server/booked-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, setHeaders }) => {
	const view = loadBookedView(params.publicId, getLocale(), {
		flags: { new: url.searchParams.get('new'), changed: url.searchParams.get('changed') }
	});
	if (!view) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	return { view };
};
