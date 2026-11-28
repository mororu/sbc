import { describe, expect, it } from 'vitest';
import { callOutcome, entryLine, isCallForm, nextCallFocus } from './call-outcome.ts';

describe('callOutcome', () => {
	it('maps the action payloads', () => {
		expect(callOutcome({ type: 'success', data: { called: true, bookingId: 3, firstName: 'Tom' } })).toBe('called');
		expect(callOutcome({ type: 'failure', data: { code: 'already_done' } })).toBe('already_done');
		expect(callOutcome({ type: 'failure', data: { code: 'stale', bookingId: 3 } })).toBe('stale');
		expect(callOutcome({ type: 'failure', data: { code: 'failed', bookingId: 3 } })).toBe('failed');
	});

	it('applies a redirect and counts an error or an unknown failure as failed', () => {
		expect(callOutcome({ type: 'redirect' })).toBe('redirect');
		expect(callOutcome({ type: 'error' })).toBe('failed');
		expect(callOutcome({ type: 'failure' })).toBe('failed');
	});
});

describe('isCallForm', () => {
	it("tells the called action's results (action: 'called') from the reply action's", () => {
		expect(isCallForm({ action: 'called', called: true, bookingId: 3, firstName: 'Tom' })).toBe(true);
		expect(isCallForm({ action: 'called', code: 'stale', bookingId: 3 })).toBe(true);
		expect(isCallForm({ action: 'called', code: 'already_done' })).toBe(true);
		expect(isCallForm({ action: 'called', code: 'failed', bookingId: 3 })).toBe(true);
		expect(isCallForm({ code: 'already_done', bookingId: 3 })).toBe(false);
		expect(isCallForm({ code: 'already_done' })).toBe(false);
		expect(isCallForm({ code: 'failed', bookingId: 3 })).toBe(false);
		expect(isCallForm({ done: true })).toBe(false);
		expect(isCallForm(null)).toBe(false);
		expect(isCallForm(undefined)).toBe(false);
	});
});

describe('nextCallFocus', () => {
	it('goes to the next entry still listed', () => {
		expect(nextCallFocus([1, 2, 3], 2, [1, 3])).toEqual({ kind: 'entry', id: 3 });
		expect(nextCallFocus([1, 2, 3], 1, [3])).toEqual({ kind: 'entry', id: 3 });
	});

	it('goes to the section heading after the last one, or with a new one only', () => {
		expect(nextCallFocus([1, 2], 2, [1])).toEqual({ kind: 'section' });
		expect(nextCallFocus([1], 1, [])).toEqual({ kind: 'section' });
		expect(nextCallFocus([1], 1, [9])).toEqual({ kind: 'section' });
	});

	it('stays on the entry while it is still listed', () => {
		expect(nextCallFocus([1, 2], 1, [1, 2])).toEqual({ kind: 'entry', id: 1 });
		expect(nextCallFocus([1], 1, [2, 1])).toEqual({ kind: 'entry', id: 1 });
	});

	it('goes to the first entry, else the section, when the entry was not listed before', () => {
		expect(nextCallFocus([1, 2], 5, [2, 3])).toEqual({ kind: 'entry', id: 2 });
		expect(nextCallFocus([], 5, [])).toEqual({ kind: 'section' });
	});
});

describe('entryLine', () => {
	it("shows the native POST's line until an enhanced result replaces it", () => {
		expect(entryLine({ dismissed: false, line: null, failed: true, stale: false })).toBe('failed');
		expect(entryLine({ dismissed: false, line: null, failed: false, stale: true })).toBe('stale');
		expect(entryLine({ dismissed: false, line: null, failed: false, stale: false })).toBeNull();
		// A native stale line, then an enhanced failure: only the failure.
		expect(entryLine({ dismissed: true, line: 'failed', failed: false, stale: true })).toBe('failed');
		// A native failure, then an enhanced stale refusal: only the stale line.
		expect(entryLine({ dismissed: true, line: 'stale', failed: true, stale: false })).toBe('stale');
		// Any enhanced result that left no line dismisses the native one.
		expect(entryLine({ dismissed: true, line: null, failed: true, stale: true })).toBeNull();
	});
});

