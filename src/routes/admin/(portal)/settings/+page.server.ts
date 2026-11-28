// `/admin/settings` (FR-15, FR-20; Story 3.7): one card per group, each its own form. Every action
// parses its card with the shared schema (`parseSettingsCard`, AD-16) and writes through
// `changeSettings` (or `changeAdminPassword`), never directly. Every result carries `card`, so the
// page shows it in that card only:
// - success: `{ card, saved: true }` ("Gespeichert.");
// - invalid fields: `fail(400, { card, errors, values })`, values as posted (never the password);
// - a lock timeout: `fail(503, { card, code: 'failed' })`, nothing changed.
// The pre-heat card goes through the impact dialog: `preheatCheck` saves nothing; an unchanged
// window answers `{ card, saved: true }` at once, any other `{ card, values, dialog }`. The dialog's
// confirm posts the window and the token to `preheat`: `stale` is `fail(409, { card, code: 'stale',
// dialog })` with the new impact. The password is hashed here, outside the transaction; the command
// keeps the admin's own session and deletes every other one. If that own session was deleted
// meanwhile (another admin changed the password first), the cookie is cleared and the admin goes to
// sign-in with "Bitte melde dich wieder an.", as the guard does for an ended session.
// Story 3.8 adds `season` and `keybox`, plain cards through `changeSettings`: a season `conflict`
// (dates overlapping another season) is `fail(400, { card, errors: { start: 'settings_season_overlap' },
// values })`; an end before today (`past` with `field: 'end'`) is `fail(400, { card, errors: { end:
// 'settings_season_end_past' }, values })`; a start before today on a new or upcoming season
// (`past` with `field: 'start'`) is the same on `start` with 'settings_season_start_past';
// `not_found` (the row is gone), any other `past` (the row has ended, or its start passed and was
// changed) and a malformed hidden `id` are the in-card failure, `fail(503, { card, code: 'failed' })`,
// like a lock timeout.
import { fail, redirect } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import {
	parseSettingsCard,
	settingsValues,
	type SettingsCard,
	type SettingsErrors,
	type SettingsInput,
	type SettingsValues
} from '#lib/schemas/index.ts';
import { ADMIN_COOKIE_OPTIONS, ADMIN_SESSION_COOKIE, loginHref } from '#lib/server/admin-auth.ts';
import { now } from '#lib/server/clock.ts';
import {
	changeAdminPassword,
	changeSettings,
	isLockTimeout,
	type ChangeSettingsInput,
	type ChangeSettingsResult
} from '#lib/server/commands/index.ts';
import { getPreheatImpact, getSettings } from '#lib/server/db/queries/index.ts';
import { hashPassword } from '#lib/server/password.ts';
import { loadSettings, preheatDialog, type PreheatDialogView } from '#lib/server/settings-view.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** What the page gets back from any action. */
export type SettingsResult = {
	card: SettingsCard;
	saved?: true;
	errors?: SettingsErrors;
	values?: SettingsValues;
	/** The pre-heat dialog (after the check, or with the new impact after `stale`). */
	dialog?: PreheatDialogView;
	code?: 'stale' | 'failed';
};

export const load: PageServerLoad = () => ({ view: loadSettings(getLocale(), now()) });

async function posted(request: Request): Promise<Record<string, unknown>> {
	return Object.fromEntries(await request.formData());
}

/** Runs a write; a lock timeout is the in-card failure (503), nothing changed. */
async function write<T>(card: SettingsCard, run: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; failure: ReturnType<typeof fail> }> {
	try {
		return { ok: true, value: await run() };
	} catch (e) {
		if (isLockTimeout(e)) return { ok: false, failure: fail(503, { card, code: 'failed' } satisfies SettingsResult) };
		throw e;
	}
}

/**
 * The fallback for an `invalid` from the command on a form that passed the schema (the command's own
 * range check disagreeing): the field and key to blame when the schema, rerun, cannot tell.
 */
const INVALID_FIELD: Record<Exclude<SettingsCard, 'password'>, [string, SettingsErrors[string]]> = {
	season: ['end', 'settings_season_order'],
	keybox: ['code', 'settings_keybox_invalid'],
	hours: ['close', 'settings_hours_order'],
	changeover: ['minutes', 'settings_changeover_range'],
	horizon: ['days', 'settings_horizon_range'],
	preheat: ['min', 'settings_preheat_range'],
	instructions: ['de', 'field_required'],
	contact: ['email', 'settings_contact_invalid']
};

/** A plain card: parse, write through `changeSettings`, answer saved or the errors. */
function plainCard<C extends Exclude<SettingsCard, 'password' | 'preheat'>>(
	card: C,
	toInput: (value: SettingsInput[C]) => ChangeSettingsInput
) {
	return async ({ request }: RequestEvent) => {
		const data = await posted(request);
		const values = settingsValues(card, data);
		const parsed = parseSettingsCard(card, data);
		// The hidden season id is never typed: a bad one is a failure, not an invisible field error.
		if (!parsed.ok && parsed.errors.id) return fail(503, { card, code: 'failed' } satisfies SettingsResult);
		if (!parsed.ok) return fail(400, { card, errors: parsed.errors, values } satisfies SettingsResult);
		const result = await write(card, () => changeSettings(toInput(parsed.value), { now: now() }));
		if (!result.ok) return result.failure;
		return answer(card, result.value, data);
	};
}

/**
 * Saved; a season overlap (`conflict`) or a start in the past as the field error on `start`, an end
 * in the past on `end`; other `not_found`/`past` as the in-card failure; or the 400 for a command
 * `invalid`: the schema's errors when a rerun finds any, else the card's fallback field.
 */
function answer(card: Exclude<SettingsCard, 'password'>, result: ChangeSettingsResult, data: Record<string, unknown>) {
	if (result.ok) return { card, saved: true } satisfies SettingsResult;
	const values = settingsValues(card, data);
	if (card === 'season' && result.code === 'conflict') {
		return fail(400, { card, errors: { start: 'settings_season_overlap' }, values } satisfies SettingsResult);
	}
	if (card === 'season' && result.code === 'past' && result.field === 'end') {
		return fail(400, { card, errors: { end: 'settings_season_end_past' }, values } satisfies SettingsResult);
	}
	if (card === 'season' && result.code === 'past' && result.field === 'start') {
		return fail(400, { card, errors: { start: 'settings_season_start_past' }, values } satisfies SettingsResult);
	}
	if (result.code === 'conflict' || result.code === 'not_found' || result.code === 'past') {
		return fail(503, { card, code: 'failed' } satisfies SettingsResult);
	}
	const rerun = parseSettingsCard(card, data);
	if (!rerun.ok) return fail(400, { card, errors: rerun.errors, values } satisfies SettingsResult);
	const [field, key] = INVALID_FIELD[card];
	return fail(400, { card, errors: { [field]: key }, values } satisfies SettingsResult);
}

/** The pre-heat dialog for the posted window, read now. */
const dialogFor = (minMin: number, maxMin: number) => preheatDialog(getPreheatImpact({ minMin, maxMin }, now()), getLocale());

export const actions: Actions = {
	season: plainCard('season', (v) => ({ card: 'season', ...v })),
	keybox: plainCard('keybox', (v) => ({ card: 'keybox', ...v })),
	hours: plainCard('hours', (v) => ({ card: 'hours', ...v })),
	changeover: plainCard('changeover', (v) => ({ card: 'changeover', ...v })),
	horizon: plainCard('horizon', (v) => ({ card: 'horizon', ...v })),
	instructions: plainCard('instructions', (v) => ({ card: 'instructions', ...v })),
	contact: plainCard('contact', (v) => ({ card: 'contact', ...v })),

	preheatCheck: async ({ request }) => {
		const card = 'preheat';
		const data = await posted(request);
		const values = settingsValues(card, data);
		const parsed = parseSettingsCard(card, data);
		if (!parsed.ok) return fail(400, { card, errors: parsed.errors, values } satisfies SettingsResult);
		const { minMin, maxMin } = parsed.value;
		const current = getSettings();
		// Nothing changes: no dialog, nothing written.
		if (current.preheatMinMin === minMin && current.preheatMaxMin === maxMin) return { card, saved: true } satisfies SettingsResult;
		return { card, values, dialog: dialogFor(minMin, maxMin) } satisfies SettingsResult;
	},

	preheat: async ({ request }) => {
		const card = 'preheat';
		const data = await posted(request);
		const values = settingsValues(card, data);
		const parsed = parseSettingsCard(card, data);
		if (!parsed.ok) return fail(400, { card, errors: parsed.errors, values } satisfies SettingsResult);
		const { minMin, maxMin } = parsed.value;
		const impactToken = typeof data.impactToken === 'string' ? data.impactToken : '';
		const result = await write(card, () => changeSettings({ card, minMin, maxMin, impactToken }, { now: now() }));
		if (!result.ok) return result.failure;
		if (!result.value.ok && result.value.code === 'stale') {
			return fail(409, { card, code: 'stale', values, dialog: dialogFor(minMin, maxMin) } satisfies SettingsResult);
		}
		return answer(card, result.value, data);
	},

	password: async ({ request, locals, url, cookies }) => {
		const card = 'password';
		const session = locals.adminSession;
		if (!session) redirect(303, loginHref(url.pathname));
		const parsed = parseSettingsCard(card, await posted(request));
		// Never the password in `values`.
		if (!parsed.ok) return fail(400, { card, errors: parsed.errors, values: {} } satisfies SettingsResult);
		// Slow on purpose: outside any transaction.
		const hash = await hashPassword(parsed.value.password);
		const result = await write(card, () => changeAdminPassword({ hash, keepSessionId: session.id }));
		if (!result.ok) return result.failure;
		if (!result.value.ok && result.value.code === 'not_found') {
			// Another admin's change ended this session first: nothing was written.
			cookies.delete(ADMIN_SESSION_COOKIE, ADMIN_COOKIE_OPTIONS);
			redirect(303, loginHref(url.pathname, true));
		}
		// A hash that is not argon2id is a programming error (a 500), never an expected outcome. The
		// message names neither the hash nor the password.
		if (!result.value.ok) throw new Error('changeAdminPassword refused the computed hash');
		return { card, saved: true } satisfies SettingsResult;
	}
};
