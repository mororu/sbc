// `/admin/login` (AD-10, FR-15; Story 3.1): the one admin page the guard lets through. A plain POST
// form: the action checks the shared password through the sign-in command and answers with a 303
// to the return target (a same-origin path under /admin, else /admin), or fail() with an error key
// and the return target only. The password never goes back to the page, into a log or a URL.
import { fail, redirect } from '@sveltejs/kit';
import { parseSignIn } from '#lib/schemas/index.ts';
import { ADMIN_COOKIE_OPTIONS, ADMIN_SESSION_COOKIE, safeReturnTarget } from '#lib/server/admin-auth.ts';
import { now } from '#lib/server/clock.ts';
import { isLockTimeout, signIn, type SignInResult } from '#lib/server/commands/index.ts';
import type { Actions, PageServerLoad } from './$types';

export type SignInError = 'field_required' | 'password_wrong' | 'rate_limited' | 'action_failed';

/** What the page gets back after fail(): never the password. */
export type SignInFailure = {
	error: SignInError;
	/** Rate limited: when the next try is allowed, and how many seconds that is from now. */
	retryAt?: string;
	retryInSeconds?: number;
	values: { to: string };
};

export const load: PageServerLoad = ({ url }) => ({
	to: safeReturnTarget(url.searchParams.get('to')),
	expired: url.searchParams.get('expired') === '1'
});

const text = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const data = await request.formData();
		const parsed = parseSignIn({ password: text(data.get('password')), to: text(data.get('to')) });
		const values = { to: safeReturnTarget(text(data.get('to'))) };
		if (!parsed.ok) {
			const error = parsed.errors.password === 'field_required' ? 'field_required' : 'password_wrong';
			return fail(400, { error, values } satisfies SignInFailure);
		}

		const at = now();
		let result: SignInResult;
		try {
			result = await signIn({ password: parsed.value.password, address: getClientAddress() }, { now: at });
		} catch (error) {
			// Another writer held the lock too long: no session was made; the admin may try again.
			if (isLockTimeout(error)) return fail(503, { error: 'action_failed', values } satisfies SignInFailure);
			throw error;
		}
		if (result.ok) {
			cookies.set(ADMIN_SESSION_COOKIE, result.sessionId, ADMIN_COOKIE_OPTIONS);
			redirect(303, values.to);
		}
		if (result.code === 'rate_limited') {
			const retryInSeconds = Math.max(1, Math.ceil((Date.parse(result.retryAt) - Date.parse(at)) / 1000));
			return fail(429, { error: 'rate_limited', retryAt: result.retryAt, retryInSeconds, values } satisfies SignInFailure);
		}
		return fail(400, { error: 'password_wrong', values } satisfies SignInFailure);
	}
};
