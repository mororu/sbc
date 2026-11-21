// Admin view models: the nav badge counts and the admin home's worker warning (Story 3.1), and the
// home's next bookings and flags (Story 3.2). Text is rendered here on the server (src/lib/time never
// reaches the client); the counts carry no guest data.
import { deriveCallList, workerHealth, type Heartbeat } from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { adminBookingHref } from '#lib/admin-nav.ts';
import { m } from '#lib/paraglide/messages.js';
import {
	addDays,
	compareInstants,
	formatDateShort,
	formatTime,
	localDate,
	toInstant,
	today,
	type Instant,
	type LocalDate,
	type Locale
} from '#lib/time/index.ts';
import { buildAdminRow, isFlagged, loadAdminRowContext, type AdminRow, type AdminRowContext } from './admin-day-view.ts';
import { now as clockNow } from './clock.ts';
import {
	countReplyReminders,
	getAdminBookings,
	getCallFeed,
	getFutureFlagCandidates,
	getHeartbeat,
	type AdminBooking,
	type FlagCandidate
} from './db/queries/index.ts';

/** The two nav badges (UX-DR53): never summed, 0 when empty. */
export type NavCounts = { calls: number; replies: number };

/** The call-list entries (`deriveCallList`, AD-21) and the open reply reminders at `now`. */
export function loadNavCounts(now: Instant = clockNow()): NavCounts {
	return { calls: deriveCallList(getCallFeed(now), now).length, replies: countReplyReminders() };
}

/** "09:55" on the day of `now` (Zurich), else "Mo 11. Januar, 09:55". */
function clockText(at: Instant, now: Instant, locale: Locale): string {
	const date = localDate(at);
	return date === today(now) ? formatTime(at) : `${formatDateShort(date, locale)}, ${formatTime(at)}`;
}

/**
 * The admin home's warning (AD-5), or null while the worker is healthy:
 * - no heartbeat yet: the worker has never run ("Der Versand läuft nicht.");
 * - stale: since the last tick ("Der Versand läuft seit 09:55 nicht.");
 * - failing: the worker ticks, but sends fail since `failing_since`.
 */
export function workerWarning(heartbeat: Heartbeat | null, now: Instant, locale: Locale): string | null {
	const health = workerHealth(heartbeat, now);
	if (health === 'ok') return null;
	if (!heartbeat) return m.admin_worker_not_running({}, { locale });
	if (health === 'stale') return m.admin_worker_stale({ time: clockText(heartbeat.beatAt, now, locale) }, { locale });
	return m.admin_worker_failing({ time: clockText(heartbeat.failingSince ?? heartbeat.beatAt, now, locale) }, { locale });
}

/** One day group of "Nächste Buchungen": "Heute · Di 12. Januar" (an `h3`), its rows or the empty line. */
export type NextGroup = { label: string; rows: AdminRow[]; empty: string | null };

/** A home flag: the count line and one link per booking ("Di 12. Januar, 17:15 · Tom Brunner"). */
export type HomeFlag = { kind: 'outside' | 'refused'; text: string; links: { href: ResolvedPathname; text: string }[] };

export type AdminHomeView = {
	warning: string | null;
	/** Bookings today and tomorrow. */
	next: { heading: string; groups: NextGroup[] };
	/** Bookings outside the current times, then bookings with a refused non-urgent email; only those not started. */
	flags: HomeFlag[];
};

/** Pure: today's and tomorrow's groups. `bookings` are the live bookings of both days, in start order. */
export function buildNextBookings(bookings: AdminBooking[], context: AdminRowContext): AdminHomeView['next'] {
	const { now, locale } = context;
	const day = today(now);
	const group = (date: LocalDate, label: (d: { date: string }) => string): NextGroup => {
		const rows = bookings.filter((b) => localDate(b.start) === date).map((b) => buildAdminRow(b, context));
		return { label: label({ date: formatDateShort(date, locale) }), rows, empty: rows.length ? null : m.admin_day_empty({}, { locale }) };
	};
	return {
		heading: m.admin_next_heading({}, { locale }),
		groups: [
			group(day, (d) => m.admin_group_today(d, { locale })),
			group(addDays(day, 1), (d) => m.admin_group_tomorrow(d, { locale }))
		]
	};
}

/** Pure: the home flags over the bookings that have not started. A flag with no booking is left out. */
export function buildHomeFlags(candidates: FlagCandidate[], context: AdminRowContext): HomeFlag[] {
	const { locale } = context;
	const link = (b: FlagCandidate) => ({
		href: adminBookingHref(b.id),
		text: m.admin_flag_link(
			{ date: formatDateShort(localDate(b.start), locale), time: formatTime(b.start), name: b.name ?? m.admin_no_name({}, { locale }) },
			{ locale }
		)
	});
	const outside = candidates.filter((b) => isFlagged(b, context));
	const refused = candidates.filter((b) => b.refused && compareInstants(b.start, context.now) > 0);
	const flags: HomeFlag[] = [];
	if (outside.length > 0) {
		flags.push({ kind: 'outside', text: m.admin_flag_outside({ count: outside.length }, { locale }), links: outside.map(link) });
	}
	if (refused.length > 0) {
		flags.push({ kind: 'refused', text: m.admin_flag_refused({ count: refused.length }, { locale }), links: refused.map(link) });
	}
	return flags;
}

export function loadAdminHome(
	locale: Locale,
	now: Instant = clockNow(),
	db?: Parameters<typeof getHeartbeat>[0]
): AdminHomeView {
	const context = loadAdminRowContext(locale, now, db);
	const day = today(now);
	const bookings = getAdminBookings(toInstant(day, 0), toInstant(addDays(day, 2), 0), db);
	return {
		warning: workerWarning(getHeartbeat(db), now, locale),
		next: buildNextBookings(bookings, context),
		flags: buildHomeFlags(getFutureFlagCandidates(now, db), context)
	};
}
