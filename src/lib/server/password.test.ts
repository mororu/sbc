import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('password hash', () => {
	it('stores argon2id and verifies the same password only', async () => {
		const digest = await hashPassword('correct horse battery');
		expect(digest.startsWith('$argon2id$')).toBe(true);
		expect(await verifyPassword(digest, 'correct horse battery')).toBe(true);
		expect(await verifyPassword(digest, 'correct horse batterY')).toBe(false);
	});

	it('treats NFD terminal input and NFC browser input as the same password', async () => {
		const nfd = 'Grüezi Luegisee'.normalize('NFD');
		const nfc = 'Grüezi Luegisee'.normalize('NFC');
		expect(nfd).not.toBe(nfc);
		expect(await verifyPassword(await hashPassword(nfd), nfc)).toBe(true);
		expect(await verifyPassword(await hashPassword(nfc), nfd)).toBe(true);
	});

	it('calls a malformed digest a mismatch', async () => {
		expect(await verifyPassword('not a hash', 'x')).toBe(false);
	});
});
