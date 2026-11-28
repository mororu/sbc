// Key handling for the CLI's hidden password prompt (raw mode, no echo). Pure, so it can be tested.

/** Inside an ANSI escape sequence (arrow keys and the like): `esc` after ESC, `csi` after ESC [, `ss3` after ESC O. */
type Escape = 'none' | 'esc' | 'csi' | 'ss3';

export type HiddenInput = { value: string; escape: Escape; result: 'typing' | 'done' | 'cancelled' };

export const EMPTY_INPUT: HiddenInput = { value: '', escape: 'none', result: 'typing' };

/**
 * Feeds terminal input into the prompt state. Enter ends it, Ctrl-C/Ctrl-D cancel it, Backspace
 * removes one character, escape sequences are skipped whole, other control characters are ignored.
 */
export function feedHiddenInput(state: HiddenInput, input: string): HiddenInput {
	let { value, escape } = state;
	if (state.result !== 'typing') return state;
	for (const char of input) {
		if (escape === 'esc') {
			escape = char === '[' ? 'csi' : char === 'O' ? 'ss3' : 'none';
			continue;
		}
		if (escape === 'csi') {
			// Parameter and intermediate bytes, up to the final byte 0x40–0x7E.
			if (char >= '@' && char <= '~') escape = 'none';
			continue;
		}
		if (escape === 'ss3') {
			escape = 'none';
			continue;
		}
		if (char === '\u001b') escape = 'esc';
		else if (char === '\r' || char === '\n') return { value, escape, result: 'done' };
		else if (char === '\u0003' || char === '\u0004') return { value, escape, result: 'cancelled' };
		else if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
		else if (char >= ' ') value += char;
	}
	return { value, escape, result: 'typing' };
}
