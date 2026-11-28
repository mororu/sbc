// `/admin/blocks/new` (Story 3.5): the block form. Both actions parse the form with the shared
// schema (`parseBlockForm` via `toBlockInstants`, AD-16; a time the spring clock change skips is
// `block_time_missing`) and go through `getBlockCheck`, the query the create-block command rechecks.
// - `check` ("Prüfen"): invalid fields are `fail(400, { errors, values })`; a start already passed
//   is `fail(409, { errors: { start: 'block_past' }, values })`; an overlap or a block inside a
//   changeover is `fail(409, { refusal, values })`; otherwise `{ values, dialog }`: the save dialog
//   with its impact token.
// - `save` ("Block speichern" in the dialog): success is a 303 to `/admin/blocks?saved`; `stale` is
//   `fail(409, { code, dialog, values })` with the new impact; `past` and `conflict` close the dialog
//   and show the refusal in the form (409); a lock timeout is `fail(503, { code: 'failed', values })`.
// Values are kept on every failure; there is nothing secret in them.
import { fail, redirect } from '@sveltejs/kit';
import { ADMIN_TAB_HREF } from '#lib/admin-nav.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { blockValues, type BlockErrors, type BlockFormReason, type BlockValues } from '#lib/schemas/index.ts';
import { buildBlockCheckView, buildBlockFormView, toBlockInstants, type BlockDialogView } from '#lib/server/block-view.ts';
import { now } from '#lib/server/clock.ts';
import { createBlock, isLockTimeout, type CreateBlockResult } from '#lib/server/commands/index.ts';
import { getBlockCheck } from '#lib/server/db/queries/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** What the page gets back from either action. */
export type BlockFormResult = {
	values: BlockValues;
	errors?: BlockErrors;
	/** The overlap or gap refusal, shown above the form. */
	refusal?: string;
	/** The save dialog (after "Prüfen", or with the new impact after `stale`). */
	dialog?: BlockDialogView;
	/** The save outcome the dialog shows. */
	code?: 'stale' | 'failed';
};

export const load: PageServerLoad = () => ({ view: buildBlockFormView({ now: now(), locale: getLocale() }) });

/** Parses the posted form; the failure (400) or the block with the posted values. */
async function parse(request: Request) {
	const data = Object.fromEntries(await request.formData());
	const values = blockValues(data);
	// The shared schema, then a time the spring clock change skips (`toBlockInstants`).
	const parsed = toBlockInstants(values);
	const token = typeof data.impactToken === 'string' ? data.impactToken : '';
	return { values, parsed, token };
}

/** The check of a parsed block as a form result: the past error, the refusal or the dialog. */
function checkResult(block: { start: string; end: string; reason: BlockFormReason }, values: BlockValues) {
	const at = now();
	const view = buildBlockCheckView(block, getBlockCheck({ start: block.start, end: block.end }, at), { now: at, locale: getLocale() });
	if (view.kind === 'past') return fail(409, { values, errors: { start: 'block_past' } } satisfies BlockFormResult);
	if (view.kind === 'conflict') return fail(409, { values, refusal: view.text } satisfies BlockFormResult);
	return { values, dialog: view.dialog } satisfies BlockFormResult;
}

export const actions: Actions = {
	check: async ({ request }) => {
		const { values, parsed } = await parse(request);
		if (!parsed.ok) return fail(400, { values, errors: parsed.errors } satisfies BlockFormResult);
		return checkResult(parsed.value, values);
	},
	save: async ({ request }) => {
		const { values, parsed, token } = await parse(request);
		if (!parsed.ok) return fail(400, { values, errors: parsed.errors } satisfies BlockFormResult);
		let result: CreateBlockResult;
		try {
			result = createBlock({ ...parsed.value, impactToken: token }, { now: now() });
		} catch (e) {
			// Another writer held the lock too long: nothing was saved; the admin may try again.
			if (isLockTimeout(e)) return fail(503, { values, code: 'failed' } satisfies BlockFormResult);
			throw e;
		}
		if (result.ok) redirect(303, `${ADMIN_TAB_HREF.blocks}?saved`);
		// `invalid` for a form that passed `parse` (the command's own range check): answered as a bad range.
		if (result.code === 'invalid') {
			return fail(400, { values, errors: { end: 'block_end_not_after_start' } } satisfies BlockFormResult);
		}
		const again = checkResult(parsed.value, values);
		// Still savable: the impact changed (`stale`) and the dialog shows the new one.
		if ('dialog' in again) return fail(409, { ...again, code: 'stale' } satisfies BlockFormResult);
		// `past` or `conflict` (also a stale save that now conflicts): the refusal in the form.
		return again;
	}
};
