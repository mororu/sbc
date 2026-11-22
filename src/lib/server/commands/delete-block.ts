// deleteBlock (FR-19; AD-2, AD-6; Story 3.5): one BEGIN IMMEDIATE transaction. It recomputes the
// impact the dialog showed (`getBlockDeletion`, the same query and core as the dialog) and refuses,
// in this order: `not_found` (unknown, e.g. deleted by another admin), `past` (the start has come)
// and `stale` (the posted impact token differs from the recomputed one). Otherwise it removes the
// block's row (blocks have no soft delete) and lets the heat-change helper upsert or cancel the
// affected booking's heat-change row. Never throws for an expected outcome.
import { eq } from 'drizzle-orm';
import { impactToken } from '#lib/domain/index.ts';
import type { Instant, LocalDate } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getBlockDeletion } from '../db/queries/index.ts';
import { block } from '../db/schema.ts';
import { enqueueHeatChanges } from './heat-change.ts';

export type DeleteBlockInput = {
	blockId: number;
	/** The impact token the dialog showed (`impactToken`). */
	impactToken: string;
};

export type DeleteBlockResult =
	/** `date`: the local date of the deleted block. */
	| { ok: true; date: LocalDate }
	| { ok: false; code: 'not_found' | 'past' | 'stale' };

export function deleteBlock(input: DeleteBlockInput, options: { now?: Instant; db?: Db } = {}): DeleteBlockResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	if (!Number.isSafeInteger(input.blockId) || input.blockId < 1) return { ok: false, code: 'not_found' };
	const run = db.$client.transaction((): DeleteBlockResult => {
		const deletion = getBlockDeletion(input.blockId, now, db);
		if (!deletion) return { ok: false, code: 'not_found' };
		if (deletion.started) return { ok: false, code: 'past' };
		if (impactToken(deletion.impact) !== input.impactToken) return { ok: false, code: 'stale' };

		db.delete(block).where(eq(block.id, input.blockId)).run();
		// After the delete, so the helper's notice no longer sees the block.
		const affected = deletion.impact.affected;
		if (affected) enqueueHeatChanges([affected.id], { now, db });
		return { ok: true, date: deletion.date };
	});
	return run.immediate();
}
