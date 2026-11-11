// The handle hook sets <html lang> per locale (UX-DR74): de-CH for German, en for English.
import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server.ts';

type ResolveOpts = { transformPageChunk?: (input: { html: string; done: boolean }) => string | undefined };

async function htmlLangFor(headers: Record<string, string>): Promise<string> {
	const request = new Request('http://localhost/', { headers });
	const event = { request, url: new URL(request.url) };
	const resolve = async (_event: unknown, opts?: ResolveOpts) =>
		new Response(opts?.transformPageChunk?.({ html: '<html lang="%paraglide.lang%">', done: true }) ?? '');
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
