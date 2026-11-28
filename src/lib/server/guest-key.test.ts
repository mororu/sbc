import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { guestKey } from './guest-key.ts';

describe('guestKey (AD-22)', () => {
	it('is the HMAC-SHA256 of the trimmed, lowercased email', () => {
		const expected = createHmac('sha256', 'secret').update('lena@example.ch').digest('hex');
		expect(guestKey('lena@example.ch', 'secret')).toBe(expected);
		expect(guestKey('  Lena@Example.CH ', 'secret')).toBe(expected);
	});

	it('differs by guest and by secret, and is not a plain hash', () => {
		const key = guestKey('lena@example.ch', 'secret');
		expect(guestKey('tom@example.ch', 'secret')).not.toBe(key);
		expect(guestKey('lena@example.ch', 'other')).not.toBe(key);
		expect(createHash('sha256').update('lena@example.ch').digest('hex')).not.toBe(key);
	});
});
