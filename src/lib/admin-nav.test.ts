import { describe, expect, it } from 'vitest';
import { activeAdminTab, adminSkipTarget, isAdminDayPath, pendingAdminDay } from './admin-nav.ts';

describe('activeAdminTab', () => {
	it.each([
		['/admin', 'home'],
		['/admin/', 'home'],
		['/admin/day/2027-01-12', 'day'],
		['/admin/day', 'day'],
		['/admin/booking/12', 'day'],
		['/admin/blocks/new', 'blocks'],
		['/admin/settings', 'settings'],
		['/admin/analytics', 'analytics'],
		['/admin/dayx', null],
		['/admin/unknown', null]
	])('%s is %s', (path, tab) => {
		expect(activeAdminTab(path)).toBe(tab);
	});
});

describe('isAdminDayPath', () => {
	it.each([
		['/admin/day', true],
		['/admin/day/2027-01-12', true],
		['/admin/day/x', true],
		['/admin/booking/12', false],
		['/admin', false],
		['/day/2027-01-12', false],
		['/admin/day/2027-01-12/x', false],
		[null, false],
		[undefined, false]
	])('%s is %s', (path, expected) => {
		expect(isAdminDayPath(path)).toBe(expected);
	});
});

describe('pendingAdminDay', () => {
	const view = {
		strip: [
			{ date: '2027-01-12', href: '/admin/day/2027-01-12' },
			{ date: '2027-04-05', href: '/admin/day/2027-04-05' }
		]
	};

	it('selects a strip day at once', () => {
		expect(pendingAdminDay('/admin/day/2027-04-05', view)).toBe('2027-04-05');
	});

	it('keeps the selection for a day outside the strip, the default route and other pages', () => {
		expect(pendingAdminDay('/admin/day/2026-12-01', view)).toBeNull();
		expect(pendingAdminDay('/admin/day', view)).toBeNull();
		expect(pendingAdminDay('/admin/booking/1', view)).toBeNull();
		expect(pendingAdminDay(undefined, view)).toBeNull();
	});
});

describe('adminSkipTarget', () => {
	it('skips to the bookings on an admin day page, else to main', () => {
		expect(adminSkipTarget({ view: { kind: 'admin-day' } })).toBe('bookings');
		expect(adminSkipTarget({ view: { kind: 'admin-booking' } })).toBe('main');
		expect(adminSkipTarget({})).toBe('main');
		expect(adminSkipTarget(null)).toBe('main');
	});
});
