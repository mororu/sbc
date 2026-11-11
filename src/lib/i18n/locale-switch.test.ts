import { describe, expect, it } from 'vitest';
import { htmlLang, returnQuery, safeReturnPath } from './locale-switch.ts';

describe('safeReturnPath', () => {
	it.each([
		['/info?x=1', '/info?x=1'],
		['/', '/'],
		['/day/2027-01-12', '/day/2027-01-12'],
		['/über?q=ä', '/%C3%BCber?q=%C3%A4']
	])('keeps the same-origin path %s', (to, expected) => {
		expect(safeReturnPath(to)).toBe(expected);
	});

	it.each([
		['missing', null],
		['empty', ''],
		['absolute URL', 'https://evil.example/'],
		['protocol-relative', '//evil.example'],
		['backslash trick', '/\\evil.example'],
		['relative path', 'info'],
		['javascript URL', 'javascript:alert(1)'],
		['newline', '/info\nSet-Cookie: x=1']
	])('falls back to / for %s', (_label, to) => {
		expect(safeReturnPath(to)).toBe('/');
	});
});

describe('returnQuery', () => {
	it('returns to the current path and query', () => {
		expect(returnQuery('/info', '?x=1')).toBe('?to=%2Finfo%3Fx%3D1');
	});
});

describe('htmlLang', () => {
	it('maps de to de-CH and keeps en', () => {
		expect(htmlLang('de')).toBe('de-CH');
		expect(htmlLang('en')).toBe('en');
	});
});
