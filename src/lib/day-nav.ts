// Client decisions for switching days in the calendar day view. Plain TypeScript: no Svelte, no
// #lib/time, so it can run in the browser and be unit-tested. Paths are pathnames without a base.

const DAY_PATH = /^\/day\/([^/]+)$/;

/** The parts of the day view model this module needs. */
export type NavView = { home: string; strip: { date: string; href: string | null }[] };

type NavTarget = { url: URL } | null | undefined;

/** True for a path that shows a day page (or redirects to one): `/` and `/day/{anything}`. */
export function isDayPath(pathname: string | null | undefined): boolean {
	return !!pathname && (pathname === '/' || DAY_PATH.test(pathname));
}

/**
 * The strip day to select at once while `pathname` loads: `/` is the home day, `/day/{date}` that
 * date. Null when it is not a selectable strip cell (the current selection then stays).
 */
export function pendingDay(pathname: string | null | undefined, view: NavView): string | null {
	if (!pathname) return null;
	const date = pathname === '/' ? view.home : DAY_PATH.exec(pathname)?.[1];
	if (!date) return null;
	return view.strip.some((cell) => cell.date === date && cell.href !== null) ? date : null;
}

/**
 * Announce the status line only after a real switch: not on first load, and not when the pathname
 * stays the same (a hash link such as the skip link, Back from `#times`, the selected cell again).
 */
export function shouldAnnounce(nav: { type: string; from?: NavTarget; to?: NavTarget }): boolean {
	if (nav.type === 'enter' || !nav.from || !nav.to) return false;
	return nav.from.url.pathname !== nav.to.url.pathname;
}

/** The skip link's target: the start-time list on a day page, otherwise `main`. */
export function skipTarget(pageData: unknown): 'times' | 'main' {
	const page = (pageData as { page?: { kind?: unknown } } | null | undefined)?.page;
	return page?.kind === 'day' ? 'times' : 'main';
}
