// The language route's I/O matrix rows: cookie and redirect target.
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { cookieMaxAge } from '#lib/paraglide/runtime.js';
import { GET } from './+server.ts';

type Call = { name: string; value: string; options: Record<string, unknown> };

function run(locale: string, to?: string) {
	const url = new URL(`http://localhost/lang/${locale}`);
	if (to !== undefined) url.searchParams.set('to', to);
	const set: Call[] = [];
	const headers: Record<string, string> = {};
	const setHeaders = (h: Record<string, string>) => Object.assign(headers, h);
	const cookies = { set: (name: string, value: string, options: Record<string, unknown>) => set.push({ name, value, options }) };
	try {
		// Only the parts of the event the handler uses.
		GET({ params: { locale }, url, cookies, setHeaders } as unknown as Parameters<typeof GET>[0]);
	} catch (e) {
		if (isRedirect(e)) return { status: e.status, location: e.location, set, headers };
		throw e;
	}
	throw new Error('expected a redirect');
}

describe('GET /lang/[locale]', () => {
	it('stores a valid locale and returns to the page with its query', () => {
		const r = run('en', '/info?x=1');
		expect(r).toMatchObject({ status: 303, location: '/info?x=1' });
		expect(r.set).toEqual([
			{
				name: 'PARAGLIDE_LOCALE',
				value: 'en',
				options: expect.objectContaining({
					path: '/',
					maxAge: cookieMaxAge,
					sameSite: 'lax',
					httpOnly: false
				})
			}
		]);
		expect(r.headers['cache-control']).toBe('private, no-store');
	});

	it('percent-encodes a non-ASCII return path', () => {
		expect(run('en', '/über').location).toBe('/%C3%BCber');
	});

	it.each(['https://evil.example', '//evil.example', undefined])(
		'stores the locale but returns to / for target %s',
		(to) => {
			const r = run('de', to);
			expect(r).toMatchObject({ status: 303, location: '/' });
			expect(r.set).toHaveLength(1);
		}
	);

	it('ignores an unknown locale', () => {
		const r = run('fr', '/info');
		expect(r).toMatchObject({ status: 303, location: '/' });
		expect(r.set).toEqual([]);
	});
});
