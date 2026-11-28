import { describe, expect, it } from 'vitest';
import { parseSignIn, PASSWORD_MAX, validateNewPassword } from './admin.ts';

describe('parseSignIn', () => {
	it('keeps the password as typed, spaces included, and the return target', () => {
		expect(parseSignIn({ password: '  secret ', to: '/admin/settings', username: 'admin' })).toEqual({
			ok: true,
			value: { password: '  secret ', to: '/admin/settings' }
		});
	});

	it('defaults a missing or non-text target to empty', () => {
		expect(parseSignIn({ password: 'x' })).toEqual({ ok: true, value: { password: 'x', to: '' } });
		expect(parseSignIn({ password: 'x', to: 3 })).toEqual({ ok: true, value: { password: 'x', to: '' } });
	});

	it('asks to fill in an empty or missing password', () => {
		expect(parseSignIn({ password: '' })).toEqual({ ok: false, errors: { password: 'field_required' } });
		expect(parseSignIn({})).toEqual({ ok: false, errors: { password: 'field_required' } });
		expect(parseSignIn({ password: 5 })).toEqual({ ok: false, errors: { password: 'field_required' } });
	});

	it('calls an overlong password wrong without accepting it', () => {
		expect(parseSignIn({ password: 'a'.repeat(PASSWORD_MAX + 1) })).toEqual({ ok: false, errors: { password: 'password_wrong' } });
		expect(parseSignIn({ password: 'a'.repeat(PASSWORD_MAX) }).ok).toBe(true);
	});

	it('counts code points like validateNewPassword: 600 emoji can be set and signed in with', () => {
		const password = '🔥'.repeat(600);
		expect(password.length).toBe(1200);
		expect(validateNewPassword(password)).toBeNull();
		expect(parseSignIn({ password })).toEqual({ ok: true, value: { password, to: '' } });
		expect(parseSignIn({ password: '🔥'.repeat(PASSWORD_MAX + 1) })).toEqual({ ok: false, errors: { password: 'password_wrong' } });
	});
});

describe('validateNewPassword', () => {
	it('refuses an empty password and one of 11 characters', () => {
		expect(validateNewPassword('')).toBe('password_too_short');
		expect(validateNewPassword('a'.repeat(11))).toBe('password_too_short');
	});

	it('accepts 12 characters, counting code points', () => {
		expect(validateNewPassword('a'.repeat(12))).toBeNull();
		// 11 emoji are 22 UTF-16 units but 11 characters.
		expect(validateNewPassword('🔥'.repeat(11))).toBe('password_too_short');
	});

	it('refuses a password longer than the maximum', () => {
		expect(validateNewPassword('a'.repeat(PASSWORD_MAX + 1))).toBe('password_too_long');
	});
});
