// Block read queries (Story 3.5; FR-17, FR-19; AD-6, AD-8). The block form's "Prüfen" and the
// create-block command both go through `getBlockCheck`; the delete dialog and the delete-block
// command both go through `getBlockDeletion`. So the dialog shows exactly what the command rechecks.
// Admin only: these select block reasons and the affected guest's first name. Guest queries
// (calendar.ts) never select a block's reason.
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import {
	affectedBooking,
	blockConflict,
	impactOn,
	type Block,
	type Booking,
	type Impact
} from '#lib/domain/index.ts';
import { compareInstants, localDate, type Instant, type LocalDate } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { block, booking, type BLOCK_REASONS } from '../schema.ts';
import { keyboxStateOf, toldNotice } from './booking.ts';
import { getDayData, type DayData } from './calendar.ts';
import { firstName } from './impact.ts';

export type BlockReason = (typeof BLOCK_REASONS)[number];

/** A stored block, as the admin pages show it. */
export type AdminBlock = { id: number; start: Instant; end: Instant; reason: BlockReason };

/** A booking a new block would overlap: its start and its guest's first name (or null). */
export type BlockOverlap = { start: Instant; firstName: string | null };

export type BlockCheckConflict = { kind: 'overlap'; bookings: BlockOverlap[] } | { kind: 'gap' };

/** What saving the block [start, end) would do. */
export type BlockCheck = {
	/** The local date of the block's start. */
	date: LocalDate;
	/** True when the start is at or before `now`: the block can no longer be saved. */
	past: boolean;
	/** Why it cannot be saved next to the live bookings (`blockConflict`), or null. */
	conflict: BlockCheckConflict | null;
	impact: Impact;
	affectedFirstName: string | null;
};

/** What deleting a stored block would do. */
export type BlockDeletion = {
	block: AdminBlock;
	date: LocalDate;
	/** True once its start has come (at or before `now`): it can no longer be deleted. */
	started: boolean;
	impact: Impact;
	affectedFirstName: string | null;
};

const preheatOf = (settings: DayData['settings']) => ({ minMin: settings.preheatMinMin, maxMin: settings.preheatMaxMin });

/** The first names of bookings by id (null for a blank or erased name). */
function firstNames(ids: number[], db: Db): Map<number, string | null> {
	if (ids.length === 0) return new Map();
	const rows = db.select({ id: booking.id, name: booking.name }).from(booking).where(inArray(booking.id, ids)).all();
	return new Map(rows.map((r) => [r.id, firstName(r.name)]));
}

/** `impactOn` for a block change ending at `end`, over the bookings and the blocks after the change. */
function blockImpact(
	end: Instant,
	day: DayData,
	blocksAfter: Block[],
	db: Db
): { impact: Impact; affected: Booking | null } {
	const affected = affectedBooking({ end }, day.bookings, day.settings);
	const impact = impactOn({
		affected,
		bookings: day.bookings,
		blocks: blocksAfter,
		preheat: preheatOf(day.settings),
		told: affected ? toldNotice(affected.id, db) : null,
		keyboxState: affected ? keyboxStateOf(affected.id, db) : null
	});
	return { impact, affected };
}

/**
 * The check behind "Prüfen" and `createBlock`: over the day data of the block's start date
 * (`getDayData`, which covers the days around it), whether it is past, whether it conflicts with a
 * live booking (`blockConflict`, overlapping bookings with their first names), and the impact on the
 * booking behind it (`affectedBooking` after its end; `impactOn` with the block added).
 */
export function getBlockCheck(candidate: { start: Instant; end: Instant }, now: Instant, db: Db = getDb()): BlockCheck {
	const date = localDate(candidate.start);
	const day = getDayData(date, db);
	const found = blockConflict(candidate, day.bookings);
	let conflict: BlockCheckConflict | null = null;
	if (found?.kind === 'overlap') {
		const names = firstNames(found.bookings.map((b) => b.id), db);
		conflict = { kind: 'overlap', bookings: found.bookings.map((b) => ({ start: b.start, firstName: names.get(b.id) ?? null })) };
	} else if (found) {
		conflict = found;
	}
	const { impact, affected } = blockImpact(candidate.end, day, [...day.blocks, candidate], db);
	return {
		date,
		past: compareInstants(candidate.start, now) <= 0,
		conflict,
		impact,
		affectedFirstName: affected ? (firstNames([affected.id], db).get(affected.id) ?? null) : null
	};
}

/** One stored block by id, or null. */
export function getBlock(blockId: number, db: Db = getDb()): AdminBlock | null {
	const row = db
		.select({ id: block.id, start: block.startAt, end: block.endAt, reason: block.reason })
		.from(block)
		.where(eq(block.id, blockId))
		.get();
	return row ?? null;
}

/**
 * The impact of deleting block `blockId` (Story 3.5): its day data, the affected booking after its
 * end, and `impactOn` over the blocks with one block of the same start and end removed. Null for an
 * unknown block. A started block still gets its impact; the command refuses it with `past`.
 */
export function getBlockDeletion(blockId: number, now: Instant, db: Db = getDb()): BlockDeletion | null {
	const row = getBlock(blockId, db);
	if (!row) return null;
	const date = localDate(row.start);
	const day = getDayData(date, db);
	const index = day.blocks.findIndex((b) => b.start === row.start && b.end === row.end);
	// The day data always holds the block (it overlaps its own date): anything else is a broken
	// invariant, and an impact with the block still in it would validate the wrong token.
	if (index < 0) throw new Error(`Block ${blockId} is missing from its own day data`);
	const after = day.blocks.filter((_, i) => i !== index);
	const { impact, affected } = blockImpact(row.end, day, after, db);
	return {
		block: row,
		date,
		started: compareInstants(row.start, now) <= 0,
		impact,
		affectedFirstName: affected ? (firstNames([affected.id], db).get(affected.id) ?? null) : null
	};
}

/** Blocks that have not ended at `now` (end > now), in start order: the Blocks list. */
export function getUpcomingBlocks(now: Instant, db: Db = getDb()): AdminBlock[] {
	return db
		.select({ id: block.id, start: block.startAt, end: block.endAt, reason: block.reason })
		.from(block)
		.where(gt(block.endAt, now))
		.orderBy(asc(block.startAt), asc(block.id))
		.all();
}

/** Blocks overlapping [from, to), in start order, with their reasons: the admin day view. */
export function getAdminDayBlocks(from: Instant, to: Instant, db: Db = getDb()): AdminBlock[] {
	return db
		.select({ id: block.id, start: block.startAt, end: block.endAt, reason: block.reason })
		.from(block)
		.where(and(lt(block.startAt, to), gt(block.endAt, from)))
		.orderBy(asc(block.startAt), asc(block.id))
		.all();
}
