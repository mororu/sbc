// Story 3.5: the Blocks pages' result-to-UI decisions: the delete dialog (redirect, stale, not
// found, past, failed, and what the reload leads to), "Prüfen" (dialog for the checked values,
// changed input, problem, failed), the save dialog (redirect, stale, problem, failed) and the
// one-time status flags.
import { describe, expect, it } from 'vitest';
import type { BlockDialogView } from '#lib/server/block-view.ts';
import { afterDeleteReload, checkStep, deleteStep, dialogOutdated, saveStep, withoutBlocksFlags } from './blocks-outcome.ts';

const dialog = { title: 'Block speichern?', token: 't' } as unknown as BlockDialogView;
const values = { date: '2027-01-13', start: '09:00', end: '11:00', reason: 'cleaning' };
const failure = (data: unknown) => ({ type: 'failure' as const, data });

describe('deleteStep', () => {
	it('follows a redirect, reloads on stale and not_found, and keeps past apart from failures', () => {
		expect(deleteStep({ type: 'redirect' })).toEqual({ kind: 'redirect' });
		expect(deleteStep(failure({ code: 'stale', blockId: 1 }))).toEqual({ kind: 'reload', code: 'stale' });
		expect(deleteStep(failure({ code: 'not_found', blockId: 1 }))).toEqual({ kind: 'reload', code: 'not_found' });
		expect(deleteStep(failure({ code: 'past', blockId: 1 }))).toEqual({ kind: 'past' });
		expect(deleteStep(failure({ code: 'failed', blockId: 1 }))).toEqual({ kind: 'failed' });
		expect(deleteStep({ type: 'error' })).toEqual({ kind: 'failed' });
		expect(deleteStep({ type: 'success' })).toEqual({ kind: 'failed' });
	});
});

describe('afterDeleteReload', () => {
	it('keeps the dialog with the stale line and focuses its title while the row is still deletable', () => {
		expect(afterDeleteReload('stale', true)).toEqual({ dialog: 'keep', outcome: 'stale', status: null, focus: 'title' });
	});

	it('closes and focuses the h1 when the stale row started or went away', () => {
		expect(afterDeleteReload('stale', false)).toEqual({ dialog: 'close', outcome: null, status: null, focus: 'heading' });
	});

	it('closes, says "Schon erledigt." and focuses the h1 when another admin deleted it', () => {
		for (const deletable of [true, false]) {
			expect(afterDeleteReload('not_found', deletable)).toEqual({ dialog: 'close', outcome: null, status: 'gone', focus: 'heading' });
		}
	});
});

describe('checkStep', () => {
	it('opens the dialog for exactly the checked values', () => {
		expect(checkStep({ type: 'success', data: { values, dialog } }, values, { ...values })).toEqual({ kind: 'dialog', dialog, checked: values });
	});

	it('opens nothing when a field changed while the check ran', () => {
		expect(checkStep({ type: 'success', data: { values, dialog } }, values, { ...values, end: '11:30' })).toEqual({ kind: 'stale-input' });
	});

	it('shows errors (also a past start) or the refusal in the form', () => {
		expect(checkStep(failure({ values, errors: { start: 'block_past' } }), values, values)).toEqual({
			kind: 'problem',
			problem: { errors: { start: 'block_past' }, refusal: null }
		});
		expect(checkStep(failure({ values, refusal: 'Zwischen …' }), values, values)).toEqual({
			kind: 'problem',
			problem: { errors: {}, refusal: 'Zwischen …' }
		});
	});

	it('is a failure for an error result, a redirect or a failure without a problem', () => {
		expect(checkStep({ type: 'error' }, values, values)).toEqual({ kind: 'failed' });
		expect(checkStep(failure({ values }), values, values)).toEqual({ kind: 'failed' });
		expect(checkStep({ type: 'success', data: { values } }, values, values)).toEqual({ kind: 'failed' });
	});
});

describe('saveStep', () => {
	it('follows a redirect and keeps the dialog with the new impact on stale', () => {
		expect(saveStep({ type: 'redirect' })).toEqual({ kind: 'redirect' });
		expect(saveStep(failure({ values, code: 'stale', dialog }))).toEqual({ kind: 'stale', dialog });
	});

	it('closes the dialog into the form for a past start or a conflict', () => {
		expect(saveStep(failure({ values, errors: { start: 'block_past' } }))).toEqual({
			kind: 'problem',
			problem: { errors: { start: 'block_past' }, refusal: null }
		});
		expect(saveStep(failure({ values, refusal: 'Dieser Block …' }))).toEqual({
			kind: 'problem',
			problem: { errors: {}, refusal: 'Dieser Block …' }
		});
	});

	it('is a failure for a lock timeout, a stale answer without a dialog, an error or a success', () => {
		expect(saveStep(failure({ values, code: 'failed' }))).toEqual({ kind: 'failed' });
		expect(saveStep(failure({ values, code: 'stale' }))).toEqual({ kind: 'failed' });
		expect(saveStep({ type: 'error' })).toEqual({ kind: 'failed' });
		expect(saveStep({ type: 'success', data: { values } })).toEqual({ kind: 'failed' });
	});
});

describe('dialogOutdated', () => {
	it('is true only once a field differs from the checked values', () => {
		expect(dialogOutdated(null, values)).toBe(false);
		expect(dialogOutdated(values, { ...values })).toBe(false);
		for (const field of ['date', 'start', 'end', 'reason'] as const) {
			expect(dialogOutdated(values, { ...values, [field]: 'x' })).toBe(true);
		}
	});
});

describe('withoutBlocksFlags', () => {
	it('drops ?saved and ?deleted, keeps the rest, and is null without a flag', () => {
		expect(withoutBlocksFlags(new URL('http://localhost/admin/blocks?saved'))?.href).toBe('http://localhost/admin/blocks');
		expect(withoutBlocksFlags(new URL('http://localhost/admin/blocks?deleted&x=1'))?.href).toBe('http://localhost/admin/blocks?x=1');
		expect(withoutBlocksFlags(new URL('http://localhost/admin/blocks'))).toBeNull();
	});
});
