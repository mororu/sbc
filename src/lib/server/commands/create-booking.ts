// createBooking (FR-5, FR-6; AD-2, AD-3): one BEGIN IMMEDIATE transaction. It reads bookings,
// blocks, settings and seasons fresh inside the write lock and accepts only a start and duration
// that `offeredStartTimes` offers, so of two conflicting submits exactly one wins. Idempotent by
// submit token. Returns a result; never throws for an expected outcome.
// The booking's notice (AD-24) is the offer's notice, computed in the same transaction. It is stored
// as both the notice at booking (never updated after this insert) and the last-told notice, and
// compared with the notice the form displayed, so the confirmation can say it just changed.
import {
	DURATIONS,
	noticeEquals,
	offeredStartTimes,
	parseNotice,
	serializeNotice,
	type Notice
} from '#lib/domain/index.ts';
import { normaliseMobile, PARTY_SIZES, validateContactField } from '#lib/schemas/index.ts';
import {
	addDays,
	isValidInstant,
	localDate,
	compareInstants,
	toInstant,
	type Instant,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getDb, type Db } from '../db/index.ts';
import { bookingByToken, getDayItems, getSeasons, getSettings, seasonIdFor } from '../db/queries/index.ts';
import { booking, LOCALES } from '../db/schema.ts';
import { isRandomId, randomId } from '../ids.ts';

export type CreateBookingInput = {
	start: Instant;
	durationMin: number;
	partySize: number;
	/** Contact data as the booking schema outputs it: trimmed, mobile in E.164. */
	name: string;
	email: string;
	mobile: string;
	/** The language active at submit. */
	locale: Locale;
	submitToken: string;
	/** The notice the form displayed (its hidden notice token, parsed). */
	displayedNotice: Notice;
};

export type CreateBookingResult =
	/**
	 * `changed`: the stored notice differs from the displayed one. A resubmit compares the stored
	 * notice at booking with the resubmitted displayed notice (false when none is stored).
	 */
	| { ok: true; publicId: string; changed: boolean }
	| { ok: false; code: 'conflict' | 'past' | 'invalid' };

/**
 * True for SQLite's lock-wait timeout (SQLITE_BUSY and its extended codes): another writer held
 * the lock past the busy timeout. Nothing was written; the caller may say so and let the guest retry.
 */
export function isLockTimeout(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && code.startsWith('SQLITE_BUSY');
}

/** True for a notice that survives its own canonical round trip. */
function validNotice(notice: Notice): boolean {
	try {
		return noticeEquals(parseNotice(serializeNotice(notice)), notice);
	} catch {
		return false;
	}
}

/** True when a stored notice at booking differs from `displayed`. No (or no valid) stored notice: false. */
function storedDiffers(stored: string | null, displayed: Notice): boolean {
	if (stored === null) return false;
	try {
		return !noticeEquals(parseNotice(stored), displayed);
	} catch {
		return false;
	}
}

/** True when the input is well-formed: the shape the booking schema produces. Crafted input fails. */
function wellFormed(input: CreateBookingInput): boolean {
	return (
		validNotice(input.displayedNotice) &&
		isValidInstant(input.start) &&
		(DURATIONS as readonly number[]).includes(input.durationMin) &&
		(PARTY_SIZES as readonly number[]).includes(input.partySize) &&
		(LOCALES as readonly string[]).includes(input.locale) &&
		isRandomId(input.submitToken) &&
		validateContactField('name', input.name) === null &&
		input.name === input.name.trim() &&
		validateContactField('email', input.email) === null &&
		input.email === input.email.trim() &&
		normaliseMobile(input.mobile) === input.mobile
	);
}

export function createBooking(
	input: CreateBookingInput,
	options: { now?: Instant; db?: Db } = {}
): CreateBookingResult {
	const db = options.db ?? getDb();
	const now = options.now ?? clockNow();
	if (!wellFormed(input)) return { ok: false, code: 'invalid' };

	const run = db.$client.transaction((): CreateBookingResult => {
		// A resubmit (double tap, retry after a lost response) returns the booking it already made,
		// unless an admin has deleted it since: then it is gone, and the token never books again.
		const existing = bookingByToken(input.submitToken, db);
		if (existing) {
			if (existing.deleted) return { ok: false, code: 'conflict' };
			return {
				ok: true,
				publicId: existing.publicId,
				changed: storedDiffers(existing.noticeAtBooking, input.displayedNotice)
			};
		}

		if (compareInstants(input.start, now) <= 0) return { ok: false, code: 'past' };

		const date = localDate(input.start);
		const settings = getSettings(db);
		const seasons = getSeasons(db);
		const { bookings, blocks } = getDayItems(toInstant(addDays(date, -1), 0), toInstant(addDays(date, 2), 0), db);
		const offer = offeredStartTimes({ date, bookings, blocks, settings, seasons, now }).find(
			(o) => o.start === input.start
		);
		if (!offer || !(offer.durations as number[]).includes(input.durationMin)) {
			return { ok: false, code: 'conflict' };
		}
		const seasonId = seasonIdFor(date, db);
		if (seasonId === null) return { ok: false, code: 'conflict' };

		const publicId = randomId();
		const notice = serializeNotice(offer.notice);
		db.insert(booking)
			.values({
				startAt: input.start,
				durationMin: input.durationMin,
				changeoverMin: settings.changeoverMin,
				createdAt: now,
				seasonId,
				partySize: input.partySize,
				locale: input.locale,
				name: input.name,
				email: input.email,
				mobile: input.mobile,
				publicId,
				submitToken: input.submitToken,
				noticeAtBooking: notice,
				lastToldNotice: notice
			})
			.run();
		return { ok: true, publicId, changed: !noticeEquals(offer.notice, input.displayedNotice) };
	});
	return run.immediate();
}
