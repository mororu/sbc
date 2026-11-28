// createBlock (FR-17; AD-2, AD-6, AD-8; Story 3.5): one BEGIN IMMEDIATE transaction. It recomputes
// the check the dialog showed (`getBlockCheck`, the same query and core as "Prüfen") and refuses, in
// this order: `invalid` (malformed instants or reason, an end not after the start, a block across
// midnight, a time off the 5-minute step), `past` (the start has come), `conflict` (it overlaps a
// live booking or sits inside the changeover gap of a back-to-back pair) and `stale` (the posted impact token differs from the
// recomputed one: a booking, block or pre-heat change since "Prüfen"). Otherwise it inserts the
// block and lets the heat-change helper upsert or cancel the affected booking's heat-change row.
// Never removes a booking. Never throws for an expected outcome.
import { impactToken } from '#lib/domain/index.ts';
import { compareInstants, isValidInstant, localDate, localMinuteOfDay, type Instant, type LocalDate } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getBlockCheck } from '../db/queries/index.ts';
import { block, BLOCK_REASONS } from '../db/schema.ts';
import { enqueueHeatChanges } from './heat-change.ts';

export type CreateBlockInput = {
	start: Instant;
	end: Instant;
	reason: string;
	/** The impact token the dialog showed (`impactToken`). */
	impactToken: string;
};

export type CreateBlockResult =
	/** `id`: the new block's row id; `date`: its local date. */
	| { ok: true; id: number; date: LocalDate }
	| { ok: false; code: 'invalid' | 'past' | 'conflict' | 'stale' };

type Reason = (typeof BLOCK_REASONS)[number];
const isReason = (value: string): value is Reason => (BLOCK_REASONS as readonly string[]).includes(value);

/** Blocks start and end on 5-minute steps of local time (the form's `step=300`). */
const BLOCK_STEP_MIN = 5;

/** True for an instant on a whole local minute that is a multiple of the block step. */
const onStep = (instant: string) => instant.endsWith(':00Z') && localMinuteOfDay(instant) % BLOCK_STEP_MIN === 0;

/**
 * True for a block the table accepts and the admin form can make: one local date, end after start,
 * both on 5-minute steps with zero seconds. The command checks this itself rather than trusting the form.
 */
export function isValidBlockRange(start: string, end: string): boolean {
	return (
		isValidInstant(start) &&
		isValidInstant(end) &&
		onStep(start) &&
		onStep(end) &&
		compareInstants(start, end) < 0 &&
		localDate(start) === localDate(end)
	);
}

export function createBlock(input: CreateBlockInput, options: { now?: Instant; db?: Db } = {}): CreateBlockResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	const { start, end, reason } = input;
	if (typeof reason !== 'string' || !isReason(reason) || !isValidBlockRange(start, end)) return { ok: false, code: 'invalid' };
	const run = db.$client.transaction((): CreateBlockResult => {
		const check = getBlockCheck({ start, end }, now, db);
		if (check.past) return { ok: false, code: 'past' };
		if (check.conflict) return { ok: false, code: 'conflict' };
		if (impactToken(check.impact) !== input.impactToken) return { ok: false, code: 'stale' };

		const inserted = db.insert(block).values({ startAt: start, endAt: end, reason }).run();
		// After the insert, so the helper's notice sees the new block.
		const affected = check.impact.affected;
		if (affected) enqueueHeatChanges([affected.id], { now, db });
		return { ok: true, id: Number(inserted.lastInsertRowid), date: check.date };
	});
	return run.immediate();
}
