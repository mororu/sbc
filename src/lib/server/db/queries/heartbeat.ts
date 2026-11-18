// The worker heartbeat, for `workerHealth` (Story 2.5): the admin home reads it (Epic 3).
import { eq } from 'drizzle-orm';
import type { Heartbeat } from '#lib/domain/index.ts';
import { getDb, type Db } from '../index.ts';
import { workerHeartbeat } from '../schema.ts';

/** The one heartbeat row, or null before the worker's first tick. */
export function getHeartbeat(db: Db = getDb()): Heartbeat | null {
	return (
		db
			.select({ beatAt: workerHeartbeat.beatAt, failingSince: workerHeartbeat.failingSince })
			.from(workerHeartbeat)
			.where(eq(workerHeartbeat.id, 1))
			.get() ?? null
	);
}
