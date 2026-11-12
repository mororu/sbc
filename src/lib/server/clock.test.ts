import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ devNow: null as string | null }));
vi.mock('./env.ts', () => ({ getEnv: () => env }));

const { now } = await import('./clock.ts');

afterEach(() => {
	env.devNow = null;
});

describe('now', () => {
	it('returns DEV_NOW when it is set', () => {
		env.devNow = '2027-01-12T09:00:00Z';
		expect(now()).toBe('2027-01-12T09:00:00Z');
	});

	it('returns the current instant as canonical text otherwise', () => {
		expect(now()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
	});
});
