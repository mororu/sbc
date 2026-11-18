// The admin nav (UX-DR46; Story 3.1): the five tabs and which one a path belongs to. Client-safe: no
// framework or server imports. Hrefs are root-relative (the app has no base path); later stories
// add the routes behind Buchungen, Blocks, Einstellungen and Auswertung.
import type { ResolvedPathname } from '$app/types';

export const ADMIN_TABS = ['home', 'day', 'blocks', 'settings', 'analytics'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_TAB_HREF: Record<AdminTab, ResolvedPathname> = {
	home: '/admin' as ResolvedPathname,
	day: '/admin/day' as ResolvedPathname,
	blocks: '/admin/blocks' as ResolvedPathname,
	settings: '/admin/settings' as ResolvedPathname,
	analytics: '/admin/analytics' as ResolvedPathname
};

/** Pages that belong to a tab without sitting under its href: a booking's detail is under Buchungen. */
const ALSO: Partial<Record<AdminTab, string[]>> = { day: ['/admin/booking'] };

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The tab `pathname` belongs to, or null. Übersicht is only the admin home itself. */
export function activeAdminTab(pathname: string): AdminTab | null {
	if (pathname === '/admin' || pathname === '/admin/') return 'home';
	for (const tab of ADMIN_TABS) {
		if (tab === 'home') continue;
		if ([ADMIN_TAB_HREF[tab], ...(ALSO[tab] ?? [])].some((prefix) => under(pathname, prefix))) return tab;
	}
	return null;
}
