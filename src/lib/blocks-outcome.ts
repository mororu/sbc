// The Blocks pages' client logic (Story 3.5), pure and client-safe: what an action result means for
// the delete dialog on `/admin/blocks` and for "Prüfen" and the save dialog on `/admin/blocks/new`,
// and the one-time status flags of `/admin/blocks`. The pages only carry the decisions out.
import type { BlockErrors, BlockValues } from '#lib/schemas/index.ts';
import type { BlockDialogView } from '#lib/server/block-view.ts';

/** An enhanced action result, reduced to what the mappings read. */
export type BlockActionResult = { type: 'success' | 'failure' | 'redirect' | 'error'; data?: unknown };

const codeOf = (result: BlockActionResult): unknown =>
	result.type === 'failure' ? (result.data as { code?: unknown } | undefined)?.code : undefined;

// ---------------------------------------------------------------------------
// `/admin/blocks`: the delete dialog
// ---------------------------------------------------------------------------

/**
 * The first step after a delete result:
 * - `redirect`: follow it (`/admin/blocks?deleted`), then focus the h1;
 * - `reload`: `stale` or `not_found`: reload the page data, then decide with `afterDeleteReload`;
 * - `past`: "Hat schon begonnen." in the dialog, no confirm;
 * - `failed`: the inline failure in the dialog (a lock timeout, an error result, anything unknown).
 */
export type DeleteStep = { kind: 'redirect' } | { kind: 'reload'; code: 'stale' | 'not_found' } | { kind: 'past' } | { kind: 'failed' };

export function deleteStep(result: BlockActionResult): DeleteStep {
	if (result.type === 'redirect') return { kind: 'redirect' };
	const code = codeOf(result);
	if (code === 'stale' || code === 'not_found') return { kind: 'reload', code };
	if (code === 'past') return { kind: 'past' };
	return { kind: 'failed' };
}

/** What the page shows once the data reloaded after `stale` or `not_found`. */
export type DeleteAfterReload = {
	/** `keep`: the dialog stays open; `close`: it closes (or already unmounted with its row). */
	dialog: 'keep' | 'close';
	/** The dialog's outcome line: the new impact with the stale line, or none. */
	outcome: 'stale' | null;
	/** `gone`: the status says "Schon erledigt."; null leaves it. */
	status: 'gone' | null;
	/** `title`: the dialog title; `heading`: the page h1. */
	focus: 'title' | 'heading';
};

/** `deletable`: the reloaded list still has the row with its delete dialog. */
export function afterDeleteReload(code: 'stale' | 'not_found', deletable: boolean): DeleteAfterReload {
	if (code === 'not_found') return { dialog: 'close', outcome: null, status: 'gone', focus: 'heading' };
	// Stale, but the block started or went away meanwhile: nothing left to confirm.
	if (!deletable) return { dialog: 'close', outcome: null, status: null, focus: 'heading' };
	return { dialog: 'keep', outcome: 'stale', status: null, focus: 'title' };
}

// ---------------------------------------------------------------------------
// `/admin/blocks/new`: "Prüfen" and the save dialog
// ---------------------------------------------------------------------------

/** What `?/check` and `?/save` send back (`BlockFormResult` on the server). */
export type BlockFormData = {
	values?: BlockValues;
	errors?: BlockErrors;
	refusal?: string;
	dialog?: BlockDialogView;
	code?: string;
};

/** The errors or the refusal the form shows, with focus on the first problem. */
export type FormProblem = { errors: BlockErrors; refusal: string | null };

const problemOf = (data: BlockFormData): FormProblem | null =>
	data.errors || data.refusal ? { errors: data.errors ?? {}, refusal: data.refusal ?? null } : null;

const sameValues = (a: BlockValues, b: BlockValues) =>
	a.date === b.date && a.start === b.start && a.end === b.end && a.reason === b.reason;

/**
 * After "Prüfen":
 * - `dialog`: open the save dialog for exactly the values that were checked (`checked`);
 * - `stale-input`: the admin changed a field while the check ran: drop the result, open nothing;
 * - `problem`: show the errors (400, a past start) or the refusal (overlap, gap) in the form;
 * - `failed`: the inline failure above the button (network or error result).
 */
export type CheckStep =
	| { kind: 'dialog'; dialog: BlockDialogView; checked: BlockValues }
	| { kind: 'stale-input' }
	| { kind: 'problem'; problem: FormProblem }
	| { kind: 'failed' };

/** `submitted`: the values posted; `current`: the form's values when the answer arrived. */
export function checkStep(result: BlockActionResult, submitted: BlockValues, current: BlockValues): CheckStep {
	const data = (result.data ?? {}) as BlockFormData;
	if (result.type === 'success' && data.dialog) {
		return sameValues(submitted, current) ? { kind: 'dialog', dialog: data.dialog, checked: submitted } : { kind: 'stale-input' };
	}
	if (result.type === 'failure') {
		const problem = problemOf(data);
		if (problem) return { kind: 'problem', problem };
	}
	return { kind: 'failed' };
}

/**
 * After "Block speichern":
 * - `redirect`: follow it (`/admin/blocks?saved`), then focus the h1;
 * - `stale`: the dialog stays and shows the new impact with the stale line, focus on its title;
 * - `problem`: a past start or a conflict since "Prüfen": the dialog closes, the form shows why;
 * - `failed`: the inline failure in the dialog (a lock timeout, network, anything unknown).
 */
export type SaveStep =
	| { kind: 'redirect' }
	| { kind: 'stale'; dialog: BlockDialogView }
	| { kind: 'problem'; problem: FormProblem }
	| { kind: 'failed' };

export function saveStep(result: BlockActionResult): SaveStep {
	if (result.type === 'redirect') return { kind: 'redirect' };
	if (result.type !== 'failure') return { kind: 'failed' };
	const data = (result.data ?? {}) as BlockFormData;
	if (data.code === 'stale' && data.dialog) return { kind: 'stale', dialog: data.dialog };
	if (data.code === 'failed') return { kind: 'failed' };
	const problem = problemOf(data);
	return problem ? { kind: 'problem', problem } : { kind: 'failed' };
}

/** True when the dialog no longer describes the form: a field changed after "Prüfen". */
export const dialogOutdated = (checked: BlockValues | null, current: BlockValues): boolean =>
	checked !== null && !sameValues(checked, current);

// ---------------------------------------------------------------------------
// `/admin/blocks`: the one-time status flags
// ---------------------------------------------------------------------------

const FLAGS = ['saved', 'deleted'] as const;

/** The address without `?saved` / `?deleted`, or null when it carries neither (nothing to replace). */
export function withoutBlocksFlags(url: URL): URL | null {
	if (!FLAGS.some((flag) => url.searchParams.has(flag))) return null;
	const next = new URL(url.href);
	for (const flag of FLAGS) next.searchParams.delete(flag);
	return next;
}
