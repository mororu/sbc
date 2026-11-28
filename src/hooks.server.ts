import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { m } from '#lib/paraglide/messages.js';
import { extractLocaleFromRequest, getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { htmlLang } from '#lib/i18n/locale-switch.ts';
import {
	ADMIN_COOKIE_OPTIONS,
	ADMIN_LOGIN_PATH,
	ADMIN_LOGOUT_PATH,
	ADMIN_SESSION_COOKIE,
	isGuardedPath,
	loginHref,
	routedPath
} from '#lib/server/admin-auth.ts';
import { isLockTimeout, touchSession, type TouchSessionResult } from '#lib/server/commands/index.ts';
import { startWorker } from '#lib/server/worker/index.ts';

/** Runs once before the server handles its first request: migrate, then start the outbox worker. */
export const init: ServerInit = () => {
	applyMigrations();
	if (!building) startWorker();
};

/**
 * The admin guard (AD-10; Story 3.1): every /admin request except /admin/login needs a valid
 * session, or it is redirected to sign-in before any route code runs, so no admin data is loaded or
 * serialized. A valid session is extended (row and cookie) and put in `locals.adminSession`. Admin
 * responses are never cached. Other paths pass straight through, cookies untouched.
 */
const NO_STORE = 'private, no-store';

const handleAdminGuard: Handle = async ({ event, resolve }) => {
	const { url } = event;
	const path = routedPath(url.pathname);
	const guarded = isGuardedPath(url.pathname, event.route?.id ?? null);
	if (!guarded && path !== ADMIN_LOGIN_PATH) return resolve(event);
	if (guarded) {
		const target = url.pathname + url.search;
		// Signing out without a (valid) session: just clear the cookie and show sign-in, no "ended" line.
		const signingOut = path === ADMIN_LOGOUT_PATH;
		const sessionId = event.cookies.get(ADMIN_SESSION_COOKIE);
		if (!sessionId) {
			if (signingOut) event.cookies.delete(ADMIN_SESSION_COOKIE, ADMIN_COOKIE_OPTIONS);
			redirect(303, signingOut ? ADMIN_LOGIN_PATH : loginHref(target));
		}
		let session: TouchSessionResult;
		try {
			session = touchSession(sessionId);
		} catch (error) {
			// Another writer held the lock too long: say so instead of a bare 500; the admin retries.
			if (!isLockTimeout(error)) throw error;
			const locale = extractLocaleFromRequest(event.request);
			return new Response(m.admin_action_failed({}, { locale }), {
				status: 503,
				headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': NO_STORE }
			});
		}
		if (!session.ok) {
			event.cookies.delete(ADMIN_SESSION_COOKIE, ADMIN_COOKIE_OPTIONS);
			redirect(303, signingOut ? ADMIN_LOGIN_PATH : loginHref(target, true));
		}
		event.cookies.set(ADMIN_SESSION_COOKIE, sessionId, ADMIN_COOKIE_OPTIONS);
		event.locals.adminSession = { id: sessionId, expiresAt: session.expiresAt };
	}
	const response = await resolve(event);
	response.headers.set('cache-control', NO_STORE);
	return response;
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', htmlLang(locale))
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

export const handle: Handle = sequence(handleAdminGuard, handleParaglide);
