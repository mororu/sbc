// The settings page's client logic (Story 3.7), pure and client-safe: what an action result means
// for one card ("Speichern", the pre-heat check) and for the pre-heat dialog's confirm, and which
// result of a native POST belongs to which card. The page only carries the decisions out.
import type { SettingsCard, SettingsErrors, SettingsValues } from '#lib/schemas/index.ts';
import type { PreheatDialogView } from '#lib/server/settings-view.ts';

/** An enhanced action result, reduced to what the mappings read. */
export type SettingsActionResult = { type: 'success' | 'failure' | 'redirect' | 'error'; data?: unknown };

/** What the actions send back (`SettingsResult` on the server). */
export type SettingsFormData = {
	card?: string;
	saved?: boolean;
	errors?: SettingsErrors;
	values?: SettingsValues;
	dialog?: PreheatDialogView;
	code?: string;
};

const dataOf = (result: SettingsActionResult): SettingsFormData => (result.data ?? {}) as SettingsFormData;
const hasErrors = (data: SettingsFormData) => !!data.errors && Object.keys(data.errors).length > 0;

/**
 * After a card's "Speichern" (the pre-heat card: its check):
 * - `redirect`: follow it (an ended session goes to sign-in);
 * - `saved`: "Gespeichert." in the card, then reload the page data;
 * - `errors`: the field errors, values kept, focus on the first error;
 * - `dialog`: the pre-heat dialog for the checked window;
 * - `failed`: the inline failure in the card, focused (a lock timeout, an error result, a network
 *   error, or an answer for another card).
 */
export type CardStep =
	| { kind: 'redirect' }
	| { kind: 'saved' }
	| { kind: 'errors'; errors: SettingsErrors }
	| { kind: 'dialog'; dialog: PreheatDialogView }
	| { kind: 'failed' };

export function cardStep(result: SettingsActionResult, card: SettingsCard): CardStep {
	if (result.type === 'redirect') return { kind: 'redirect' };
	const data = dataOf(result);
	if (data.card !== card) return { kind: 'failed' };
	if (result.type === 'success') {
		if (data.dialog) return { kind: 'dialog', dialog: data.dialog };
		if (data.saved) return { kind: 'saved' };
		return { kind: 'failed' };
	}
	if (result.type === 'failure' && hasErrors(data)) return { kind: 'errors', errors: data.errors ?? {} };
	return { kind: 'failed' };
}

/**
 * After the pre-heat dialog's "Speichern":
 * - `redirect`: follow it;
 * - `saved`: the dialog closes, "Gespeichert." in the card;
 * - `stale`: the dialog shows the new impact with the stale line, focus on its title;
 * - `errors`: the dialog closes and the card shows the errors (a window refused by the command);
 * - `failed`: the inline failure in the dialog, focused.
 */
export type PreheatSaveStep =
	| { kind: 'redirect' }
	| { kind: 'saved' }
	| { kind: 'stale'; dialog: PreheatDialogView }
	| { kind: 'errors'; errors: SettingsErrors }
	| { kind: 'failed' };

export function preheatSaveStep(result: SettingsActionResult): PreheatSaveStep {
	if (result.type === 'redirect') return { kind: 'redirect' };
	const data = dataOf(result);
	if (data.card !== 'preheat') return { kind: 'failed' };
	if (result.type === 'success') return data.saved ? { kind: 'saved' } : { kind: 'failed' };
	if (result.type !== 'failure') return { kind: 'failed' };
	if (data.code === 'stale' && data.dialog) return { kind: 'stale', dialog: data.dialog };
	if (hasErrors(data)) return { kind: 'errors', errors: data.errors ?? {} };
	return { kind: 'failed' };
}

/** What a card shows after a native POST (no JavaScript), or null when `form` belongs to another card. */
export type CardOutcome = {
	errors: SettingsErrors;
	/** The posted values to keep (never the password). */
	values: SettingsValues;
	status: 'saved' | 'failed' | null;
};

export function cardOutcome(form: unknown, card: SettingsCard): CardOutcome | null {
	const data = (form ?? null) as SettingsFormData | null;
	if (!data || data.card !== card) return null;
	const values = card === 'password' ? {} : (data.values ?? {});
	if (hasErrors(data)) return { errors: data.errors ?? {}, values, status: null };
	if (data.saved) return { errors: {}, values: {}, status: 'saved' };
	// The pre-heat dialog needs JavaScript: a check answered without it shows nothing more.
	if (data.dialog && !data.code) return { errors: {}, values, status: null };
	return { errors: {}, values, status: 'failed' };
}

/** The first field of `fields` with an error, or undefined. */
export const firstErrorField = (fields: readonly string[], errors: SettingsErrors): string | undefined =>
	fields.find((f) => errors[f]);
