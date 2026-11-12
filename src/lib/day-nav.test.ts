import { describe, expect, it } from 'vitest';
import { isDayPath, pendingDay, shouldAnnounce, skipTarget, withoutDayError, type NavView } from './day-nav.ts';

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
