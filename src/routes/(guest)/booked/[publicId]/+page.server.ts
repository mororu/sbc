// `/booked/{publicId}`: the confirmation. An unknown id is a plain 404 that reveals nothing.
import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { loadBookedView } from '#lib/server/booked-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, setHeaders }) => {
	const view = loadBookedView(params.publicId, getLocale());
	if (!view) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	return { view };
};
