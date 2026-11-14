import { describe, expect, it } from 'vitest';
import {
	afterFormRedirect,
	clearPending,
	CONTACT_KEY,
	forgetAfterBooking,
	formToken,
	lookupBooking,
	isDayPath,
	pendingDay,
	PENDING_KEY,
	readPending,
	resumePending,
	resumeToken,
	shouldAnnounce,
	skipTarget,
	withoutBookedFlags,
	withoutDayError,
	writePending,
	type NavView
} from './day-nav.ts';

const view: NavView = {
	home: '2027-01-12',
	strip: [
		{ date: '2027-01-12', href: '/day/2027-01-12' },
		{ date: '2027-01-13', href: '/day/2027-01-13' },
		{ date: '2027-01-14', href: null }
	]
};
const at = (path: string) => ({ url: new URL(`http://localhost${path}`) });

describe('pendingDay', () => {
	it('selects the home day for /', () => {
		expect(pendingDay('/', view)).toBe('2027-01-12');
	});

	it('selects a selectable strip day', () => {
		expect(pendingDay('/day/2027-01-13', view)).toBe('2027-01-13');
	});

	it.each([
		['a struck-through day', '/day/2027-01-14'],
		['a day outside the strip', '/day/2027-03-01'],
		['garbage', '/day/abc'],
		['another page', '/info'],
		['no navigation', null]
	])('selects nothing for %s', (_label, path) => {
		expect(pendingDay(path, view)).toBeNull();
	});
});

describe('isDayPath', () => {
	it.each([
		['/', true],
		['/day/2027-01-13', true],
		['/day/abc', true],
		['/info', false],
		['/day/2027-01-13/x', false],
		[undefined, false]
	])('%s is %s', (path, expected) => {
		expect(isDayPath(path)).toBe(expected);
	});
});

describe('shouldAnnounce', () => {
	it('announces a switch to another day', () => {
		expect(shouldAnnounce({ type: 'link', from: at('/day/2027-01-12'), to: at('/day/2027-01-13') })).toBe(true);
		expect(shouldAnnounce({ type: 'popstate', from: at('/day/2027-01-13'), to: at('/') })).toBe(true);
	});

	it('stays silent on first load, on the same path and on hash links', () => {
		expect(shouldAnnounce({ type: 'enter', from: null, to: at('/') })).toBe(false);
		expect(shouldAnnounce({ type: 'link', from: at('/day/2027-01-13'), to: at('/day/2027-01-13') })).toBe(false);
		expect(shouldAnnounce({ type: 'link', from: at('/day/2027-01-13'), to: at('/day/2027-01-13#times') })).toBe(false);
		expect(shouldAnnounce({ type: 'popstate', from: at('/day/2027-01-13#times'), to: at('/day/2027-01-13') })).toBe(false);
	});
});

describe('skipTarget', () => {
	it('targets the list on a day page and main elsewhere', () => {
		expect(skipTarget({ page: { kind: 'day' } })).toBe('times');
		expect(skipTarget({ page: { kind: 'season' } })).toBe('main');
		expect(skipTarget({})).toBe('main');
		expect(skipTarget(null)).toBe('main');
	});
});

describe('withoutBookedFlags', () => {
	it('drops new and changed, keeps everything else', () => {
		const id = 'AAAAAAAAAAAAAAAAAAAAAA';
		expect(withoutBookedFlags(new URL(`http://x/booked/${id}?new=1&changed=1`))?.href).toBe(`http://x/booked/${id}`);
		expect(withoutBookedFlags(new URL(`http://x/booked/${id}?new=1`))?.href).toBe(`http://x/booked/${id}`);
		expect(withoutBookedFlags(new URL(`http://x/booked/${id}?a=1&new=1#main`))?.href).toBe(
			`http://x/booked/${id}?a=1#main`
		);
	});

	it('returns null when there is nothing to drop', () => {
		expect(withoutBookedFlags(new URL('http://x/booked/AAAAAAAAAAAAAAAAAAAAAA'))).toBeNull();
		expect(withoutBookedFlags(new URL('http://x/booked/AAAAAAAAAAAAAAAAAAAAAA?a=1'))).toBeNull();
	});
});

describe('withoutDayError', () => {
	it('drops error and time, keeps everything else', () => {
		expect(withoutDayError(new URL('http://x/day/2027-01-12?error=conflict&time=1800'))?.href).toBe(
			'http://x/day/2027-01-12'
		);
		expect(withoutDayError(new URL('http://x/day/2027-01-12?a=1&error=past&time=1800#times'))?.href).toBe(
			'http://x/day/2027-01-12?a=1#times'
		);
	});

	it('returns null when there is nothing to drop', () => {
		expect(withoutDayError(new URL('http://x/day/2027-01-12'))).toBeNull();
		expect(withoutDayError(new URL('http://x/day/2027-01-12?a=1'))).toBeNull();
	});
});

describe('pending submit', () => {
	const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAA';
	const memory = () => {
		const items = new Map<string, string>();
		return {
			items,
			getItem: (k: string) => items.get(k) ?? null,
			setItem: (k: string, v: string) => void items.set(k, v),
			removeItem: (k: string) => void items.delete(k)
		};
	};
	const broken = {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {
			throw new Error('quota');
		},
		removeItem: () => {
			throw new Error('denied');
		}
	};

	it('writes, reads and clears one pending submit', () => {
		const s = memory();
		expect(readPending(s)).toBeNull();
		writePending(s, '/book/2027-01-12/1800', TOKEN_A);
		expect(readPending(s)).toEqual({ path: '/book/2027-01-12/1800', token: TOKEN_A });
		writePending(s, '/book/2027-01-12/1900', TOKEN_A);
		expect(readPending(s)?.path).toBe('/book/2027-01-12/1900');
		clearPending(s);
		expect(readPending(s)).toBeNull();
		expect(s.items.has(PENDING_KEY)).toBe(false);
	});

	it.each([
		['not JSON', '{'],
		['no token', '{"path":"/book/2027-01-12/1800"}'],
		['a malformed token', '{"path":"/book/2027-01-12/1800","token":"short"}'],
		['another path', `{"path":"/info","token":"${TOKEN_A}"}`]
	])('ignores %s', (_label, raw) => {
		const s = memory();
		s.setItem(PENDING_KEY, raw);
		expect(readPending(s)).toBeNull();
	});

	it('swallows storage errors and missing storage', () => {
		expect(() => writePending(broken, '/book/2027-01-12/1800', TOKEN_A)).not.toThrow();
		expect(readPending(broken)).toBeNull();
		expect(() => clearPending(broken)).not.toThrow();
		expect(readPending(null)).toBeNull();
		expect(() => writePending(null, '/book/2027-01-12/1800', TOKEN_A)).not.toThrow();
	});

	it('resumes only a conflict or past message for the pending form path', () => {
		const pending = { path: '/book/2027-01-12/1800', token: TOKEN_A };
		const url = (q: string) => new URL(`http://x/day/2027-01-12${q}`);
		expect(resumeToken(url('?error=conflict&time=1800'), '2027-01-12', pending)).toBe(TOKEN_A);
		// Path mismatch: another time, another day, or no pending at all.
		expect(resumeToken(url('?error=conflict&time=1900'), '2027-01-12', pending)).toBeNull();
		expect(resumeToken(url('?error=conflict&time=1800'), '2027-01-13', pending)).toBeNull();
		expect(resumeToken(url('?error=conflict&time=1800'), '2027-01-12', null)).toBeNull();
		// A reload after the start: the form redirects with the past message.
		expect(resumeToken(url('?error=past&time=1800'), '2027-01-12', pending)).toBe(TOKEN_A);
		expect(resumeToken(url('?error=past&time=1900'), '2027-01-12', pending)).toBeNull();
		// No refusal, or an unknown one.
		expect(resumeToken(url('?error=oops&time=1800'), '2027-01-12', pending)).toBeNull();
		expect(resumeToken(url('?time=1800'), '2027-01-12', pending)).toBeNull();
		expect(resumeToken(url(''), '2027-01-12', pending)).toBeNull();
	});

	it('gives the form the pending token only on its own path', () => {
		const pending = { path: '/book/2027-01-12/1800', token: TOKEN_A };
		const fresh = 'FRESHFRESHFRESHFRESH00';
		expect(formToken(pending, '/book/2027-01-12/1800', fresh)).toBe(TOKEN_A);
		expect(formToken(pending, '/book/2027-01-12/1900', fresh)).toBe(fresh);
		expect(formToken(null, '/book/2027-01-12/1800', fresh)).toBe(fresh);
	});

	it('forgets the contact details and the pending submit after a booking, not after a conflict', () => {
		const s = memory();
		s.setItem(CONTACT_KEY, '{"name":"Lena"}');
		writePending(s, '/book/2027-01-12/1800', TOKEN_A);
		expect(forgetAfterBooking(s, '/day/2027-01-12?error=conflict&time=1800')).toBe(false);
		expect(s.items.size).toBe(2);
		expect(forgetAfterBooking(s, `/booked/${TOKEN_A}?new=1`)).toBe(true);
		expect(s.items.size).toBe(0);
		expect(forgetAfterBooking(broken, `/booked/${TOKEN_A}?new=1`)).toBe(true);
	});

	describe('lookupBooking', () => {
		const answer = (res: Response | Error) => {
			const calls: { url: string; init?: RequestInit }[] = [];
			const fetcher = (async (url: string, init?: RequestInit) => {
				calls.push({ url, init });
				if (res instanceof Error) throw res;
				return res;
			}) as unknown as typeof fetch;
			return { calls, fetcher };
		};

		it('posts the token in the body and returns the confirmation href', async () => {
			const { calls, fetcher } = answer(Response.json({ href: `/booked/${TOKEN_A}?new=1` }));
			expect(await lookupBooking('/booked', TOKEN_A, fetcher)).toEqual({ kind: 'booked', href: `/booked/${TOKEN_A}?new=1` });
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe('/booked');
			expect(calls[0].init?.method).toBe('POST');
			expect(JSON.parse(String(calls[0].init?.body))).toEqual({ submitToken: TOKEN_A });
		});

		it.each([404, 400])('treats %i as unknown', async (status) => {
			const { fetcher } = answer(new Response(null, { status }));
			expect(await lookupBooking('/booked', TOKEN_A, fetcher)).toEqual({ kind: 'unknown' });
		});

		it.each([
			['a network error', new TypeError('offline')],
			['a server error', new Response(null, { status: 500 })],
			['an unexpected body', Response.json({ href: 'https://evil.example' })],
			['a body that is not JSON', new Response('nope', { status: 200 })]
		])('keeps the token for a retry after %s', async (_label, res) => {
			const { fetcher } = answer(res);
			expect(await lookupBooking('/booked', TOKEN_A, fetcher)).toEqual({ kind: 'retry' });
		});
	});

	describe('afterFormRedirect', () => {
		it('clears the pending submit on any redirect, the contact details only after a booking', () => {
			const s = memory();
			s.setItem(CONTACT_KEY, '{"name":"Lena"}');
			writePending(s, '/book/2027-01-12/1800', TOKEN_A);
			afterFormRedirect(s, '/day/2027-01-12?error=conflict&time=1800');
			expect(readPending(s)).toBeNull();
			expect(s.items.get(CONTACT_KEY)).toBe('{"name":"Lena"}');

			writePending(s, '/book/2027-01-12/1800', TOKEN_A);
			afterFormRedirect(s, `/booked/${TOKEN_A}?new=1`);
			expect(s.items.size).toBe(0);
			expect(() => afterFormRedirect(broken, '/day/2027-01-12')).not.toThrow();
		});
	});

	describe('resumePending', () => {
		const HREF = `/booked/${TOKEN_A}?new=1`;
		const setup = (res: Response | Error, options: { stillHere?: boolean; navigateFails?: boolean } = {}) => {
			const s = memory();
			s.setItem(CONTACT_KEY, '{"name":"Lena"}');
			writePending(s, '/book/2027-01-12/1800', TOKEN_A);
			const navigated: { href: string; storageAtNavigate: number }[] = [];
			const fetcher = (async () => {
				if (res instanceof Error) throw res;
				return res;
			}) as unknown as typeof fetch;
			const run = () =>
				resumePending({
					storage: s,
					fetcher,
					endpoint: '/booked',
					token: TOKEN_A,
					stillHere: () => options.stillHere ?? true,
					navigate: async (href) => {
						navigated.push({ href, storageAtNavigate: s.items.size });
						if (options.navigateFails) throw new Error('navigation aborted');
					}
				});
			return { s, navigated, run };
		};

		it('booked: clears storage before it navigates to the confirmation', async () => {
			const { s, navigated, run } = setup(Response.json({ href: HREF }));
			expect(await run()).toBe('booked');
			expect(navigated).toEqual([{ href: HREF, storageAtNavigate: 0 }]);
			expect(s.items.size).toBe(0);
		});

		it('booked, but the guest navigated since: no navigation, storage kept for a reload', async () => {
			const { s, navigated, run } = setup(Response.json({ href: HREF }), { stillHere: false });
			expect(await run()).toBe('left');
			expect(navigated).toEqual([]);
			expect(readPending(s)?.token).toBe(TOKEN_A);
			expect(s.items.has(CONTACT_KEY)).toBe(true);
		});

		it('unknown: clears the pending submit, keeps the contact details, no navigation', async () => {
			const { s, navigated, run } = setup(new Response(null, { status: 404 }));
			expect(await run()).toBe('unknown');
			expect(navigated).toEqual([]);
			expect(readPending(s)).toBeNull();
			expect(s.items.has(CONTACT_KEY)).toBe(true);
		});

		it('retry: keeps everything, no navigation', async () => {
			const { s, navigated, run } = setup(new TypeError('offline'));
			expect(await run()).toBe('retry');
			expect(navigated).toEqual([]);
			expect(s.items.size).toBe(2);
		});

		it('a failing navigation propagates, with storage already cleared', async () => {
			const { s, navigated, run } = setup(Response.json({ href: HREF }), { navigateFails: true });
			await expect(run()).rejects.toThrow('navigation aborted');
			expect(navigated).toHaveLength(1);
			expect(s.items.size).toBe(0);
		});
	});
});
