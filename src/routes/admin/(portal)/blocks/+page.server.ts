// `/admin/blocks` (Story 3.5): the upcoming blocks in start order, each not-started one with
// "Block löschen" and its impact dialog, the "Neuer Block" link, and the status after a save
// (`?saved`: "Gespeichert.") or a delete (`?deleted`: "Block gelöscht."). The flags carry no data.
// The `delete` action (FR-19) posts the block id and the impact token the dialog showed to the
// delete command, which recomputes it: success is a 303 to `/admin/blocks?deleted`; `stale` and
// `past` are 409, `not_found` 410 (deleted by another admin: "Schon erledigt."), a lock timeout 503
// ("Das hat nicht geklappt …", nothing changed). A missing or malformed id is an admin 404.
import { error, fail, redirect } from '@sveltejs/kit';
import { ADMIN_TAB_HREF } from '#lib/admin-nav.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { isAdminBookingId } from '#lib/server/admin-day-view.ts';
import { loadBlocksView, type BlocksStatus } from '#lib/server/block-view.ts';
import { now } from '#lib/server/clock.ts';
import { deleteBlock, isLockTimeout, type DeleteBlockResult } from '#lib/server/commands/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** What the page gets back after fail(); `blockId` names the row (also without JavaScript). */
export type DeleteBlockFailure = { code: 'stale' | 'past' | 'not_found' | 'failed'; blockId: number };

export const load: PageServerLoad = ({ url }) => {
	const status: BlocksStatus = url.searchParams.has('saved') ? 'saved' : url.searchParams.has('deleted') ? 'deleted' : null;
	return { view: loadBlocksView(getLocale(), status) };
};

const STATUS = { stale: 409, past: 409, not_found: 410 } as const;

export const actions: Actions = {
	delete: async ({ request }) => {
		const data = await request.formData();
		const raw = data.get('blockId');
		// Row ids have the same shape as booking ids: a positive integer without leading zeros.
		if (typeof raw !== 'string' || !isAdminBookingId(raw)) error(404);
		const blockId = Number(raw);
		const token = data.get('impactToken');
		let result: DeleteBlockResult;
		try {
			result = deleteBlock({ blockId, impactToken: typeof token === 'string' ? token : '' }, { now: now() });
		} catch (e) {
			// Another writer held the lock too long: nothing was deleted; the admin may try again.
			if (isLockTimeout(e)) return fail(503, { code: 'failed', blockId } satisfies DeleteBlockFailure);
			throw e;
		}
		if (result.ok) redirect(303, `${ADMIN_TAB_HREF.blocks}?deleted`);
		return fail(STATUS[result.code], { code: result.code, blockId } satisfies DeleteBlockFailure);
	}
};
