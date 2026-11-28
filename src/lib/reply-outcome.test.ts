import { describe, expect, it } from 'vitest';
import { nextReplyFocus, replyOutcome } from './reply-outcome.ts';

describe('replyOutcome', () => {
	it('maps the three action payloads', () => {
		expect(replyOutcome({ type: 'success', data: { done: true } })).toBe('done');
		expect(replyOutcome({ type: 'failure', data: { code: 'already_done', bookingId: 3 } })).toBe('already_done');
		expect(replyOutcome({ type: 'failure', data: { code: 'failed', bookingId: 3 } })).toBe('failed');
	});

	it('applies a redirect and counts an error as failed', () => {
		expect(replyOutcome({ type: 'redirect' })).toBe('redirect');
		expect(replyOutcome({ type: 'error' })).toBe('failed');
		expect(replyOutcome({ type: 'failure' })).toBe('failed');
	});
});

describe('nextReplyFocus', () => {
	it('goes to the next reminder still listed', () => {
		expect(nextReplyFocus([1, 2, 3], 2, [1, 3], true)).toEqual({ kind: 'reminder', id: 3 });
		expect(nextReplyFocus([1, 2, 3], 1, [2, 3], true)).toEqual({ kind: 'reminder', id: 2 });
		// The next one went too (another admin): the one after it.
		expect(nextReplyFocus([1, 2, 3], 1, [3], true)).toEqual({ kind: 'reminder', id: 3 });
	});

	it('goes to the section heading after the last one, or with a new one only', () => {
		expect(nextReplyFocus([1, 2], 2, [1], true)).toEqual({ kind: 'section' });
		expect(nextReplyFocus([1], 1, [], true)).toEqual({ kind: 'section' });
		expect(nextReplyFocus([1], 1, [9], true)).toEqual({ kind: 'section' });
	});

	it('goes to the page h1 when the section is gone (day view, none left)', () => {
		expect(nextReplyFocus([1], 1, [], false)).toEqual({ kind: 'page' });
	});
});
