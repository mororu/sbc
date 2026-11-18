// The handle hook sets <html lang> per locale (UX-DR74): de-CH for German, en for English. It also
// guards /admin (Story 3.1 matrix, "Guard" and "Ended"): fake events, an in-memory database.
import { isRedirect } from '@sveltejs/kit';
// @ts-expect-error -- SvelteKit's internal request store has no public types; `sequence` needs it.
import { with_request_store } from '@sveltejs/kit/internal/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { hashPassword } from '#lib/server/password.ts';
import { resetSignInAttempts, setAdminPassword, signIn } from '#lib/server/commands/index.ts';
import { handle as sequenced } from './hooks.server.ts';

const clock = vi.hoisted(() => ({ now: '2027-01-12T09:00:00Z', fail: null as null | 'busy' | 'other' }));

// A switch to make touchSession hit a lock timeout; otherwise the real command.
vi.mock('#lib/server/commands/index.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/commands/index.ts')>();
	return {
		...actual,
		touchSession: (...args: Parameters<typeof actual.touchSession>) => {
			if (clock.fail === 'busy') throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
			if (clock.fail === 'other') throw new Error('disk I/O error');
			return actual.touchSession(...args);
		}
	};
});

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: clock.now
	})
}));

/** `sequence` reads SvelteKit's request store, which only a real request sets up: provide one. */
const handle = ((input: Parameters<typeof sequenced>[0]) =>
	with_request_store({ event: input.event, state: {} } as never, () => sequenced(input))) as typeof sequenced;

type ResolveOpts = {
	transformPageChunk?: (input: { html: string; done: boolean }) => string | undefined | Promise<string | undefined>;
};

async function htmlLangFor(headers: Record<string, string>): Promise<string> {
	const request = new Request('http://localhost/', { headers });
	const event = { request, url: new URL(request.url) };
	const resolve = async (_event: unknown, opts?: ResolveOpts) =>
		new Response((await opts?.transformPageChunk?.({ html: '<html lang="%paraglide.lang%">', done: true })) ?? '');
	const response = await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
	return (await response.text()).match(/lang="([^"]*)"/)![1];
}

describe('handle', () => {
	it.each([
		['the de cookie', { cookie: 'PARAGLIDE_LOCALE=de' }, 'de-CH'],
		['the en cookie', { cookie: 'PARAGLIDE_LOCALE=en' }, 'en'],
		['an English browser and no cookie', { 'accept-language': 'en-US,en;q=0.9' }, 'en'],
		['a French browser and no cookie', { 'accept-language': 'fr-CH' }, 'de-CH'],
		['no preference', {}, 'de-CH'],
		['the de cookie over an English browser', { cookie: 'PARAGLIDE_LOCALE=de', 'accept-language': 'en' }, 'de-CH']
	])('renders lang for %s', async (_label, headers, expected) => {
		expect(await htmlLangFor(headers)).toBe(expected);
	});
});

describe('admin guard', () => {
	let sessionId: string;

	beforeAll(async () => {
		applyMigrations();
		setAdminPassword({ hash: await hashPassword('correct horse battery'), reset: false });
	});

	beforeEach(async () => {
		clock.now = '2027-01-12T09:00:00Z';
		clock.fail = null;
		resetSignInAttempts();
		const result = await signIn({ password: 'correct horse battery', address: 'test' });
		if (!result.ok) throw new Error('not signed in');
		sessionId = result.sessionId;
	});

	const request = async (path: string, cookie?: string, method = 'GET', headers: Record<string, string> = {}) => {
		const set: unknown[][] = [];
		const deleted: unknown[][] = [];
		const locals: App.Locals = {};
		const resolve = vi.fn(async () => new Response('admin page'));
		const req = new Request(`http://localhost${path}`, { method, headers });
		const event = {
			request: req,
			url: new URL(req.url),
			route: { id: null },
			locals,
			cookies: {
				get: (name: string) => (name === 'admin_session' ? cookie : undefined),
				set: (...args: unknown[]) => set.push(args),
				delete: (...args: unknown[]) => deleted.push(args)
			}
		};
		try {
			const response = await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
			return { response, resolve, set, deleted, locals };
		} catch (e) {
			if (isRedirect(e)) return { redirect: { status: e.status, location: e.location }, resolve, set, deleted, locals };
			throw e;
		}
	};

	it('redirects a request without a cookie to sign-in with the return target, without resolving', async () => {
		const outcome = await request('/admin/x?y=1');
		expect(outcome.redirect).toEqual({ status: 303, location: '/admin/login?to=%2Fadmin%2Fx%3Fy%3D1' });
		expect(outcome.resolve).not.toHaveBeenCalled();
		expect(outcome.set).toEqual([]);
	});

	it('guards a POST and the admin home too', async () => {
		expect((await request('/admin/logout', undefined, 'POST')).redirect).toEqual({ status: 303, location: '/admin/login' });
		expect((await request('/admin')).redirect).toEqual({ status: 303, location: '/admin/login' });
	});

	it('guards a percent-encoded admin path', async () => {
		const outcome = await request('/%61dmin/x');
		expect(outcome.redirect?.status).toBe(303);
		expect(outcome.resolve).not.toHaveBeenCalled();
	});

	it.each([
		['an unknown session', () => 'A'.repeat(22)],
		['a malformed cookie', () => 'not a session id']
	])('ends %s: deletes the cookie and redirects with expired=1', async (_label, cookie) => {
		const outcome = await request('/admin/x', cookie());
		expect(outcome.redirect).toEqual({ status: 303, location: '/admin/login?to=%2Fadmin%2Fx&expired=1' });
		expect(outcome.deleted).toEqual([['admin_session', expect.objectContaining({ path: '/admin' })]]);
		expect(outcome.resolve).not.toHaveBeenCalled();
	});

	it('ends a session last used 30 days ago', async () => {
		clock.now = '2027-02-11T09:00:00Z';
		const outcome = await request('/admin', sessionId);
		expect(outcome.redirect).toEqual({ status: 303, location: '/admin/login?expired=1' });
		expect(outcome.deleted).toHaveLength(1);
	});

	it('lets a valid session through, extending the cookie, and marks the response private', async () => {
		clock.now = '2027-02-11T08:59:59Z';
		const outcome = await request('/admin', sessionId);
		expect(outcome.resolve).toHaveBeenCalledOnce();
		expect(outcome.locals.adminSession).toEqual({ id: sessionId, expiresAt: '2027-03-13T08:59:59Z' });
		expect(outcome.set).toEqual([
			['admin_session', sessionId, { path: '/admin', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000 }]
		]);
		expect(outcome.response?.headers.get('cache-control')).toBe('private, no-store');
	});

	it('lets the sign-in page through without a session, never cached', async () => {
		const outcome = await request('/admin/login?to=%2Fadmin');
		expect(outcome.resolve).toHaveBeenCalledOnce();
		expect(outcome.set).toEqual([]);
		expect(outcome.response?.headers.get('cache-control')).toBe('private, no-store');
	});

	it('never caches the sign-in page reached by an encoded path', async () => {
		const outcome = await request('/%61dmin/login');
		expect(outcome.resolve).toHaveBeenCalledOnce();
		expect(outcome.response?.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each([
		['without a cookie', () => undefined],
		['with an unknown session', () => 'A'.repeat(22)]
	])('signs out %s to plain sign-in, clearing the cookie, without the ended line', async (_label, cookie) => {
		const outcome = await request('/admin/logout', cookie(), 'POST');
		expect(outcome.redirect).toEqual({ status: 303, location: '/admin/login' });
		expect(outcome.deleted).toEqual([['admin_session', expect.objectContaining({ path: '/admin', httpOnly: true })]]);
		expect(outcome.resolve).not.toHaveBeenCalled();
	});

	it('answers a lock timeout with a 503 and the action-failed line, never cached', async () => {
		clock.fail = 'busy';
		const outcome = await request('/admin', sessionId);
		expect(outcome.response?.status).toBe(503);
		expect(await outcome.response?.text()).toBe('Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal.');
		expect(outcome.response?.headers.get('cache-control')).toBe('private, no-store');
		expect(outcome.resolve).not.toHaveBeenCalled();
		const english = await request('/admin', sessionId, 'GET', { cookie: 'PARAGLIDE_LOCALE=en' });
		expect(await english.response?.text()).toBe("That didn't work. Nothing changed. Please try again.");
	});

	it('rethrows any other error of the session check', async () => {
		clock.fail = 'other';
		await expect(request('/admin', sessionId)).rejects.toThrow('disk I/O error');
	});

	it('leaves guest paths alone', async () => {
		const outcome = await request('/adminx', sessionId);
		expect(outcome.resolve).toHaveBeenCalledOnce();
		expect(outcome.set).toEqual([]);
		expect(outcome.locals.adminSession).toBeUndefined();
	});
});
