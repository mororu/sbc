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
		adminContact: text(),
		/** The keybox code (Story 2.2). NULL or blank: unset, and keybox rows are held. */
		keyboxCode: text(),
		/** The access and return instructions in the keybox email, per locale. NULL or blank: unset. */
		keyboxInstructionsDe: text(),
		keyboxInstructionsEn: text(),
		/** The shared admin password as an argon2id hash (Story 3.1), set by `npm run set-admin-password`. NULL: not set yet, nobody can sign in. */
		adminPasswordHash: text()
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
		lastToldNotice: text(),
		/**
		 * When an admin marked the reply to a deleted booking's guest done (Story 3.4). The reply
		 * reminder is `deleted_at IS NOT NULL AND reply_done_at IS NULL AND email IS NOT NULL`.
		 * Added without a CHECK: one would rebuild the table (like `outbox.resolved_at`).
		 */
		replyDoneAt: text()
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

/** Outbox kinds in drain order (AD-23): the worker's `KIND_ORDER` must match. */
export const OUTBOX_KINDS = ['confirmation', 'keybox', 'heat_change'] as const;
export const OUTBOX_STATES = [
	'pending',
	'in_flight',
	'accepted',
	'refused',
	'transient_failure',
	'expired',
	'cancelled'
] as const;

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * The transactional outbox (AD-23). Commands insert rows in the same transaction as the mutation;
 * only the worker sends. A row holds no contact data and no rendered content: the snapshot columns
 * freeze the mutable state at claim, and the email is rendered from them.
 */
export const outbox = sqliteTable(
	'outbox',
	{
		id: integer().primaryKey(),
		bookingId: integer()
			.notNull()
			.references(() => booking.id),
		kind: text({ enum: OUTBOX_KINDS }).notNull(),
		state: text({ enum: OUTBOX_STATES }).notNull(),
		/** When the row may be claimed. A transient failure moves it to the backoff instant. */
		dueAt: text().notNull(),
		claimedAt: text(),
		/** Claims so far: drives the backoff. */
		attempts: integer().notNull().default(0),
		/** Canonical Notice JSON, frozen at claim. */
		snapshotNotice: text(),
		/** The keybox code that was sent (Story 2.2). */
		snapshotKeyboxCode: text(),
		snapshotLocale: text({ enum: LOCALES }),
		/** Heat change (Story 2.3): 1 urgent, 0 good news. */
		snapshotUrgent: integer({ mode: 'boolean' }),
		/** Heat change (Story 2.3): the last-told notice frozen at claim (canonical Notice JSON), so the template knows what changed. */
		snapshotLastTold: text(),
		/** `smtp <code>` or an error code; never the server's text. */
		reason: text(),
		outcomeAt: text(),
		/** Written only by mark called (Story 3.6); the send-path commands never write or clear it. Once set, the row never raises a send problem again. */
		resolvedAt: text()
	},
	(t) => [
		index('outbox_state_due_at').on(t.state, t.dueAt),
		index('outbox_booking_id').on(t.bookingId),
		/** One confirmation per booking. */
		uniqueIndex('outbox_one_confirmation').on(t.bookingId).where(sql`${t.kind} = 'confirmation'`),
		/** One keybox row per booking (Story 2.2). */
		uniqueIndex('outbox_one_keybox').on(t.bookingId).where(sql`${t.kind} = 'keybox'`),
		/** At most one open heat-change row per booking (Story 2.3): a repeat change updates it. */
		uniqueIndex('outbox_one_open_heat_change')
			.on(t.bookingId)
			.where(sql`${t.kind} = 'heat_change' AND ${t.state} IN ('pending', 'transient_failure')`),
		check('outbox_kind', sql`${t.kind} IN (${sqlList(OUTBOX_KINDS)})`),
		check('outbox_state', sql`${t.state} IN (${sqlList(OUTBOX_STATES)})`),
		check('outbox_attempts', sql`${t.attempts} >= 0`),
		check('outbox_snapshot_locale', sql`${t.snapshotLocale} IS NULL OR ${t.snapshotLocale} IN (${sqlList(LOCALES)})`),
		check('outbox_snapshot_urgent', sql`${t.snapshotUrgent} IS NULL OR ${t.snapshotUrgent} IN (0, 1)`),
		check('outbox_in_flight_claimed', sql`${t.state} <> 'in_flight' OR ${t.claimedAt} IS NOT NULL`),
		check(
			'outbox_instants',
			sql`${isInstant(t.dueAt)} AND (${t.claimedAt} IS NULL OR ${isInstant(t.claimedAt)}) AND (${t.outcomeAt} IS NULL OR ${isInstant(t.outcomeAt)})`
		)
	]
);

/**
 * The worker's health: one row, id 1, judged by `workerHealth` (the admin home warns, Epic 3).
 * `beatAt` is the last tick that ran; `failingSince` is the outcome time of the first transient send
 * failure since the last accepted send (null while sends go out, and cleared once no row is left
 * retrying), so an outage shows even while the worker keeps ticking (Story 2.5). It is a coarse,
 * installation-wide signal: one recipient's deferrals can set it, and one accepted send clears it.
 */
export const workerHeartbeat = sqliteTable(
	'worker_heartbeat',
	{
		id: integer().primaryKey(),
		beatAt: text().notNull(),
		failingSince: text()
	},
	(t) => [
		check('worker_heartbeat_single_row', sql`${t.id} = 1`),
		check('worker_heartbeat_instant', isInstant(t.beatAt)),
		check('worker_heartbeat_failing_since', sql`${t.failingSince} IS NULL OR ${isInstant(t.failingSince)}`)
	]
);

/**
 * Admin sessions (AD-10, Story 3.1): the cookie holds `id` (`randomId()`, 128 bits, stored as is).
 * A session is valid while `now < expires_at`; each guarded request moves `expires_at` to now + 30
 * days. Sign-out deletes the row; a password reset deletes every row.
 */
export const adminSession = sqliteTable(
	'admin_session',
	{
		id: text().primaryKey(),
		createdAt: text().notNull(),
		expiresAt: text().notNull()
	},
	(t) => [check('admin_session_instants', sql`${isInstant(t.createdAt)} AND ${isInstant(t.expiresAt)}`)]
);

const HEAT_STATES = ['hot', 'cold'] as const;
const TIME_GLOB = '[0-2][0-9]:[0-5][0-9]';

/** One block on an analytics day: Zurich clock times, clipped to the day ("00:00" to "24:00"). */
export type AnalyticsBlock = { start: string; end: string; reason: (typeof BLOCK_REASONS)[number] };
/** One kind-1 or kind-2 start time that passed unbooked: Zurich clock time and heat state. */
export type AnalyticsUnbooked = { start: string; heat: (typeof HEAT_STATES)[number] };

/**
 * One anonymous record per booking that took place (FR-30, AD-12; Story 4.1), written once by
 * `snapshotAnalytics` and never changed or purged. Local columns are Europe/Zurich wall clock.
 * Holds no name, email or mobile.
 */
export const analyticsBooking = sqliteTable(
	'analytics_booking',
	{
		id: integer().primaryKey(),
		bookingId: integer()
			.notNull()
			.references(() => booking.id),
		seasonId: integer()
			.notNull()
			.references(() => season.id),
		date: text().notNull(),
		/** "18:00" */
		hhmm: text().notNull(),
		/** ISO: 1 Monday to 7 Sunday. */
		weekday: integer().notNull(),
		isoWeek: integer().notNull(),
		durationMin: integer().notNull(),
		partySize: integer().notNull(),
		/** The heat state at the start. */
		heat: text({ enum: HEAT_STATES }).notNull(),
		changeoverMin: integer().notNull(),
		/** 1 full or half hour, 2 right after another booking, 3 otherwise (`bookingStartKind`). */
		startKind: integer().notNull(),
		/** Keyed hash of the email (AD-22). Null only when the email was already erased at snapshot time. */
		guestKey: text()
	},
	(t) => [
		uniqueIndex('analytics_booking_booking_id').on(t.bookingId),
		index('analytics_booking_season_id').on(t.seasonId),
		check('analytics_booking_date', isDate(t.date)),
		check('analytics_booking_hhmm', sql`${t.hhmm} GLOB ${sql.raw(`'${TIME_GLOB}'`)}`),
		check('analytics_booking_weekday', sql`${t.weekday} BETWEEN 1 AND 7 AND ${t.isoWeek} BETWEEN 1 AND 53`),
		check('analytics_booking_heat', sql`${t.heat} IN ('hot', 'cold')`),
		check('analytics_booking_start_kind', sql`${t.startKind} IN (1, 2, 3)`),
		check('analytics_booking_guest_key', sql`${t.guestKey} IS NULL OR (length(${t.guestKey}) = 64 AND ${t.guestKey} NOT GLOB '*[^0-9a-f]*')`)
	]
);

/**
 * One record per passed season day (FR-30, AD-12; Story 4.1), with the settings in force when it
 * was written; never changed or purged.
 */
export const analyticsDay = sqliteTable(
	'analytics_day',
	{
		id: integer().primaryKey(),
		date: text().notNull(),
		seasonId: integer()
			.notNull()
			.references(() => season.id),
		openMinute: integer().notNull(),
		closeMinute: integer().notNull(),
		blocks: text({ mode: 'json' }).$type<AnalyticsBlock[]>().notNull(),
		unbooked: text({ mode: 'json' }).$type<AnalyticsUnbooked[]>().notNull()
	},
	(t) => [
		uniqueIndex('analytics_day_date').on(t.date),
		index('analytics_day_season_id').on(t.seasonId),
		check('analytics_day_date_format', isDate(t.date)),
		check('analytics_day_json', sql`json_valid(${t.blocks}) AND json_valid(${t.unbooked})`)
	]
);
