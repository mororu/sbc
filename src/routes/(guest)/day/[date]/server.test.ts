// The day route loads: a selectable date renders, anything else redirects (302), never an error.
// The env is mocked to an in-memory database and a fixed DEV_NOW (10:00 on 12 January 2027).
import { isRedirect } from '@sveltejs/kit';
import { beforeAll, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { load as loadHome } from '../../+page.server.ts';
import { load as loadDay } from './+page.server.ts';

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

beforeAll(() => {
	applyMigrations();
});

type Load = (event: unknown) => unknown;

function run(load: Load, params: Record<string, string> = {}) {
	try {
		return { data: load({ params }) as { page: { kind: string; date?: string } } };
	} catch (e) {
		if (isRedirect(e)) return { redirect: { status: e.status, location: e.location } };
		throw e;
	}
}

describe('load /day/[date]', () => {
	it('returns the day page for a selectable date', () => {
		expect(run(loadDay as Load, { date: '2027-01-13' }).data?.page).toMatchObject({
			kind: 'day',
			date: '2027-01-13',
			heading: { eyebrow: 'Mittwoch', date: '13. Januar' }
		});
	});

	it.each([
		['2026-01-01', '/day/2027-01-12'],
		['2027-03-01', '/day/2027-01-26'],
		['2027-02-30', '/day/2027-01-12'],
		['abc', '/day/2027-01-12']
	])('redirects %s with 302 to %s', (date, location) => {
		expect(run(loadDay as Load, { date }).redirect).toEqual({ status: 302, location });
	});
});

describe('load /', () => {
	it('returns today', () => {
		expect(run(loadHome as Load).data?.page).toMatchObject({
			kind: 'day',
			date: '2027-01-12',
			heading: { eyebrow: 'Heute', date: '12. Januar' }
		});
	});
});
