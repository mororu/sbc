// Worker health (Story 2.5; AD-5): whether the worker runs and whether mail goes out, from the one
// heartbeat row. Epic 3's admin home shows it. Pure: `now` is always a parameter.
import { minutesBetween, type Instant } from '#lib/time/index.ts';

/** The heartbeat is stale once the last tick is this many minutes old: the worker does not run. */
export const HEARTBEAT_STALE_MIN = 5;

/** The worker is failing once every send has failed transiently for this many minutes. */
export const SEND_FAILING_MIN = 15;

/** The heartbeat row: the last tick, and the first transient send failure since the last accepted send. */
export type Heartbeat = { beatAt: Instant; failingSince: Instant | null };

/**
 * - `stale`: no heartbeat yet, or the last tick is at least 5 minutes old (wins over `failing`);
 * - `failing`: the worker ticks, but sends have failed transiently for at least 15 minutes;
 * - `ok`: otherwise.
 */
export type WorkerHealth = 'ok' | 'stale' | 'failing';

export function workerHealth(heartbeat: Heartbeat | null, now: Instant): WorkerHealth {
	if (!heartbeat || minutesBetween(heartbeat.beatAt, now) >= HEARTBEAT_STALE_MIN) return 'stale';
	if (heartbeat.failingSince !== null && minutesBetween(heartbeat.failingSince, now) >= SEND_FAILING_MIN) {
		return 'failing';
	}
	return 'ok';
}
