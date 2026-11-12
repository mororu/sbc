import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientTimeGuard, findClientTimeLeaks } from './client-time-guard.ts';

const timeDir = resolve('src/lib/time');
const chunk = (fileName: string, code: string, moduleIds: string[] = []) => ({
	type: 'chunk' as const,
	fileName,
	code,
	moduleIds
});

describe('findClientTimeLeaks', () => {
	it('passes a clean bundle, including devalue naming Temporal types', () => {
		const bundle = {
			'a.js': chunk('a.js', 'case "Temporal.Instant": return Temporal.Instant.from(v);', [
				resolve('node_modules/devalue/src/parse.js')
			]),
			'b.css': { type: 'asset' as const, fileName: 'b.css' }
		};
		expect(findClientTimeLeaks(bundle, timeDir)).toEqual([]);
	});

	it('flags a chunk that includes a module from src/lib/time', () => {
		const bundle = { 'x.js': chunk('x.js', 'const z = 1;', [resolve('src/lib/time/zurich.ts')]) };
		expect(findClientTimeLeaks(bundle, timeDir)).toEqual([
			`x.js includes ${resolve('src/lib/time/zurich.ts')}`
		]);
	});

	it('flags a chunk that names the zone', () => {
		const bundle = { 'y.js': chunk('y.js', 'const ZONE = "Europe/Zurich";') };
		expect(findClientTimeLeaks(bundle, timeDir)).toEqual(['y.js contains "Europe/Zurich"']);
	});

	it('does not match a sibling folder that merely starts with "time"', () => {
		const bundle = { 'z.js': chunk('z.js', '', [resolve('src/lib/timeline/x.ts')]) };
		expect(findClientTimeLeaks(bundle, timeDir)).toEqual([]);
	});
});

describe('clientTimeGuard', () => {
	it('runs only for client builds', () => {
		const plugin = clientTimeGuard(timeDir);
		expect(plugin.apply).toBe('build');
		const applies = plugin.applyToEnvironment as (env: { config: { consumer: string } }) => boolean;
		expect(applies({ config: { consumer: 'client' } })).toBe(true);
		expect(applies({ config: { consumer: 'server' } })).toBe(false);
	});

	it('fails the build when a client chunk includes src/lib/time', () => {
		const plugin = clientTimeGuard(timeDir);
		const generateBundle = plugin.generateBundle as (
			this: { error: (message: string) => never },
			options: unknown,
			bundle: unknown
		) => void;
		const context = {
			error: (message: string): never => {
				throw new Error(message);
			}
		};
		const bundle = { 'x.js': chunk('x.js', '', [resolve('src/lib/time/zurich.ts')]) };
		expect(() => generateBundle.call(context, {}, bundle)).toThrow(/must not reach the browser/);
		expect(() => generateBundle.call(context, {}, { 'a.js': chunk('a.js', '') })).not.toThrow();
	});
});
