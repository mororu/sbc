// Story 3.1 matrix, "Guard" and "Bad target": which paths are guarded, the return target and the
// sign-in link.
import { describe, expect, it } from 'vitest';
import { ADMIN_COOKIE_OPTIONS, isGuardedPath, loginHref, safeReturnTarget } from './admin-auth.ts';

describe('isGuardedPath', () => {
	it.each(['/admin', '/admin/', '/admin/x', '/admin/logout', '/admin/login/x', '/%61dmin/x'])('guards %s', (path) => {
		expect(isGuardedPath(path)).toBe(true);
	});

	it.each(['/', '/adminx', '/day/2027-01-12', '/lang/de', '/admin/login'])('leaves %s alone', (path) => {
		expect(isGuardedPath(path)).toBe(false);
	});

	it('guards by route id too', () => {
		expect(isGuardedPath('/elsewhere', '/admin/(portal)')).toBe(true);
	});
});

describe('safeReturnTarget', () => {
	it.each([
		['/admin', '/admin'],
		['/admin/settings', '/admin/settings'],
		['/admin/day/2027-01-12?x=1', '/admin/day/2027-01-12?x=1'],
		['/admin/über', '/admin/%C3%BCber']
	])('accepts %s', (to, expected) => {
		expect(safeReturnTarget(to)).toBe(expected);
	});

	it.each([
		null,
		'',
		'https://evil.example',
		'https://evil.example/admin',
		'//evil.example',
		'//evil.example/admin',
		'/adminx',
		'/admin/../x',
		'/admin/%2e%2e/x',
		'/admin\\x',
		'/\\evil.example',
		'/admin/x\nSet-Cookie: a=b',
		'/admin/x\u0085',
		'admin/settings',
		'/',
		'/day/2027-01-12',
		'/admin/login',
		'/admin/login?to=/admin',
		'/admin/logout',
		'javascript:alert(1)'
	])('refuses %j and returns /admin', (to) => {
		expect(safeReturnTarget(to)).toBe('/admin');
	});
});

describe('loginHref', () => {
	it('carries the requested path and query as the return target', () => {
		expect(loginHref('/admin/x?y=1')).toBe('/admin/login?to=%2Fadmin%2Fx%3Fy%3D1');
	});

	it('adds expired=1 for an ended session', () => {
		expect(loginHref('/admin/x', true)).toBe('/admin/login?to=%2Fadmin%2Fx&expired=1');
		expect(loginHref('/admin', true)).toBe('/admin/login?expired=1');
	});

	it('leaves out the admin home and any target it would not accept', () => {
		expect(loginHref('/admin')).toBe('/admin/login');
		expect(loginHref('/admin/logout')).toBe('/admin/login');
	});
});

describe('ADMIN_COOKIE_OPTIONS', () => {
	it('is Path=/admin, HttpOnly, Secure, SameSite=Lax, 30 days', () => {
		expect(ADMIN_COOKIE_OPTIONS).toEqual({ path: '/admin', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000 });
	});
});
