// The admin shell's data (Story 3.1): the two nav badge counts. The guard in hooks.server.ts has
// already checked the session; the check here only keeps a page from rendering if the guard were
// ever bypassed. Counts carry no guest data.
import { redirect } from '@sveltejs/kit';
import { loginHref } from '#lib/server/admin-auth.ts';
import { loadNavCounts } from '#lib/server/admin-view.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, depends }) => {
	if (!locals.adminSession) redirect(303, loginHref(url.pathname + url.search));
	// Fresh counts on every admin navigation, and after `invalidate('admin:counts')`.
	void url.pathname;
	depends('admin:counts');
	return { counts: loadNavCounts() };
};
