// POST `/admin/logout` (Story 3.1): ends the session at once, clears the cookie and goes to sign-in.
// A POST, not a link: a GET could be preloaded or prefetched and sign the admin out by accident.
import { redirect } from '@sveltejs/kit';
import { ADMIN_COOKIE_OPTIONS, ADMIN_LOGIN_PATH, ADMIN_SESSION_COOKIE } from '#lib/server/admin-auth.ts';
import { isLockTimeout, signOut } from '#lib/server/commands/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, locals }) => {
	const sessionId = locals.adminSession?.id ?? cookies.get(ADMIN_SESSION_COOKIE);
	if (sessionId) {
		try {
			signOut(sessionId);
		} catch (error) {
			// The database was busy: the row stays until it expires, but this browser is signed out.
			if (!isLockTimeout(error)) throw error;
		}
	}
	cookies.delete(ADMIN_SESSION_COOKIE, ADMIN_COOKIE_OPTIONS);
	redirect(303, ADMIN_LOGIN_PATH);
};
