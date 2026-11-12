// Guest read queries for the calendar (AD-2, AD-26). They select only what the start-time core
// needs: never contact columns and never a block's reason.
import { and, asc, gt, gte, isNull, lt } from 'drizzle-orm';
import type { Block, Booking, Season, Settings } from '#lib/domain/index.ts';
import type { Instant } from '#lib/time/index.ts';
import { getDb, type Db } from '../index.ts';
import { block, booking, season, setting } from '../schema.ts';

/** The business settings the calendar uses. Throws if the seeded row is missing. */
export function getSettings(db: Db = getDb()): Settings {
	const row = db
		.select({
			changeoverMin: setting.changeoverMin,
			openMinute: setting.openMinute,
			closeMinute: setting.closeMinute,
			horizonDays: setting.horizonDays,
			preheatMinMin: setting.preheatMinMin,
			preheatMaxMin: setting.preheatMaxMin
		})
		.from(setting)
		.get();
	if (!row) throw new Error('No setting row. Did the migrations run?');
	return row;
}

/** Every season, earliest first. */
export function getSeasons(db: Db = getDb()): Season[] {
	return db
		.select({ startDate: season.startDate, endDate: season.endDate })
		.from(season)
		.orderBy(asc(season.startDate))
		.all();
}

/** Live bookings starting in [from, to) and blocks overlapping [from, to), in start order. */
export function getDayItems(
	from: Instant,
	to: Instant,
	db: Db = getDb()
): { bookings: Booking[]; blocks: Block[] } {
	const bookings = db
		.select({
			id: booking.id,
			start: booking.startAt,
			durationMin: booking.durationMin,
			changeoverMin: booking.changeoverMin,
			createdAt: booking.createdAt
		})
		.from(booking)
		.where(and(isNull(booking.deletedAt), gte(booking.startAt, from), lt(booking.startAt, to)))
		.orderBy(asc(booking.startAt))
		.all();
	const blocks = db
		.select({ start: block.startAt, end: block.endAt })
		.from(block)
		.where(and(lt(block.startAt, to), gt(block.endAt, from)))
		.orderBy(asc(block.startAt))
		.all();
	return { bookings, blocks };
}
