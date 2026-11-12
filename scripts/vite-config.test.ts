// The client time guard must stay registered: removing it from vite.config.ts fails this test.
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

describe('vite.config.ts', () => {
	it('registers the client-time-guard plugin for builds', async () => {
		const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'build', 'production');
		expect(config.plugins.map((p) => p.name)).toContain('client-time-guard');
	});
});
