// Story 3.9 (retro D5): one no-name fallback for every admin view.
import { describe, expect, it } from 'vitest';
import { displayName } from './display-name.ts';

describe('displayName', () => {
	it('trims the name', () => {
		expect(displayName('  Tom Brunner ', 'de')).toBe('Tom Brunner');
	});

	it.each([[null], [undefined], [''], ['  '], ['\t\n']])('falls back to "(ohne Name)" / "(no name)" for %j', (name) => {
		expect(displayName(name, 'de')).toBe('(ohne Name)');
		expect(displayName(name, 'en')).toBe('(no name)');
	});
});
