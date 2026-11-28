// snapshotAnalytics (FR-30; AD-5, AD-12, AD-22; Story 4.1): one BEGIN IMMEDIATE transaction, run by
// the worker on every tick and the only writer of the analytics tables. It inserts whatever is
// missing, so it catches up after downtime and a second run writes nothing:
// - one `analytics_booking` row for each live booking whose start has passed (at or before `now`). A
//   started booking cannot be deleted, so its record is final. A booking deleted before its start
//   never gets one. An email erased in the meantime leaves the guest key null.
// - one `analytics_day` row for each season day before today, with the settings as they are now
//   (accepted limitation after downtime).
// Existing rows are never touched.
import { and, asc, eq, gt, isNull, lt, lte } from 'drizzle-orm';
import { bookingHeat, bookingStartKind, unbookedStartTimes } from '#lib/domain/index.ts';
import {
	addDays,
	compareDates,
	compareInstants,
	formatTime,
	isoWeek,
	isoWeekday,
	localDate,
	toInstant,
	today,
	type Instant,
	type LocalDate
} from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { getDayData, getSeasonRows, getSeasons, getSettings, type DayData } from '../db/queries/index.ts';
import { analyticsBooking, analyticsDay, block, booking, type AnalyticsBlock } from '../db/schema.ts';
import { getEnv } from '../env.ts';
import { guestKey } from '../guest-key.ts';

export type SnapshotAnalyticsResult = { ok: true; bookings: number; days: number };

/** The blocks that overlap `date`, with their Zurich clock times clipped to the day. */
function dayBlocks(date: LocalDate, db: Db): AnalyticsBlock[] {
	const from = toInstant(date, 0);
	const to = toInstant(date, 1440);
	return db
		.select({ start: block.startAt, end: block.endAt, reason: block.reason })
		.from(block)
		.where(and(lt(block.startAt, to), gt(block.endAt, from)))
		.orderBy(asc(block.startAt), asc(block.id))
		.all()
		.map(({ start, end, reason }) => ({
			start: compareInstants(start, from) <= 0 ? '00:00' : formatTime(start),
			end: compareInstants(end, to) >= 0 ? '24:00' : formatTime(end),
			reason
		}));
}

export function snapshotAnalytics(
	options: { now?: Instant; db?: Db; guestKeySecret?: string } = {}
): SnapshotAnalyticsResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	const secret = options.guestKeySecret ?? getEnv().guestKeySecret;
	const run = db.$client.transaction((): SnapshotAnalyticsResult => {
		const loaded = { settings: getSettings(db), seasons: getSeasons(db) };
		const days = new Map<LocalDate, DayData>();
		const dayData = (date: LocalDate): DayData => {
			let day = days.get(date);
			if (!day) days.set(date, (day = getDayData(date, db, loaded)));
			return day;
		};

		const due = db
			.select({
				id: booking.id,
				start: booking.startAt,
				seasonId: booking.seasonId,
				partySize: booking.partySize,
				email: booking.email
			})
			.from(booking)
			.leftJoin(analyticsBooking, eq(analyticsBooking.bookingId, booking.id))
			.where(and(isNull(booking.deletedAt), lte(booking.startAt, now), isNull(analyticsBooking.id)))
			.orderBy(asc(booking.startAt), asc(booking.id))
			.all();
		for (const row of due) {
			const date = localDate(row.start);
			const { bookings, blocks } = dayData(date);
			const self = bookings.find((b) => b.id === row.id);
			if (!self) throw new Error('A booking is missing from its own day');
			db.insert(analyticsBooking)
				.values({
					bookingId: row.id,
					seasonId: row.seasonId,
					date,
					hhmm: formatTime(row.start),
					weekday: isoWeekday(date),
					isoWeek: isoWeek(date),
					durationMin: self.durationMin,
					partySize: row.partySize,
					heat: bookingHeat(self, bookings, blocks),
					changeoverMin: self.changeoverMin,
					startKind: bookingStartKind(self, bookings),
					guestKey: row.email?.trim() ? guestKey(row.email, secret) : null
				})
				.run();
		}

		const recorded = new Set(db.select({ date: analyticsDay.date }).from(analyticsDay).all().map((r) => r.date));
		const yesterday = addDays(today(now), -1);
		let dayCount = 0;
		for (const season of getSeasonRows(db)) {
			const last = compareDates(season.endDate, yesterday) < 0 ? season.endDate : yesterday;
			for (let date = season.startDate; compareDates(date, last) <= 0; date = addDays(date, 1)) {
				if (recorded.has(date)) continue;
				const day = dayData(date);
				db.insert(analyticsDay)
					.values({
						date,
						seasonId: season.id,
						openMinute: day.settings.openMinute,
						closeMinute: day.settings.closeMinute,
						blocks: dayBlocks(date, db),
						unbooked: unbookedStartTimes({ date, ...day }).map(({ start, heat }) => ({ start: formatTime(start), heat }))
					})
					.run();
				dayCount++;
			}
		}
		return { ok: true, bookings: due.length, days: dayCount };
	});
	return run.immediate();
}
