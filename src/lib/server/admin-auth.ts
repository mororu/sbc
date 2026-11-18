// Admin auth plumbing (AD-10, AD-11; Story 3.1): the session cookie, which paths the guard in
// hooks.server.ts covers, the return target after sign-in, and the sign-in link. No db access: the
// guard and the routes call the session commands.
import type { ResolvedPathname } from '$app/types';
import { SESSION_TTL_MIN } from './commands/admin-session.ts';

/** The admin session cookie: one of exactly two cookies, the other is the language cookie. */
export const ADMIN_SESSION_COOKIE = 'admin_session';

/** Sent only to /admin, never readable by scripts, only over HTTPS, not on cross-site subrequests. */
export const ADMIN_COOKIE_OPTIONS = {
	path: '/admin',
	httpOnly: true,
	secure: true,
	sameSite: 'lax',
	maxAge: SESSION_TTL_MIN * 60
} as const;

export const ADMIN_HOME_HREF = '/admin' as ResolvedPathname;
export const ADMIN_LOGIN_PATH = '/admin/login';
export const ADMIN_LOGOUT_PATH = '/admin/logout';

/** The pathname as the router matches it: percent-escapes decoded, except `%25` (like SvelteKit). */
export function routedPath(pathname: string): string {
	try {
		return pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		return pathname;
	}
}

const UNDER_ADMIN = /^\/admin(\/|$)/;

/**
 * True for every request the guard must check: anything routed under /admin (by path, decoded as
 * the router decodes it, or by route id), except the sign-in page itself.
 */
export function isGuardedPath(pathname: string, routeId: string | null = null): boolean {
	const path = routedPath(pathname);
	if (path === ADMIN_LOGIN_PATH) return false;
	return UNDER_ADMIN.test(path) || (routeId !== null && UNDER_ADMIN.test(routeId));
}

/** Any control character (C0, DEL, C1) never belongs in a redirect target. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ORIGIN = 'http://admin.invalid';

/**
 * Where to go after signing in: `to` when it is a same-origin path under /admin (normalised:
 * `/admin/../x` is `/x` and refused), not the sign-in or sign-out path, with no backslash and no
 * control character; else `/admin`. Absolute and protocol-relative URLs are refused.
 */
export function safeReturnTarget(to: string | null | undefined): string {
	if (!to || !to.startsWith('/') || to.startsWith('//') || to.includes('\\') || CONTROL.test(to)) return ADMIN_HOME_HREF;
	let url: URL;
	try {
		url = new URL(to, ORIGIN);
	} catch {
		return ADMIN_HOME_HREF;
	}
	const path = url.pathname;
	if (url.origin !== ORIGIN || !UNDER_ADMIN.test(path)) return ADMIN_HOME_HREF;
	if ([ADMIN_LOGIN_PATH, ADMIN_LOGOUT_PATH].some((p) => path === p || path.startsWith(`${p}/`))) {
		return ADMIN_HOME_HREF;
	}
	return path + url.search;
}

/**
 * The sign-in link for a request to `target` (path and query): `/admin/login?to=…`, the target
 * left out when it would not be accepted or is the admin home; `expired` adds `expired=1` ("Bitte
 * melde dich wieder an.").
 */
export function loginHref(target: string, expired = false): string {
	const params = new URLSearchParams();
	const safe = safeReturnTarget(target);
	if (safe !== ADMIN_HOME_HREF) params.set('to', safe);
	if (expired) params.set('expired', '1');
	const query = params.toString().replaceAll('+', '%20');
	return query ? `${ADMIN_LOGIN_PATH}?${query}` : ADMIN_LOGIN_PATH;
}
