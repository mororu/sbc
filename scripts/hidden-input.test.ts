import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT, feedHiddenInput } from './hidden-input.ts';

const feed = (...chunks: string[]) => chunks.reduce(feedHiddenInput, EMPTY_INPUT);

describe('feedHiddenInput', () => {
	it('collects characters until Enter', () => {
		expect(feed('correct ', 'horse\r')).toEqual({ value: 'correct horse', escape: 'none', result: 'done' });
	});

	it('skips arrow keys and other escape sequences whole, also split across chunks', () => {
		expect(feed('ab\u001b[D\u001b[1;5Cc\u001bOAd\r').value).toBe('abcd');
		expect(feed('ab\u001b', '[', '3~c\r').value).toBe('abc');
		expect(feed('a\u001bxb\r').value).toBe('ab');
	});

	it('handles Backspace by code point, ignores other controls, and cancels on Ctrl-C', () => {
		expect(feed('ab🔥\u007f\u0007c\r').value).toBe('abc');
		expect(feed('abc\u0003').result).toBe('cancelled');
	});
});
