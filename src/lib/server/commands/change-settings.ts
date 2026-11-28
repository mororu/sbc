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
// - season (Story 3.8, AD-25): edits a season row in place (`id`) or adds the next one (`id` null).
//   A missing row is `not_found`; a row that ended before today (Zurich) is frozen (`past`); an end
//   before today is `past` with `field: 'end'`; on a row that started before today the start cannot
//   change (`past`); for a new row, or one starting today or later, a start before today is `past`
//   with `field: 'start'`; dates overlapping any other row (inclusive) are `conflict` (a command
//   check, no db constraint).
// - keybox (Story 3.8): writes the trimmed code; only later claims snapshot it, nothing is resent.
// Neither season nor keybox touches a booking (`season_id` included) or writes an outbox row.
// Never throws for an expected outcome.
import { eq } from 'drizzle-orm';
import { parseSettingsCard } from '#lib/schemas/index.ts';
import { compareDates, today, type Instant, type LocalDate } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getFutureLiveBookings, getPreheatImpact, getSeasonRows, getSettings } from '../db/queries/index.ts';
import { season, setting } from '../db/schema.ts';
import { enqueueHeatChanges } from './heat-change.ts';

export type ChangeSettingsInput =
	| { card: 'season'; id: number | null; startDate: LocalDate; endDate: LocalDate }
	| { card: 'keybox'; code: string }
	| { card: 'hours'; openMinute: number; closeMinute: number }
	| { card: 'changeover'; changeoverMin: number }
	| { card: 'horizon'; horizonDays: number }
	| { card: 'preheat'; minMin: number; maxMin: number; impactToken: string }
	| { card: 'instructions'; de: string; en: string }
	| { card: 'contact'; contact: string };

export type ChangeSettingsResult =
	| { ok: true }
	| {
			ok: false;
			code: 'invalid' | 'stale' | 'conflict' | 'not_found' | 'past';
			/** With `past` from the season card: the posted end or start lies before today (a field error, not a failure). */
			field?: 'end' | 'start';
	  };

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const onStep = (n: unknown, min: number, max: number, step: number) => isInt(n) && n >= min && n <= max && (n - min) % step === 0;

/** A valid season input (the schema rerun): the dates and the id, or null. */
function seasonOf(input: ChangeSettingsInput): { id: number | null; startDate: LocalDate; endDate: LocalDate } | null {
	if (input.card !== 'season') return null;
	const { id, startDate, endDate } = input;
	if (id !== null && !(isInt(id) && id > 0)) return null;
	if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
	const parsed = parseSettingsCard('season', { start: startDate, end: endDate, id: id === null ? '' : String(id) });
	return parsed.ok && parsed.value.startDate === startDate && parsed.value.endDate === endDate ? parsed.value : null;
}

/** The columns of a valid input, or null: the command's own range check, never trusting the form. */
function columnsOf(input: ChangeSettingsInput): Partial<typeof setting.$inferInsert> | null {
	switch (input.card) {
		case 'keybox': {
			const parsed = parseSettingsCard('keybox', { code: input.code });
			return parsed.ok ? { keyboxCode: parsed.value.code } : null;
		}
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
	if (input && typeof input === 'object' && input.card === 'season') {
		const value = seasonOf(input);
		if (!value) return { ok: false, code: 'invalid' };
		return db.$client.transaction(() => saveSeason(value, now, db)).immediate();
	}
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

/** The season branch, inside the transaction: against the rows as they are now. */
function saveSeason(value: { id: number | null; startDate: LocalDate; endDate: LocalDate }, now: Instant, db: Db): ChangeSettingsResult {
	const rows = getSeasonRows(db);
	const day = today(now);
	const row = value.id === null ? null : rows.find((r) => r.id === value.id);
	if (value.id !== null && !row) return { ok: false, code: 'not_found' };
	// Ended rows stay as they are (analytics, purge timing).
	if (row && compareDates(row.endDate, day) < 0) return { ok: false, code: 'past' };
	// No season may end in the past: that would rewrite days that have been.
	if (compareDates(value.endDate, day) < 0) return { ok: false, code: 'past', field: 'end' };
	// A running season's start has passed: it stays.
	if (row && compareDates(row.startDate, day) < 0) {
		if (row.startDate !== value.startDate) return { ok: false, code: 'past' };
	} else if (compareDates(value.startDate, day) < 0) {
		// A new or upcoming season may not start in the past either (retro D3).
		return { ok: false, code: 'past', field: 'start' };
	}
	const overlaps = rows.some(
		(r) => r.id !== value.id && compareDates(r.startDate, value.endDate) <= 0 && compareDates(value.startDate, r.endDate) <= 0
	);
	if (overlaps) return { ok: false, code: 'conflict' };
	const dates = { startDate: value.startDate, endDate: value.endDate };
	if (value.id === null) {
		db.insert(season).values(dates).run();
	} else {
		db.update(season).set(dates).where(eq(season.id, value.id)).run();
	}
	return { ok: true };
}
