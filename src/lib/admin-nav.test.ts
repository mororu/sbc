import { describe, expect, it } from 'vitest';
import { activeAdminTab } from './admin-nav.ts';

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
