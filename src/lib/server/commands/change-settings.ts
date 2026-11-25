// changeSettings (FR-20; AD-2, AD-6, AD-8; Story 3.7): one settings card per call, one BEGIN
// IMMEDIATE transaction. It rechecks the card's ranges itself (`invalid`; the db CHECKs agree) and
// updates only that card's columns:
// - hours, changeover, horizon, instructions, contact: the columns only. No booking changes (a
//   booking keeps its recorded `changeover_min`; bookings outside new hours stay valid and are
//   flagged by the derived core flag) and no outbox row is written.
// - preheat: recomputes `getPreheatImpact` with the posted window (the query the dialog showed),
//   refuses `stale` when its token differs from the posted one, writes the window, then lets the
//   heat-change helper upsert or cancel the heat-change rows of every future live booking. A window
//   equal to the current one writes nothing.
// Never throws for an expected outcome.
import { eq } from 'drizzle-orm';
import { parseSettingsCard } from '#lib/schemas/index.ts';
import type { Instant } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getFutureLiveBookings, getPreheatImpact, getSettings } from '../db/queries/index.ts';
import { setting } from '../db/schema.ts';
import { enqueueHeatChanges } from './heat-change.ts';

export type ChangeSettingsInput =
	| { card: 'hours'; openMinute: number; closeMinute: number }
	| { card: 'changeover'; changeoverMin: number }
	| { card: 'horizon'; horizonDays: number }
	| { card: 'preheat'; minMin: number; maxMin: number; impactToken: string }
	| { card: 'instructions'; de: string; en: string }
	| { card: 'contact'; contact: string };

export type ChangeSettingsResult = { ok: true } | { ok: false; code: 'invalid' | 'stale' };

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const onStep = (n: unknown, min: number, max: number, step: number) => isInt(n) && n >= min && n <= max && (n - min) % step === 0;

/** The columns of a valid input, or null: the command's own range check, never trusting the form. */
function columnsOf(input: ChangeSettingsInput): Partial<typeof setting.$inferInsert> | null {
	switch (input.card) {
		case 'hours': {
			const { openMinute: open, closeMinute: close } = input;
			// The form gives at most 23:55; the table allows the close at midnight (1440).
			if (!onStep(open, 0, 1440, 5) || !onStep(close, 0, 1440, 5) || open >= close) return null;
			return { openMinute: open, closeMinute: close };
		}
		case 'changeover':
			return onStep(input.changeoverMin, 0, 60, 5) ? { changeoverMin: input.changeoverMin } : null;
		case 'horizon':
			return onStep(input.horizonDays, 1, 60, 1) ? { horizonDays: input.horizonDays } : null;
		case 'preheat': {
			const { minMin, maxMin } = input;
			if (!onStep(minMin, 15, 90, 5) || !onStep(maxMin, 15, 90, 5) || minMin > maxMin) return null;
			return { preheatMinMin: minMin, preheatMaxMin: maxMin };
		}
		case 'instructions': {
			const parsed = parseSettingsCard('instructions', { de: input.de, en: input.en });
			return parsed.ok ? { keyboxInstructionsDe: parsed.value.de, keyboxInstructionsEn: parsed.value.en } : null;
		}
		case 'contact': {
			const parsed = parseSettingsCard('contact', { email: input.contact });
			return parsed.ok ? { adminContact: parsed.value.contact } : null;
		}
		default:
			return null;
	}
}

export function changeSettings(input: ChangeSettingsInput, options: { now?: Instant; db?: Db } = {}): ChangeSettingsResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	const columns = input && typeof input === 'object' ? columnsOf(input) : null;
	if (!columns) return { ok: false, code: 'invalid' };
	const run = db.$client.transaction((): ChangeSettingsResult => {
		if (input.card === 'preheat') {
			const current = getSettings(db);
			if (current.preheatMinMin === input.minMin && current.preheatMaxMin === input.maxMin) return { ok: true };
			const impact = getPreheatImpact({ minMin: input.minMin, maxMin: input.maxMin }, now, db);
			if (impact.token !== input.impactToken) return { ok: false, code: 'stale' };
		}
		const updated = db.update(setting).set(columns).where(eq(setting.id, 1)).run();
		if (updated.changes !== 1) throw new Error('The setting row is missing');
		// After the write, so the helper's notices see the new window.
		if (input.card === 'preheat') {
			enqueueHeatChanges(
				getFutureLiveBookings(now, db).map((b) => b.id),
				{ now, db }
			);
		}
		return { ok: true };
	});
	return run.immediate();
}
