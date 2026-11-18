// Admin view models (Story 3.1): the nav badge counts and the admin home's worker warning. Text is
// rendered here on the server (src/lib/time never reaches the client); counts carry no guest data.
import { deriveCallList, workerHealth, type Heartbeat } from '#lib/domain/index.ts';
import { m } from '#lib/paraglide/messages.js';
import { formatDateShort, formatTime, localDate, today, type Instant, type Locale } from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';
import { countReplyReminders, getCallFeed, getHeartbeat } from './db/queries/index.ts';

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

export type AdminHomeView = { warning: string | null };

export function loadAdminHome(locale: Locale, now: Instant = clockNow()): AdminHomeView {
	return { warning: workerWarning(getHeartbeat(), now, locale) };
}
