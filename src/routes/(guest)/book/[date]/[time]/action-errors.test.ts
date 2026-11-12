// The action's error branches, with the command mocked: a command `invalid` the schema let through,
// and a lock-wait timeout. Both answer with the form again (input kept), never a 500.
import { isActionFailure } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { actions } from './+page.server.ts';

const command = vi.hoisted(() => ({ createBooking: vi.fn() }));

vi.mock('#lib/server/commands/index.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/commands/index.ts')>()),
	createBooking: command.createBooking
}));

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: '2027-01-12T08:00:00Z'
	})
}));

beforeAll(() => {
	applyMigrations();
});

beforeEach(() => {
	command.createBooking.mockReset();
});

const fields = {
	name: 'Lena',
	email: 'lena@example.ch',
	mobile: '079 123 45 67',
	duration: '90',
	partySize: '3',
	submitToken: 'AAAAAAAAAAAAAAAAAAAAAA',
	notice: '{"heat":"hot","earliest":null,"latest":null}'
};
const values = { name: 'Lena', email: 'lena@example.ch', mobile: '079 123 45 67', duration: '90', partySize: '3' };

async function submit() {
	const request = new Request('http://x/book/2027-01-14/1800', { method: 'POST', body: new URLSearchParams(fields) });
	return (actions.default as (e: unknown) => Promise<unknown>)({ params: { date: '2027-01-14', time: '1800' }, request });
}

describe('book action error branches', () => {
	it('answers a command `invalid` with 400, form_invalid and the values', async () => {
		command.createBooking.mockReturnValue({ ok: false, code: 'invalid' });
		const result = await submit();
		expect(command.createBooking).toHaveBeenCalledOnce();
		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({ status: 400, data: { errors: { submitToken: 'form_invalid' }, values } });
	});

	it('answers a lock-wait timeout with 503, form_invalid and the values', async () => {
		command.createBooking.mockImplementation(() => {
			throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
		});
		const result = await submit();
		expect(isActionFailure(result)).toBe(true);
		expect(result).toMatchObject({ status: 503, data: { errors: { submitToken: 'form_invalid' }, values } });
	});

	it('lets any other error through', async () => {
		command.createBooking.mockImplementation(() => {
			throw Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' });
		});
		await expect(submit()).rejects.toThrow('disk I/O error');
	});
});
