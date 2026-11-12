// The book route end to end on the server: load, the default action, and the confirmation load.
// The env is mocked to an in-memory database and a DEV_NOW the tests can move (09:00, 12 January 2027).
import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
// The test reads and edits its own database to check what the action stored.
// eslint-disable-next-line no-restricted-imports
import { getDb } from '#lib/server/db/index.ts';
import { load as loadBooked } from '../../../booked/[publicId]/+page.server.ts';
import { load as loadDay } from '../../../day/[date]/+page.server.ts';
import { actions, load as loadBook } from './+page.server.ts';

const clock = vi.hoisted(() => ({ now: '2027-01-12T08:00:00Z', locale: 'de' as 'de' | 'en' }));

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => clock.locale
}));

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: clock.now
	})
}));

beforeAll(() => {
	applyMigrations();
});

beforeEach(() => {
	clock.now = '2027-01-12T08:00:00Z';
	clock.locale = 'de';
});

type Outcome =
	| { redirect: { status: number; location: string } }
	| { failure: { status: number; data: unknown } }
	| { error: { status: number } }
	| { data: unknown };

async function run(fn: () => unknown): Promise<Outcome> {
	try {
		const result = await fn();
		if (isActionFailure(result)) return { failure: { status: result.status, data: result.data } };
		return { data: result };
	} catch (e) {
		if (isRedirect(e)) return { redirect: { status: e.status, location: e.location } };
		if (isHttpError(e)) return { error: { status: e.status } };
		throw e;
	}
}

let sentHeaders: Record<string, string> = {};
const headers = {
	setHeaders: (h: Record<string, string>) => {
		sentHeaders = { ...sentHeaders, ...h };
	}
};
const openForm = (date: string, time: string, query = '') =>
	run(() =>
		(loadBook as (e: unknown) => unknown)({ params: { date, time }, url: new URL(`http://x/book/${date}/${time}${query}`), ...headers })
	);
let tokenCount = 0;
const token = () => `TOKEN${String(++tokenCount).padStart(17, '0')}`;
const submit = (date: string, time: string, fields: Record<string, string>) => {
	const body = new URLSearchParams(fields);
	const request = new Request(`http://x/book/${date}/${time}`, { method: 'POST', body });
	return run(() => (actions.default as (e: unknown) => unknown)({ params: { date, time }, request }));
};
const lena = (over: Record<string, string> = {}) => ({
	name: 'Lena',
	email: 'lena@example.ch ',
	mobile: '079 123 45 67',
	duration: '90',
	partySize: '3',
	submitToken: token(),
	...over
});
const GUEST_DATA = /Lena|lena|example|079|\+41|123/;

describe('book flow', () => {
	it('opens the form, books, and lands on the minimal confirmation', async () => {
		const form = await openForm('2027-01-12', '1800', '?d=90&p=3');
		expect(form).toMatchObject({ data: { page: { kind: 'form', title: '18:00 buchen', duration: 90, partySize: 3 } } });
		expect(sentHeaders['cache-control']).toBe('private, no-store');
		sentHeaders = {};

		const booked = await submit('2027-01-12', '1800', lena());
		expect(booked).toEqual({ redirect: { status: 303, location: expect.stringMatching(/^\/booked\/[A-Za-z0-9_-]{22}$/) } });
		if (!('redirect' in booked)) return;
		expect(booked.redirect.location).not.toMatch(GUEST_DATA);

		const publicId = booked.redirect.location.split('/').pop();
		const confirmation = await run(() => (loadBooked as (e: unknown) => unknown)({ params: { publicId }, ...headers }));
		expect(sentHeaders['cache-control']).toBe('private, no-store');
		expect(confirmation).toEqual({
			data: {
				view: {
					title: 'Gebucht',
					date: 'Dienstag, 12. Januar',
					heading: 'Gebucht!',
					time: '18:00',
					datetime: '2027-01-12T17:00:00Z',
					duration: '90 Min.',
					people: '3 Personen',
					another: { href: '/day/2027-01-12', text: 'Weitere Zeit buchen' }
				}
			}
		});
	});

	it('returns the same confirmation for a resubmit with the same token', async () => {
		const fields = lena();
		const first = await submit('2027-01-12', '1300', fields);
		const again = await submit('2027-01-12', '1300', fields);
		expect(again).toEqual(first);
	});

	it('sends a conflict to the refreshed day with the message, and no guest data', async () => {
		expect(await submit('2027-01-12', '1500', lena({ duration: '60' }))).toMatchObject({ redirect: { status: 303 } });
		const conflict = await submit('2027-01-12', '1600', lena({ duration: '60' }));
		expect(conflict).toEqual({ redirect: { status: 303, location: '/day/2027-01-12?error=conflict&time=1600' } });

		const day = await run(() =>
			(loadDay as (e: unknown) => unknown)({
				params: { date: '2027-01-12' },
				url: new URL('http://x/day/2027-01-12?error=conflict&time=1600')
			})
		);
		expect(day).toMatchObject({
			data: {
				page: {
					title: 'Fehler: Di, 12. Januar',
					error: { text: '16:00 ist gerade weggegangen. So sieht der Tag jetzt aus. Deine Angaben sind noch da.' }
				}
			}
		});
	});

	it('sends a start time that has begun to the day with the past message', async () => {
		clock.now = '2027-01-12T19:30:00Z';
		expect(await submit('2027-01-12', '2030', lena({ duration: '60' }))).toEqual({
			redirect: { status: 303, location: '/day/2027-01-12?error=past&time=2030' }
		});
	});

	it('redirects a stale form to the day with the matching message', async () => {
		expect(await openForm('2027-01-12', '1500')).toEqual({
			redirect: { status: 303, location: '/day/2027-01-12?error=conflict&time=1500' }
		});
		clock.now = '2027-01-12T20:00:00Z';
		expect(await openForm('2027-01-12', '2030')).toEqual({
			redirect: { status: 303, location: '/day/2027-01-12?error=past&time=2030' }
		});
	});

	it('answers invalid fields with 400, the error keys and the typed values', async () => {
		const fields = lena({ email: 'lena@', mobile: '12' });
		expect(await submit('2027-01-14', '1800', fields)).toEqual({
			failure: {
				status: 400,
				data: {
					errors: { email: 'email_invalid', mobile: 'mobile_invalid' },
					values: { name: 'Lena', email: 'lena@', mobile: '12', duration: '90', partySize: '3' }
				}
			}
		});
	});

	it('refuses crafted input without booking', async () => {
		expect(await submit('2027-01-14', '1800', lena({ partySize: '7' }))).toMatchObject({
			failure: { status: 400, data: { errors: { partySize: 'form_invalid' } } }
		});
		expect(await submit('2027-01-14', '2000', lena({ duration: '180' }))).toEqual({
			redirect: { status: 303, location: '/day/2027-01-14?error=conflict&time=2000' }
		});
		expect(await submit('2027-01-14', '18:00', lena())).toEqual({ redirect: { status: 303, location: '/day/2027-01-14' } });
		expect(await submit('2027-02-30', '1800', lena())).toEqual({ redirect: { status: 303, location: '/' } });
		expect(await openForm('2027-01-14', '1800')).toMatchObject({ data: { page: { kind: 'form' } } });
	});

	it('stores the locale active at submit', async () => {
		clock.locale = 'en';
		const fields = lena();
		expect(await submit('2027-01-15', '1800', fields)).toMatchObject({ redirect: { status: 303 } });
		const row = getDb()
			.$client.prepare('select locale, email, mobile from booking where submit_token = ?')
			.get(fields.submitToken);
		expect(row).toEqual({ locale: 'en', email: 'lena@example.ch', mobile: '+41791234567' });
	});

	it('answers a deleted booking\'s confirmation with 404', async () => {
		const booked = await submit('2027-01-15', '1100', lena());
		if (!('redirect' in booked)) throw new Error('not booked');
		const publicId = booked.redirect.location.split('/').pop();
		getDb().$client.prepare("update booking set deleted_at = '2027-01-12T08:30:00Z' where public_id = ?").run(publicId);
		expect(await run(() => (loadBooked as (e: unknown) => unknown)({ params: { publicId }, ...headers }))).toEqual({
			error: { status: 404 }
		});
	});

	it('answers an unknown confirmation id with 404', async () => {
		for (const publicId of ['xyz', 'AAAAAAAAAAAAAAAAAAAAAA']) {
			expect(await run(() => (loadBooked as (e: unknown) => unknown)({ params: { publicId }, ...headers }))).toEqual({
				error: { status: 404 }
			});
		}
	});
});
