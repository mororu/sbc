import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { clientTimeGuard } from './scripts/client-time-guard.ts';

export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			paths: {
				// The production origin. Only set for builds: in `vite dev` the request origin
				// is localhost, and a fixed origin would make SvelteKit's CSRF check reject forms.
				origin: command === 'build' ? 'https://sauna-luegisee.ch' : undefined
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// Cookie first, then the browser's preferred language, then German. No URL prefixes.
			// Keep in sync with the `i18n:types` script in package.json.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		}),

		// Fails the build if src/lib/time (Temporal) ends up in a client chunk (AD-9).
		clientTimeGuard()
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));
