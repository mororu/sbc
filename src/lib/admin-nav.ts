// The admin nav (UX-DR46; Story 3.1): the five tabs and which one a path belongs to, the admin page
// hrefs, and the client decisions for switching days in the admin day view (Story 3.2). Client-safe:
// no framework or server imports. Hrefs are root-relative (the app has no base path); Blocks has its
// routes since Story 3.5, later stories add those behind Einstellungen and Auswertung.
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

/** `/admin/day/{date}`: the admin day view. */
export const adminDayHref = (date: string) => `/admin/day/${date}` as ResolvedPathname;

/** `/admin/booking/{id}`: a booking's detail. */
export const adminBookingHref = (id: number) => `/admin/booking/${id}` as ResolvedPathname;

const ADMIN_DAY_PATH = /^\/admin\/day\/([^/]+)$/;

/** True for a path that shows an admin day (or redirects to one): `/admin/day` and `/admin/day/{anything}`. */
export function isAdminDayPath(pathname: string | null | undefined): boolean {
	return !!pathname && (pathname === '/admin/day' || ADMIN_DAY_PATH.test(pathname));
}

/** The parts of the admin day view model the client helpers need. */
export type AdminNavView = { strip: { date: string; href: string | null }[] };

/**
 * The strip day to select at once while `pathname` loads: the date of `/admin/day/{date}` when it is
 * a strip cell, else null (the current selection then stays). `/admin/day` picks its day on the server.
 */
export function pendingAdminDay(pathname: string | null | undefined, view: AdminNavView): string | null {
	const date = pathname ? ADMIN_DAY_PATH.exec(pathname)?.[1] : undefined;
	if (!date) return null;
	return view.strip.some((cell) => cell.date === date && cell.href !== null) ? date : null;
}

/** The admin skip link's target: the bookings list on an admin day page, otherwise `main`. */
export function adminSkipTarget(pageData: unknown): 'bookings' | 'main' {
	const view = (pageData as { view?: { kind?: unknown } } | null | undefined)?.view;
	return view?.kind === 'admin-day' ? 'bookings' : 'main';
}
