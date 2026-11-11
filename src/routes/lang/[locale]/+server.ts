// GET /lang/{locale}?to=/path — stores the language choice and returns to the page (FR-26).
// Works without JavaScript. The locale cookie is the only guest cookie (AD-11).
import { redirect } from '@sveltejs/kit';
import { cookieMaxAge, cookieName, isLocale } from '#lib/paraglide/runtime.js';
import { safeReturnPath } from '#lib/i18n/locale-switch.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, cookies, setHeaders }) => {
	// The response sets a cookie: no shared cache may keep it.
	setHeaders({ 'cache-control': 'private, no-store' });
	if (isLocale(params.locale)) {
		cookies.set(cookieName, params.locale, {
			path: '/',
			maxAge: cookieMaxAge,
			sameSite: 'lax',
			// Paraglide reads the cookie in the browser too, so it cannot be HttpOnly.
			httpOnly: false
		});
		redirect(303, safeReturnPath(url.searchParams.get('to')));
	}
	redirect(303, '/');
};
