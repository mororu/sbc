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
const HOT_JSON = '{"heat":"hot","earliest":null,"latest":null}';
const lena = (over: Record<string, string> = {}) => ({
	name: 'Lena',
	email: 'lena@example.ch ',
	mobile: '079 123 45 67',
	duration: '90',
	partySize: '3',
	submitToken: token(),
	notice: HOT_JSON,
	...over
});
/** The notice token the form for `date`/`time` carries right now. */
const formNotice = async (date: string, time: string) => {
	const form = await openForm(date, time);
	if (!('data' in form)) throw new Error('no form');
	return (form.data as { page: { noticeToken: string } }).page.noticeToken;
};
const BOOKED = /^\/booked\/([A-Za-z0-9_-]{22})\?new=1(&changed=1)?$/;
const publicIdOf = (outcome: Outcome) => {
	if (!('redirect' in outcome)) throw new Error('not booked');
	return new URL(outcome.redirect.location, 'http://x').pathname.split('/').pop() as string;
};
const openBooked = (location: string) => {
	const url = new URL(location, 'http://x');
	const publicId = url.pathname.split('/').pop();
	return run(() => (loadBooked as (e: unknown) => unknown)({ params: { publicId }, url, ...headers }));
};
const GUEST_DATA = /Lena|lena|example|079|\+41|123/;

describe('book flow', () => {
	it('opens the form, books, and lands on the confirmation with the notice at booking', async () => {
		// Thursday 7 January, 09:00: Tuesday 12 January 18:00 has nothing before it.
		clock.now = '2027-01-07T08:00:00Z';
		const form = await openForm('2027-01-12', '1800', '?d=90&p=3');
		expect(form).toMatchObject({
			data: {
				page: {
					kind: 'form',
					title: '18:00 buchen',
					duration: 90,
					partySize: 3,
					noticeToken: '{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}'
				}
			}
		});
		expect(sentHeaders['cache-control']).toBe('private, no-store');
		sentHeaders = {};
		if (!('data' in form)) return;
		const notice = (form.data as { page: { noticeToken: string } }).page.noticeToken;

		const fields = lena({ notice });
		const booked = await submit('2027-01-12', '1800', fields);
		expect(booked).toEqual({ redirect: { status: 303, location: expect.stringMatching(BOOKED) } });
		if (!('redirect' in booked)) return;
		expect(booked.redirect.location).toMatch(/\?new=1$/);
		expect(booked.redirect.location).not.toMatch(GUEST_DATA);

		const row = getDb()
			.$client.prepare('select notice_at_booking, last_told_notice from booking where submit_token = ?')
			.get(fields.submitToken);
		expect(row).toEqual({ notice_at_booking: notice, last_told_notice: notice });

		const confirmation = await openBooked(booked.redirect.location);
		expect(sentHeaders['cache-control']).toBe('private, no-store');
		expect(confirmation).toEqual({
			data: {
				view: {
					title: 'Gebucht',
					date: 'Dienstag, 12. Januar',
					heading: 'Gebucht!',
					badge: { heat: 'cold', text: 'Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.' },
					changed: null,
					revisit: null,
					keybox: 'Den Schlüsselcode bekommst du am Mo 11. Januar um 18:00.',
					details: {
						when: { term: 'Wann', before: 'Di 12. Januar, ', start: '18:00', datetime: '2027-01-12T17:00:00Z', after: '–19:30' },
						people: { term: 'Personen', value: '3 Personen' },
						cancel: {
							term: 'Absagen',
							before: 'Schreib an ',
							address: 'platzhalter@sauna-luegisee.ch',
							href: 'mailto:platzhalter@sauna-luegisee.ch',
							after: '.'
						}
					},
					another: { href: '/day/2027-01-12', text: 'Weitere Zeit buchen' },
					info: { href: '/info', text: "So funktioniert's" }
				}
			}
		});

		// A revisit (no flags): the same badge plus the revisit line.
		const revisit = await openBooked(`/booked/${publicIdOf(booked)}`);
		expect(revisit).toMatchObject({
			data: {
				view: {
					badge: { heat: 'cold', text: 'Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.' },
					changed: null,
					revisit: 'So stand es bei der Buchung. Änderungen schicken wir dir per Mail.'
				}
			}
		});

		// The page data holds no guest data and no row id.
		const serialised = JSON.stringify(confirmation);
		expect(serialised).not.toMatch(GUEST_DATA);
		expect(serialised).not.toMatch(/"id"|_id"|submit|token|created/i);
		expect(serialised).not.toContain(publicIdOf(booked));
	});

	it('shows a hot booking in English', async () => {
		clock.locale = 'en';
		expect(await submit('2027-01-16', '1700', lena({ duration: '60', notice: await formNotice('2027-01-16', '1700') }))).toMatchObject({
			redirect: { status: 303 }
		});
		const booked = await submit('2027-01-16', '1815', lena({ notice: await formNotice('2027-01-16', '1815') }));
		expect(booked).toEqual({ redirect: { status: 303, location: expect.stringMatching(/\?new=1$/) } });
		if (!('redirect' in booked)) return;
		expect(await openBooked(booked.redirect.location)).toMatchObject({
			data: {
				view: {
					title: 'Booked',
					heading: 'Booked!',
					badge: { heat: 'hot', text: 'Already hot at 18:15.' },
					changed: null,
					revisit: null,
					keybox: "You'll get the keybox code on Fri 15 January at 18:15.",
					details: {
						when: { term: 'When', before: 'Sat 16 January, ', start: '18:15', datetime: '2027-01-16T17:15:00Z', after: '–19:45' },
						people: { term: 'People', value: '3 people' },
						cancel: { term: 'To cancel', before: 'Email ', after: '.' }
					}
				}
			}
		});
	});

	it('books with the fresh notice and flags the change when the form showed another one', async () => {
		// A booking at 20:00 makes 18:15 a start time (90 min, one changeover before it): a cold start.
		expect(await submit('2027-01-17', '2000', lena({ duration: '60', notice: await formNotice('2027-01-17', '2000') }))).toMatchObject({
			redirect: { status: 303 }
		});
		const shown = await formNotice('2027-01-17', '1815');
		expect(JSON.parse(shown)).toMatchObject({ heat: 'cold' });
		// Someone books 17:00–18:00 while the form is open.
		expect(await submit('2027-01-17', '1700', lena({ duration: '60', notice: await formNotice('2027-01-17', '1700') }))).toMatchObject({
			redirect: { status: 303 }
		});
		const fields = lena({ notice: shown });
		const booked = await submit('2027-01-17', '1815', fields);
		expect(booked).toEqual({ redirect: { status: 303, location: expect.stringMatching(/\?new=1&changed=1$/) } });
		if (!('redirect' in booked)) return;
		expect(await openBooked(booked.redirect.location)).toMatchObject({
			data: { view: { badge: { heat: 'hot', text: 'Schon heiss um 18:15.' }, changed: 'Das hat sich gerade geändert.', revisit: null } }
		});
		// A resubmit (a retry after a lost response) returns the same booking with the same answer,
		// and no second row.
		const again = await submit('2027-01-17', '1815', fields);
		expect(again).toEqual({ redirect: { status: 303, location: `/booked/${publicIdOf(booked)}?new=1&changed=1` } });
		const count = getDb()
			.$client.prepare('select count(*) as n from booking where submit_token = ?')
			.get(fields.submitToken);
		expect(count).toEqual({ n: 1 });
		// `changed` without `new` is no fresh visit: a revisit, no changed line.
		expect(await openBooked(`/booked/${publicIdOf(booked)}?changed=1`)).toMatchObject({
			data: { view: { changed: null, revisit: 'So stand es bei der Buchung. Änderungen schicken wir dir per Mail.' } }
		});
	});

	it('says the keybox code is on its way when booked after the cutoff', async () => {
		// Booked 12 January 09:00 for 21:00 the same day.
		const booked = await submit('2027-01-12', '2100', lena({ duration: '60', notice: await formNotice('2027-01-12', '2100') }));
		if (!('redirect' in booked)) throw new Error('not booked');
		expect(await openBooked(booked.redirect.location)).toMatchObject({
			data: { view: { keybox: 'Der Schlüsselcode ist schon unterwegs in dein Postfach.' } }
		});
	});

	it.each([
		['missing', ''],
		['not JSON', 'cold'],
		['not a notice', '{"heat":"warm","earliest":null,"latest":null}'],
		['a hot notice with an arrival', '{"heat":"hot","earliest":"2027-01-14T16:20:00Z","latest":null}']
	])('refuses a notice token that is %s with 400 form_invalid, input kept, nothing booked', async (_name, notice) => {
		const fields = lena({ notice });
		expect(await submit('2027-01-14', '1800', fields)).toEqual({
			failure: {
				status: 400,
				data: {
					errors: { notice: 'form_invalid' },
					values: { name: 'Lena', email: 'lena@example.ch ', mobile: '079 123 45 67', duration: '90', partySize: '3' }
				}
			}
		});
		const count = getDb()
			.$client.prepare('select count(*) as n from booking where submit_token = ?')
			.get(fields.submitToken);
		expect(count).toEqual({ n: 0 });
	});

	it('returns the same confirmation for a resubmit with the same token', async () => {
		const fields = lena({ notice: await formNotice('2027-01-12', '1300') });
		const first = await submit('2027-01-12', '1300', fields);
		expect(first).toEqual({ redirect: { status: 303, location: expect.stringMatching(/\?new=1$/) } });
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
		const publicId = publicIdOf(booked);
		getDb().$client.prepare("update booking set deleted_at = '2027-01-12T08:30:00Z' where public_id = ?").run(publicId);
		expect(await openBooked(`/booked/${publicId}?new=1`)).toEqual({ error: { status: 404 } });
	});

	it('answers an unknown confirmation id with 404', async () => {
		for (const publicId of ['xyz', 'AAAAAAAAAAAAAAAAAAAAAA']) {
			expect(await openBooked(`/booked/${publicId}`)).toEqual({ error: { status: 404 } });
		}
	});
});
