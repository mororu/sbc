// `init` migrates, then starts the outbox worker, except while SvelteKit builds (Story 2.1).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ building: false }));
const calls = vi.hoisted(() => ({ startWorker: vi.fn(() => true), applyMigrations: vi.fn() }));

vi.mock('$app/env', () => ({
	get building() {
		return env.building;
	}
}));
vi.mock('#lib/server/worker/index.ts', () => ({ startWorker: calls.startWorker }));
vi.mock('#lib/server/db/migrate.ts', () => ({ applyMigrations: calls.applyMigrations }));

const { init } = await import('./hooks.server.ts');

beforeEach(() => {
	calls.startWorker.mockClear();
	calls.applyMigrations.mockClear();
});

describe('init', () => {
	it('applies migrations and starts the worker when not building', async () => {
		env.building = false;
		await init();
		expect(calls.applyMigrations).toHaveBeenCalledOnce();
		expect(calls.startWorker).toHaveBeenCalledOnce();
	});

	it('does not start the worker while building', async () => {
		env.building = true;
		await init();
		expect(calls.applyMigrations).toHaveBeenCalledOnce();
		expect(calls.startWorker).not.toHaveBeenCalled();
	});
});
