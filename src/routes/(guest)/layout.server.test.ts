// The guest layout load: the footer's admin contact from the setting row, or none, and never an
// error page when the read fails. The env is mocked to an in-memory database.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
// The test edits the setting row of its own database.
// eslint-disable-next-line no-restricted-imports
import { getDb } from '#lib/server/db/index.ts';
import { load } from './+layout.server.ts';

const failure = vi.hoisted(() => ({ throws: false }));

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: '2027-01-12T09:00:00Z'
	})
}));

vi.mock('#lib/server/db/queries/index.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('#lib/server/db/queries/index.ts')>();
	return {
		...original,
		getAdminContact: () => {
			if (failure.throws) throw new Error('SQLITE_BUSY');
			return original.getAdminContact();
		}
	};
});

const SEED = 'platzhalter@sauna-luegisee.ch';
const setContact = (value: string | null) =>
	getDb().$client.prepare('update setting set admin_contact = ? where id = 1').run(value);
const run = () => (load as unknown as () => { adminContact: unknown })();

beforeAll(() => {
	applyMigrations();
});

beforeEach(() => {
	failure.throws = false;
	setContact(SEED);
	vi.restoreAllMocks();
});

describe('load (guest layout)', () => {
	it('returns the seeded admin contact as address and mailto href', () => {
		expect(run()).toEqual({ adminContact: { address: SEED, href: `mailto:${SEED}` } });
	});

	it('encodes the address in the href', () => {
		setContact('sauna+info@example.ch');
		expect(run().adminContact).toEqual({ address: 'sauna+info@example.ch', href: 'mailto:sauna%2Binfo@example.ch' });
	});

	it('returns no contact when none is set', () => {
		setContact(null);
		expect(run()).toEqual({ adminContact: null });
	});

	it('logs a failing read and returns no contact, so the page still renders', () => {
		failure.throws = true;
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(run()).toEqual({ adminContact: null });
		expect(log).toHaveBeenCalledOnce();
	});
});
