// Client decisions for switching days in the calendar day view, and the pending submit token.
// Plain TypeScript: no Svelte, no #lib/time, so it can run in the browser and be unit-tested.
// Paths are root-relative pathnames: like the server view models, these helpers assume the app has
// no base path (`kit.paths.base` is empty).
import { RANDOM_ID } from '#lib/schemas/booking.ts';

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

/** The URL without the refusal query (`error`, `time`), or null when it has neither. */
export function withoutDayError(url: URL): URL | null {
	if (!url.searchParams.has('error') && !url.searchParams.has('time')) return null;
	const clean = new URL(url.href);
	clean.searchParams.delete('error');
	clean.searchParams.delete('time');
	return clean;
}

/** The confirmation URL without its one-time flags (`new`, `changed`), or null when it has neither. */
export function withoutBookedFlags(url: URL): URL | null {
	if (!url.searchParams.has('new') && !url.searchParams.has('changed')) return null;
	const clean = new URL(url.href);
	clean.searchParams.delete('new');
	clean.searchParams.delete('changed');
	return clean;
}

/** The skip link's target: the start-time list on a day page, otherwise `main`. */
export function skipTarget(pageData: unknown): 'times' | 'main' {
	const page = (pageData as { page?: { kind?: unknown } } | null | undefined)?.page;
	return page?.kind === 'day' ? 'times' : 'main';
}

// ---------------------------------------------------------------------------
// Pending submit (resume after a lost response). The booking form stores the submit token it sent,
// with the form's path, in sessionStorage. A reload of the form after the booking went through
// redirects to the day with the conflict (or, after the start, the past) message; the day page then
// looks the token up and goes on to the guest's own confirmation. The token never goes into a URL or cookie. Every access swallows
// errors: without storage the pages work as before, only without the resume.
// ---------------------------------------------------------------------------

export const PENDING_KEY = 'sauna-booking.pending';

/** The submit token a form sent, and the form's path (`/book/{date}/{hhmm}`). */
export type Pending = { path: string; token: string };

/** The parts of `Storage` the helpers use. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const BOOK_PATH = /^\/book\/[^/]+\/[^/]+$/;

/** The browser's sessionStorage, or null when it is off or blocked (reading it can throw). */
export function sessionStore(): StorageLike | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage;
	} catch {
		return null;
	}
}

/** The stored pending submit, or null when there is none or it is not well-formed. */
export function readPending(storage: StorageLike | null): Pending | null {
	try {
		const value = JSON.parse(storage?.getItem(PENDING_KEY) ?? 'null') as Partial<Pending> | null;
		if (!value || typeof value.path !== 'string' || typeof value.token !== 'string') return null;
		if (!BOOK_PATH.test(value.path) || !RANDOM_ID.test(value.token)) return null;
		return { path: value.path, token: value.token };
	} catch {
		return null;
	}
}

/** Stores the token a form at `path` is sending. Only one is kept: the latest submit. */
export function writePending(storage: StorageLike | null, path: string, token: string): void {
	try {
		storage?.setItem(PENDING_KEY, JSON.stringify({ path, token } satisfies Pending));
	} catch {
		// Storage can be off (private mode, quota): the form still works.
	}
}

/** Forgets the pending submit. */
export function clearPending(storage: StorageLike | null): void {
	try {
		storage?.removeItem(PENDING_KEY);
	} catch {
		// Nothing to forget, or not writable.
	}
}

/**
 * The token to look up on a day page: only for a refusal message (`?error=conflict|past&time=hhmm`)
 * on `/day/{date}` whose form path is the pending one. `past` too: a guest whose response was lost
 * may reload the form only after the start, and then gets the past message. Otherwise null.
 */
export function resumeToken(url: URL, date: string, pending: Pending | null): string | null {
	const error = url.searchParams.get('error');
	if (!pending || (error !== 'conflict' && error !== 'past')) return null;
	const time = url.searchParams.get('time');
	if (!time) return null;
	return pending.path === `/book/${date}/${time}` ? pending.token : null;
}

/** The form's hidden submit token: the pending one on the same form path, else the server's fresh one. */
export function formToken(pending: Pending | null, path: string, fresh: string): string {
	return pending?.path === path ? pending.token : fresh;
}

/** The sessionStorage key of the contact details the booking form keeps (name, email, mobile). */
export const CONTACT_KEY = 'sauna-booking.contact';

/**
 * After a booking was found made (`location` is a confirmation, `/booked/…`): the contact details
 * and the pending submit are removed. Returns true when it removed them.
 */
export function forgetAfterBooking(storage: StorageLike | null, location: string): boolean {
	if (!location.startsWith('/booked/')) return false;
	try {
		storage?.removeItem(CONTACT_KEY);
	} catch {
		// Storage can be off: nothing was kept then.
	}
	clearPending(storage);
	return true;
}

/**
 * After the form's own redirect. Any redirect is the server's answer to this token, so nothing is
 * lost and the pending submit goes; otherwise a token whose booking an admin deleted would be sent
 * again by the next form on this path and get a false conflict. The contact details go only when
 * the redirect is to a confirmation (a conflict keeps them for the next try).
 */
export function afterFormRedirect(storage: StorageLike | null, location: string): void {
	clearPending(storage);
	forgetAfterBooking(storage, location);
}

/** What the token lookup (`POST /booked`) said. */
export type Lookup = { kind: 'booked'; href: string } | { kind: 'unknown' } | { kind: 'retry' };

/**
 * Asks `POST /booked` where the booking a token made lives. `booked`: its confirmation href.
 * `unknown`: no live booking (404) or a token the server refuses (400), so it can be forgotten.
 * `retry`: a network or server error; keep the token for the next reload.
 */
export async function lookupBooking(url: string, token: string, fetcher: typeof fetch): Promise<Lookup> {
	let res: Response;
	try {
		res = await fetcher(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ submitToken: token })
		});
	} catch {
		return { kind: 'retry' };
	}
	if (res.status === 404 || res.status === 400) return { kind: 'unknown' };
	if (!res.ok) return { kind: 'retry' };
	try {
		const href = ((await res.json()) as { href?: unknown } | null)?.href;
		if (typeof href === 'string' && href.startsWith('/booked/')) return { kind: 'booked', href };
	} catch {
		// Not the expected answer: treat as a passing failure.
	}
	return { kind: 'retry' };
}

/** What `resumePending` did. */
export type Resume = 'booked' | 'left' | 'unknown' | 'retry';

/**
 * The resume sequence on a day page, for a token `resumeToken` found:
 * - booked, and the guest is still on the page that started it (`stillHere`): forget the contact
 *   details and the pending submit first (they must go even if the navigation fails), then
 *   `navigate` to the confirmation. A rejecting `navigate` propagates, with storage already clear;
 * - booked, but the guest has navigated since: `left`, nothing is touched, so a reload resumes;
 * - unknown (404 or 400): forget the pending submit; the message stands;
 * - retry (network or server error): keep it for the next reload.
 */
export async function resumePending(options: {
	storage: StorageLike | null;
	fetcher: typeof fetch;
	endpoint: string;
	token: string;
	stillHere: () => boolean;
	navigate: (href: string) => Promise<void>;
}): Promise<Resume> {
	const found = await lookupBooking(options.endpoint, options.token, options.fetcher);
	if (found.kind === 'unknown') {
		clearPending(options.storage);
		return 'unknown';
	}
	if (found.kind === 'retry') return 'retry';
	if (!options.stillHere()) return 'left';
	forgetAfterBooking(options.storage, found.href);
	await options.navigate(found.href);
	return 'booked';
}
