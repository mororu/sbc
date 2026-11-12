// Drizzle schema. Importable only by src/lib/server/commands and src/lib/server/db/queries (AD-2).
// Instants are UTC ISO 8601 text with seconds and `Z`; dates are `yyyy-mm-dd`; durations whole minutes.
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/** Instants are canonical ISO text, e.g. 2027-01-12T17:00:00Z, so text comparison orders them. */
const INSTANT_GLOB = '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z';
const DATE_GLOB = '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]';
const isInstant = (column: AnySQLiteColumn) => sql`${column} GLOB ${sql.raw(`'${INSTANT_GLOB}'`)}`;
const isDate = (column: AnySQLiteColumn) => sql`${column} GLOB ${sql.raw(`'${DATE_GLOB}'`)}`;

/** Seasons are rows that never overlap; edited in place, past ones kept (AD-25). */
export const season = sqliteTable(
	'season',
	{
		id: integer().primaryKey(),
		startDate: text().notNull(),
		endDate: text().notNull()
	},
	(t) => [
		check('season_date_format', sql`${isDate(t.startDate)} AND ${isDate(t.endDate)}`),
		check('season_dates', sql`${t.startDate} <= ${t.endDate}`)
	]
);

/** Business settings: one typed row, id 1. */
export const setting = sqliteTable(
	'setting',
	{
		id: integer().primaryKey(),
		changeoverMin: integer().notNull(),
		preheatMinMin: integer().notNull(),
		preheatMaxMin: integer().notNull(),
		horizonDays: integer().notNull(),
		/** Operating hours as minutes after local midnight (600 = 10:00). */
		openMinute: integer().notNull(),
		closeMinute: integer().notNull(),
		/** The admin contact address guests write to, e.g. to cancel. Seeded with a placeholder. */
		adminContact: text()
	},
	(t) => [
		check('setting_single_row', sql`${t.id} = 1`),
		check('setting_changeover', sql`${t.changeoverMin} BETWEEN 0 AND 60`),
		check('setting_preheat', sql`${t.preheatMinMin} BETWEEN 15 AND 90 AND ${t.preheatMaxMin} BETWEEN 15 AND 90 AND ${t.preheatMinMin} <= ${t.preheatMaxMin}`),
		check('setting_horizon', sql`${t.horizonDays} BETWEEN 1 AND 60`),
		check('setting_hours', sql`${t.openMinute} >= 0 AND ${t.openMinute} < ${t.closeMinute} AND ${t.closeMinute} <= 1440`)
	]
);

export const LOCALES = ['de', 'en'] as const;

/** A booking. Row ids are admin-only; guests only ever see `public_id`. */
export const booking = sqliteTable(
	'booking',
	{
		id: integer().primaryKey(),
		startAt: text().notNull(),
		durationMin: integer().notNull(),
		/** The changeover in force when the booking was made (AD-8). */
		changeoverMin: integer().notNull(),
		createdAt: text().notNull(),
		seasonId: integer()
			.notNull()
			.references(() => season.id),
		/** Soft delete (AD-20). */
		deletedAt: text(),
		partySize: integer().notNull(),
		/** The language active at submit; every guest email goes out in it (FR-27). */
		locale: text({ enum: LOCALES }).notNull(),
		/** Contact data, normalised. Nullable so it can be erased after the retention period. */
		name: text(),
		email: text(),
		/** E.164, e.g. +41791234567. */
		mobile: text(),
		/** The confirmation URL's id: random, URL-safe, 128 bits (AD-13). */
		publicId: text().notNull(),
		/** The form's one-time token: a resubmit returns the same booking (idempotent submit). */
		submitToken: text().notNull(),
		/** The notice at booking (AD-24): canonical JSON from `serializeNotice`, never updated after insert. */
		noticeAtBooking: text(),
		/** The notice the guest was last told (AD-24): canonical JSON; starts as the notice at booking. */
		lastToldNotice: text()
	},
	(t) => [
		index('booking_start_at').on(t.startAt),
		uniqueIndex('booking_public_id').on(t.publicId),
		uniqueIndex('booking_submit_token').on(t.submitToken),
		check('booking_duration', sql`${t.durationMin} IN (60, 90, 120, 150, 180)`),
		check('booking_changeover', sql`${t.changeoverMin} BETWEEN 0 AND 60`),
		check('booking_party_size', sql`${t.partySize} BETWEEN 1 AND 6`),
		check('booking_locale', sql`${t.locale} IN ('de', 'en')`),
		check(
			'booking_instants',
			sql`${isInstant(t.startAt)} AND ${isInstant(t.createdAt)} AND (${t.deletedAt} IS NULL OR ${isInstant(t.deletedAt)})`
		)
	]
);

export const BLOCK_REASONS = ['cleaning', 'maintenance', 'private_use'] as const;

/** An admin-created period in which the wagon cannot be booked. Never heats. */
export const block = sqliteTable(
	'block',
	{
		id: integer().primaryKey(),
		startAt: text().notNull(),
		endAt: text().notNull(),
		reason: text({ enum: BLOCK_REASONS }).notNull()
	},
	(t) => [
		index('block_start_at').on(t.startAt),
		check('block_reason', sql`${t.reason} IN ('cleaning', 'maintenance', 'private_use')`),
		check('block_instants', sql`${isInstant(t.startAt)} AND ${isInstant(t.endAt)}`),
		check('block_range', sql`${t.startAt} < ${t.endAt}`)
	]
);
