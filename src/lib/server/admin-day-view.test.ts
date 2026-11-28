// Story 3.2 matrix: the admin day view and the booking detail. `now` Tue 12 Jan 2027, 10:00 Zurich;
// season 2027-01-09…2027-03-31; hours 16:00–22:00; keybox code 4711. Pure builders on fixtures, the
// loaders on an in-memory database.
// The test migrates and edits its own in-memory database.
// eslint-disable-next-line no-restricted-imports
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from '#lib/server/db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from '#lib/server/db/migrate.ts';
import { getDeletionImpact, type AdminBooking, type AdminKeyboxRow } from '#lib/server/db/queries/index.ts';
import { deleteBooking, markReplyDone } from '#lib/server/commands/index.ts';
import { buildReplies } from './reply-view.ts';
import { impactToken } from '#lib/domain/index.ts';
import {
	adminHomeDay,
	adminStripDates,
	buildAdminBookingView,
	buildAdminDayView,
	buildAdminRow,
	defaultAdminDay,
	keyboxStatus,
	loadAdminBookingView,
	loadAdminDayView,
	type AdminDayView,
	type AdminRowContext
} from './admin-day-view.ts';

const NOW = '2027-01-12T09:00:00Z';
const SEASONS = [{ startDate: '2027-01-09', endDate: '2027-03-31' }];
const HOT = { heat: 'hot', earliest: null, latest: null } as const;
const COLD = { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' } as const;

const context = (over: Partial<AdminRowContext> = {}): AdminRowContext => ({
	now: NOW,
	locale: 'de',
	seasons: SEASONS,
	settings: { openMinute: 960, closeMinute: 1320 },
	keyboxCode: '4711',
	...over
});

const booking = (over: Partial<AdminBooking> = {}): AdminBooking => ({
	id: 7,
	start: '2027-01-12T16:15:00Z',
	durationMin: 60,
	partySize: 2,
	locale: 'de',
	name: 'Tom Brunner',
	email: 'tom@example.ch',
	mobile: '+41791234567',
	current: COLD,
	lastTold: COLD,
	keybox: null,
	refusals: [],
	...over
});

const keybox = (over: Partial<AdminKeyboxRow> = {}): AdminKeyboxRow => ({
	state: 'pending',
	dueAt: '2027-01-15T16:15:00Z',
	outcomeAt: null,
	reason: null,
	snapshotKeyboxCode: null,
	...over
});

describe('buildAdminRow', () => {
	it('shows the time range, the heat state, the name and party size, and links to the detail', () => {
		expect(buildAdminRow(booking(), context())).toMatchObject({
			href: '/admin/booking/7',
			time: '17:15–18:15',
			name: 'Tom Brunner',
			party: '2 Personen',
			notice: { heat: 'cold', label: 'Kaltstart', text: 'Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.' },
			changed: null,
			code: null,
			oldCode: null,
			flag: null
		});
		expect(buildAdminRow(booking({ partySize: 1 }), context()).party).toBe('1 Person');
	});

	it.each([
		['current cold, last told hot', { current: COLD, lastTold: HOT }, 'Hinweis geändert'],
		['equal notices', { current: COLD, lastTold: { ...COLD } }, null],
		['no last-told notice', { current: COLD, lastTold: null }, null]
	])('change tag: %s', (_, over, tag) => {
		expect(buildAdminRow(booking(over), context()).changed).toBe(tag);
	});

	it('says "Notice changed" in English', () => {
		expect(buildAdminRow(booking({ lastTold: HOT }), context({ locale: 'en' })).changed).toBe('Notice changed');
	});

	it.each([
		['sent with the current code', keybox({ state: 'accepted', snapshotKeyboxCode: '4711' }), 'Code 4711', null],
		['sent with an old code', keybox({ state: 'accepted', snapshotKeyboxCode: '1234' }), null, 'Alter Code 1234'],
		['still pending', keybox(), null, null]
	])('keybox code: %s', (_, row, code, oldCode) => {
		const result = buildAdminRow(booking({ keybox: row }), context());
		expect(result.code).toBe(code);
		expect(result.oldCode).toBe(oldCode);
	});

	it('shows no code for a blank or missing sent code, and no old-code tag while the code setting is unset', () => {
		const sent = (code: string | null) => keybox({ state: 'accepted', snapshotKeyboxCode: code });
		for (const code of ['', '  ', null]) {
			expect(buildAdminRow(booking({ keybox: sent(code) }), context())).toMatchObject({ code: null, oldCode: null, sentCode: null });
		}
		expect(buildAdminRow(booking({ keybox: sent('1234') }), context({ keyboxCode: null }))).toMatchObject({
			code: 'Code 1234',
			oldCode: null
		});
	});

	it.each([
		['a future booking 21:30–23:00', { start: '2027-01-12T20:30:00Z', durationMin: 90 }, 'Ausserhalb der Zeiten'],
		['a booking on 2027-04-05, outside every season', { start: '2027-04-05T15:00:00Z' }, 'Ausserhalb der Zeiten'],
		['a past booking out of hours', { start: '2027-01-12T06:00:00Z' }, null],
		['a booking inside the times', {}, null]
	])('flag: %s', (_, over, flag) => {
		expect(buildAdminRow(booking(over), context()).flag).toBe(flag);
	});
});

describe('keyboxStatus', () => {
	it.each([
		['accepted', keybox({ state: 'accepted', outcomeAt: '2027-01-11T15:00:00Z', snapshotKeyboxCode: '4711' }), 'verschickt Mo 16:00 · Code 4711', 'sent Mon 16:00 · code 4711'],
		['pending', keybox({ dueAt: '2027-01-15T16:15:00Z' }), 'geplant Fr 17:15', 'planned Fri 17:15'],
		['refused', keybox({ state: 'refused', reason: 'smtp 550' }), 'abgelehnt: smtp 550', 'refused: smtp 550'],
		['in_flight', keybox({ state: 'in_flight' }), 'wird gerade verschickt', 'sending now'],
		['transient_failure', keybox({ state: 'transient_failure', dueAt: '2027-01-12T09:05:00Z' }), 'nicht zugestellt, neuer Versuch Di 10:05', 'not delivered, trying again Tue 10:05'],
		['expired', keybox({ state: 'expired' }), 'nicht verschickt: zu spät', 'not sent: too late'],
		['cancelled', keybox({ state: 'cancelled' }), 'nicht verschickt: abgebrochen', 'not sent: cancelled'],
		['no row', null, 'keine geplant', 'none planned']
	])('%s', (_, row, de, en) => {
		expect(keyboxStatus(row, NOW, 'de')).toBe(de);
		expect(keyboxStatus(row, NOW, 'en')).toBe(en);
	});

	it('names the date, not only the weekday, more than 6 days from today', () => {
		expect(keyboxStatus(keybox({ dueAt: '2027-01-18T16:15:00Z' }), NOW, 'de')).toBe('geplant Mo 17:15');
		expect(keyboxStatus(keybox({ dueAt: '2027-01-19T16:15:00Z' }), NOW, 'de')).toBe('geplant Di 19. Januar, 17:15');
		expect(keyboxStatus(keybox({ dueAt: '2027-01-19T16:15:00Z' }), NOW, 'en')).toBe('planned Tue 19 January, 17:15');
		const old = keybox({ state: 'accepted', outcomeAt: '2027-01-05T15:00:00Z', snapshotKeyboxCode: '4711' });
		expect(keyboxStatus(old, NOW, 'de')).toBe('verschickt Di 5. Januar, 16:00 · Code 4711');
		expect(keyboxStatus(keybox({ state: 'accepted', outcomeAt: '2027-01-06T15:00:00Z' }), NOW, 'de')).toBe('verschickt Mi 16:00');
		expect(keyboxStatus(keybox({ state: 'transient_failure', dueAt: '2027-03-01T09:05:00Z' }), NOW, 'de')).toBe(
			'nicht zugestellt, neuer Versuch Mo 1. März, 10:05'
		);
	});

	it('reads a blank or missing sent code as no code', () => {
		const at = { state: 'accepted', outcomeAt: '2027-01-11T15:00:00Z' } as const;
		expect(keyboxStatus(keybox({ ...at, snapshotKeyboxCode: '  ' }), NOW, 'de')).toBe('verschickt Mo 16:00');
		expect(keyboxStatus(keybox({ ...at, snapshotKeyboxCode: null }), NOW, 'de')).toBe('verschickt Mo 16:00');
	});
});

describe('adminStripDates and adminHomeDay', () => {
	it('takes the current season, else the next, plus the extra dates in date order', () => {
		const dates = adminStripDates(SEASONS, NOW, ['2027-04-05', '2027-01-12', '2026-12-30']);
		expect(dates[0]).toBe('2026-12-30');
		expect(dates[1]).toBe('2027-01-09');
		expect(dates.at(-2)).toBe('2027-03-31');
		expect(dates.at(-1)).toBe('2027-04-05');
		expect(dates.filter((d) => d === '2027-01-12')).toHaveLength(1);
		const next = adminStripDates([{ startDate: '2027-02-01', endDate: '2027-02-03' }], NOW, []);
		expect(next).toEqual(['2027-02-01', '2027-02-02', '2027-02-03']);
		expect(adminStripDates([{ startDate: '2026-11-01', endDate: '2026-11-30' }], NOW, [])).toEqual([]);
	});

	it.each([
		['today in a season', SEASONS, '2027-01-12'],
		['today before the season', [{ startDate: '2027-02-01', endDate: '2027-03-31' }], '2027-02-01'],
		['no current or next season', [{ startDate: '2026-11-01', endDate: '2026-11-30' }], '2027-01-12'],
		['no season at all', [], '2027-01-12']
	])('the default day with %s', (_, seasons, day) => {
		expect(adminHomeDay(seasons, NOW)).toBe(day);
	});
});

/** The booking ids of a day view's entries, in order. */
const bookingIds = (v: AdminDayView | null | undefined) => v?.entries.flatMap((e) => (e.kind === 'booking' ? [e.row.id] : []));

describe('buildAdminDayView', () => {
	const view = (date: string, stripDates: string[], bookings: AdminBooking[] = [], flagged: string[] = []) =>
		buildAdminDayView({ date, bookings, stripDates, flaggedDates: new Set(flagged), context: context(), replies: buildReplies([], 0, 'de'), blocks: [] });

	it('has the heading, title, rows and status', () => {
		const v = view('2027-01-12', ['2027-01-12'], [booking(), booking({ id: 8, start: '2027-01-12T18:00:00Z' })]);
		expect(v.title).toBe('Di, 12. Januar · Buchungen');
		expect(v.heading).toEqual({ eyebrow: 'Heute', date: '12. Januar' });
		expect(bookingIds(v)).toEqual([7, 8]);
		expect(v.empty).toBeNull();
		expect(v.status).toBe('Dienstag, 12. Januar: 2 Buchungen');
		expect(view('2027-01-12', [], [booking()]).status).toBe('Dienstag, 12. Januar: 1 Buchung');
	});

	it('shows the empty line on a day without live bookings', () => {
		const v = view('2027-01-13', ['2027-01-13']);
		expect(v.empty).toBe('Keine Buchungen an diesem Tag.');
		expect(v.status).toBe('Mittwoch, 13. Januar: Keine Buchungen.');
		expect(v.heading.eyebrow).toBe('Mittwoch');
	});

	it('links every strip cell and names a flagged one', () => {
		const v = view('2027-01-12', ['2027-01-12', '2027-04-05'], [], ['2027-04-05']);
		expect(v.strip).toEqual([
			{ date: '2027-01-12', href: '/admin/day/2027-01-12', weekday: 'Di', day: '12', name: 'Dienstag, 12. Januar', flagged: false },
			{ date: '2027-04-05', href: '/admin/day/2027-04-05', weekday: 'Mo', day: '5', name: 'Montag, 5. April, ausserhalb der Zeiten', flagged: true }
		]);
	});

	it('steps to the nearest strip day each side, disabled at the ends', () => {
		const strip = ['2027-01-09', '2027-01-10', '2027-04-05'];
		expect(view('2027-01-09', strip)).toMatchObject({ prev: null, next: '/admin/day/2027-01-10' });
		expect(view('2027-04-05', strip)).toMatchObject({ prev: '/admin/day/2027-01-10', next: null });
		expect(view('2027-02-15', strip)).toMatchObject({ prev: '/admin/day/2027-01-10', next: '/admin/day/2027-04-05' });
	});
});

describe('buildAdminBookingView', () => {
	it('lists the detail terms, the keybox status and both notices', () => {
		const v = buildAdminBookingView(
			booking({ lastTold: HOT, keybox: keybox({ state: 'accepted', outcomeAt: '2027-01-11T15:00:00Z', snapshotKeyboxCode: '4711' }) }),
			context()
		);
		expect(v).toMatchObject({
			title: 'Buchung Di, 12. Januar, 17:15–18:15',
			back: { href: '/admin/day/2027-01-12', text: 'Di, 12. Januar' },
			eyebrow: 'Dienstag, 12. Januar',
			heading: '17:15–18:15',
			started: null,
			changed: 'Hinweis geändert',
			oldCode: null,
			flag: null,
			refusals: null
		});
		expect(v.details).toEqual([
			{ term: 'Name', value: 'Tom Brunner', href: null },
			{ term: 'E-Mail', value: 'tom@example.ch', href: 'mailto:tom@example.ch' },
			{ term: 'Handy', value: '+41791234567', href: 'tel:+41791234567' },
			{ term: 'Personen', value: '2', href: null },
			{ term: 'Dauer', value: '60 Minuten', href: null },
			{ term: 'Schlüsselmail', value: 'verschickt Mo 16:00 · Code 4711', href: null }
		]);
		expect(v.notices.now).toMatchObject({ term: 'Hinweis jetzt', notice: { heat: 'cold' } });
		expect(v.notices.lastTold).toMatchObject({ term: 'Zuletzt gesagt', notice: { heat: 'hot', text: 'Schon heiss um 17:15.' } });
	});

	it('lists the refused non-urgent emails with their reason', () => {
		const v = buildAdminBookingView(
			booking({
				refusals: [
					{ kind: 'confirmation', reason: 'smtp 550', outcomeAt: null },
					{ kind: 'heat_change', reason: null, outcomeAt: null }
				]
			}),
			context()
		);
		expect(v.refusals).toEqual({ heading: 'Abgelehnte Mails', items: ['Bestätigung abgelehnt: smtp 550', 'Hinweismail abgelehnt'] });
	});

	it('shows the flag and the old-code tag, and says when it has started', () => {
		const flagged = buildAdminBookingView(
			booking({ start: '2027-01-12T20:30:00Z', durationMin: 90, keybox: keybox({ state: 'accepted', snapshotKeyboxCode: '1234' }) }),
			context()
		);
		expect(flagged.flag).toBe('Diese Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.');
		expect(buildAdminBookingView(booking({ start: '2027-01-12T20:30:00Z', durationMin: 90 }), context({ locale: 'en' })).flag).toBe(
			'This booking falls outside the new times. It stays valid.'
		);
		expect(flagged.oldCode).toBe('Alter Code 1234');
		expect(buildAdminBookingView(booking({ start: '2027-01-12T08:00:00Z' }), context()).started).toBe('Hat schon begonnen.');
	});

	it('shows a dash for a notice now that cannot be derived, "nicht gespeichert" only for the last-told one', () => {
		const v = buildAdminBookingView(booking({ current: null, lastTold: null }), context());
		expect(v.notices.now).toEqual({ term: 'Hinweis jetzt', notice: null, missing: '–' });
		expect(v.notices.lastTold).toEqual({ term: 'Zuletzt gesagt', notice: null, missing: 'nicht gespeichert' });
	});

	it('links the mobile with only + and digits, and shows a dash without a link for blank contact data', () => {
		expect(buildAdminBookingView(booking({ mobile: '+41 79 123 45 67' }), context()).details[2]).toEqual({
			term: 'Handy',
			value: '+41 79 123 45 67',
			href: 'tel:+41791234567'
		});
		const blank = buildAdminBookingView(booking({ email: '', mobile: ' ' }), context());
		expect(blank.details.slice(1, 3)).toEqual([
			{ term: 'E-Mail', value: '–', href: null },
			{ term: 'Handy', value: '–', href: null }
		]);
		expect(buildAdminRow(booking({ email: '', mobile: '' }), context())).toMatchObject({ email: null, mobile: null });
	});

	it('shows "(ohne Name)" for a blank stored name in the day row and the detail, and trims a name (retro D5)', () => {
		expect(buildAdminRow(booking({ name: '  ' }), context()).name).toBe('(ohne Name)');
		expect(buildAdminRow(booking({ name: '  ' }), context({ locale: 'en' })).name).toBe('(no name)');
		expect(buildAdminRow(booking({ name: ' Tom Brunner ' }), context()).name).toBe('Tom Brunner');
		expect(buildAdminBookingView(booking({ name: '  ' }), context()).details[0]).toEqual({ term: 'Name', value: '(ohne Name)', href: null });
	});

	it('shows a dash for erased contact data, without a link', () => {
		const v = buildAdminBookingView(booking({ name: null, email: null, mobile: null }), context());
		expect(v.details.slice(0, 3)).toEqual([
			{ term: 'Name', value: '(ohne Name)', href: null },
			{ term: 'E-Mail', value: '–', href: null },
			{ term: 'Handy', value: '–', href: null }
		]);
	});
});

describe('loaders', () => {
	let sqlite: Database.Database;
	let db: Db;

	beforeEach(() => {
		sqlite = openDatabase(':memory:');
		db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		sqlite.exec("update season set end_date = '2027-03-31'; update setting set open_minute = 960, close_minute = 1320, keybox_code = '4711'");
	});

	afterEach(() => sqlite.close());

	let n = 0;
	const insertBooking = (start: string, deletedAt: string | null = null) => {
		const id = `ID${String(++n).padStart(20, '0')}`;
		return Number(
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, deleted_at) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, 'Tom Brunner', ?)"
				)
				.run(start, id, id, deletedAt).lastInsertRowid
		);
	};
	const opts = () => ({ now: NOW, db });

	it('redirects /admin/day to today, the next season start, or today', () => {
		expect(defaultAdminDay(opts())).toBe('2027-01-12');
		sqlite.exec("update season set start_date = '2027-02-01'");
		expect(defaultAdminDay(opts())).toBe('2027-02-01');
		sqlite.exec("update season set start_date = '2026-11-01', end_date = '2026-12-31'");
		expect(defaultAdminDay(opts())).toBe('2027-01-12');
	});

	it('accepts a past season day, a block-only day and today; refuses the rest', () => {
		sqlite.exec("insert into season (id, start_date, end_date) values (2, '2026-11-20', '2026-12-20')");
		sqlite.exec("insert into block (start_at, end_at, reason) values ('2027-04-05T07:00:00Z', '2027-04-05T09:00:00Z', 'cleaning')");
		expect(loadAdminDayView('2026-12-01', 'de', opts())?.date).toBe('2026-12-01');
		expect(loadAdminDayView('2027-04-05', 'de', opts())?.date).toBe('2027-04-05');
		for (const date of ['2027-05-01', '2027-13-01', 'x']) expect(loadAdminDayView(date, 'de', opts())).toBeNull();
		sqlite.exec('delete from season where id = 1');
		expect(loadAdminDayView('2027-01-12', 'de', opts())?.empty).toBe('Keine Buchungen an diesem Tag.');
	});

	it('builds the strip from the season and a later live booking, not a deleted one, flagged in its name', () => {
		insertBooking('2027-04-05T14:00:00Z');
		insertBooking('2027-04-06T14:00:00Z', '2027-01-10T08:00:00Z');
		const v = loadAdminDayView('2027-01-12', 'de', opts());
		const dates = v?.strip.map((c) => c.date) ?? [];
		expect(dates[0]).toBe('2027-01-09');
		expect(dates.at(-1)).toBe('2027-04-05');
		expect(dates).not.toContain('2027-04-06');
		expect(dates).toEqual([...dates].sort());
		expect(dates).toHaveLength(82 + 1);
		expect(v?.strip.every((c) => c.href === `/admin/day/${c.date}`)).toBe(true);
		expect(v?.strip.at(-1)).toMatchObject({ flagged: true, name: 'Montag, 5. April, ausserhalb der Zeiten' });
	});

	it('always puts the shown day in the strip: today without a season, a past season day by URL', () => {
		sqlite.exec('delete from season');
		const today = loadAdminDayView('2027-01-12', 'de', opts());
		expect(today?.strip.map((c) => c.date)).toEqual(['2027-01-12']);
		expect(today).toMatchObject({ prev: null, next: null });
		sqlite.exec("insert into season (id, start_date, end_date) values (1, '2027-01-09', '2027-03-31'), (2, '2026-11-20', '2026-12-20')");
		const past = loadAdminDayView('2026-12-01', 'de', opts());
		const dates = past?.strip.map((c) => c.date) ?? [];
		expect(dates[0]).toBe('2026-12-01');
		expect(dates[1]).toBe('2027-01-09');
		expect(past).toMatchObject({ prev: null, next: '/admin/day/2027-01-09' });
	});

	it('shows the live bookings of the day and not a deleted one', () => {
		const live = insertBooking('2027-01-12T16:15:00Z');
		insertBooking('2027-01-12T18:00:00Z', '2027-01-10T08:00:00Z');
		expect(bookingIds(loadAdminDayView('2027-01-12', 'de', opts()))).toEqual([live]);
		const gone = loadAdminDayView('2027-01-13', 'de', opts());
		expect(bookingIds(gone)).toEqual([]);
	});

	it('After delete: the day view lists the open reply reminder of the deleted guest (Story 3.4)', () => {
		const anna = insertBooking('2027-01-12T15:00:00Z');
		sqlite.prepare("update booking set name = 'Anna Meier', email = 'anna@example.ch' where id = ?").run(anna);
		const other = insertBooking('2027-01-13T15:00:00Z', '2027-01-11T08:00:00Z');
		sqlite.prepare("update booking set email = 'tom@example.ch' where id = ?").run(other);
		expect(loadAdminDayView('2027-01-12', 'de', opts())?.replies.items).toEqual([]);
		const deletion = getDeletionImpact(anna, NOW, db);
		if (!deletion) throw new Error('no impact');
		expect(deleteBooking({ bookingId: anna, impactToken: impactToken(deletion.impact) }, opts())).toMatchObject({ ok: true });
		const v = loadAdminDayView('2027-01-12', 'de', opts());
		expect(v?.replies.items.map((r) => [r.id, r.name, r.when, r.email])).toEqual([
			[anna, 'Anna Meier', 'Di 12. Januar, 16:00–17:00 · gelöscht', 'anna@example.ch']
		]);
		expect(v?.replies.count).toBe(2);
		expect(bookingIds(v)).toEqual([]);
		expect(loadAdminDayView('2027-01-13', 'de', opts())?.replies.items.map((r) => r.id)).toEqual([other]);
	});

	it('accepts a day outside the season while its deleted booking has an open reminder (Story 3.4)', () => {
		// 3 May 2027: after the season, not in the strip, its only booking deleted.
		const gone = insertBooking('2027-05-03T15:00:00Z', '2027-01-12T08:00:00Z');
		sqlite.prepare("update booking set email = 'anna@example.ch' where id = ?").run(gone);
		expect(loadAdminDayView('2027-05-03', 'de', opts())?.replies.items.map((r) => r.id)).toEqual([gone]);
		expect(markReplyDone({ bookingId: gone }, opts())).toEqual({ ok: true });
		expect(loadAdminDayView('2027-05-03', 'de', opts())).toBeNull();
	});

	it('refuses such a day when the reminder has no email to answer', () => {
		const gone = insertBooking('2027-05-03T15:00:00Z', '2027-01-12T08:00:00Z');
		sqlite.prepare("update booking set email = '  ' where id = ?").run(gone);
		expect(loadAdminDayView('2027-05-03', 'de', opts())).toBeNull();
	});

	it('loads a live booking detail; unknown and malformed ids are null', () => {
		const live = insertBooking('2027-01-12T16:15:00Z');
		const v = loadAdminBookingView(String(live), 'de', opts());
		expect(v).toMatchObject({ kind: 'admin-booking', heading: '17:15–18:15' });
		for (const id of ['9999', 'abc', '0', '01', '1.5', '-1']) {
			expect(loadAdminBookingView(id, 'de', opts())).toBeNull();
		}
	});

	it('Gone: a deleted booking is the gone view with a link to its day, no longer a 404', () => {
		const gone = insertBooking('2027-01-12T18:00:00Z', '2027-01-10T08:00:00Z');
		expect(loadAdminBookingView(String(gone), 'de', opts())).toEqual({
			kind: 'admin-booking-gone',
			title: 'Gelöschte Buchung',
			message: 'Diese Buchung gibt es nicht mehr.',
			back: { href: '/admin/day/2027-01-12', text: 'Di, 12. Januar' }
		});
		expect(loadAdminBookingView(String(gone), 'en', opts())).toMatchObject({ message: 'This booking no longer exists.' });
	});

	it('loads the delete dialog through getDeletionImpact: Anna 16:00–17:00 before Tom 17:15, told hot, keybox sent', () => {
		const anna = insertBooking('2027-01-12T15:00:00Z');
		sqlite.prepare("update booking set name = 'Anna Meier' where id = ?").run(anna);
		const tom = insertBooking('2027-01-12T16:15:00Z');
		sqlite.prepare("update booking set last_told_notice = '{\"heat\":\"hot\",\"earliest\":null,\"latest\":null}' where id = ?").run(tom);
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at) values (?, 'keybox', 'accepted', '2027-01-11T16:15:00Z')").run(tom);
		const v = loadAdminBookingView(String(anna), 'de', opts());
		if (v?.kind !== 'admin-booking') throw new Error('expected the detail');
		expect(v.delete).toMatchObject({
			button: 'Buchung löschen',
			title: 'Buchung löschen?',
			what: 'Anna Meier · Di 12. Januar, 16:00–17:00',
			cancel: 'Abbrechen',
			row: {
				consequence: 'call',
				who: 'Tom, 17:15:',
				text: 'weniger als 24 h.',
				marker: { text: 'Anruf nötig', urgent: true },
				notice: 'Neuer Hinweis: komm zwischen 16:35 und 16:45.'
			},
			messages: {
				stale: 'Die Auswirkung hat sich geändert. Bitte prüf sie nochmal.',
				past: 'Hat schon begonnen.',
				failed: 'Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal.'
			}
		});
		expect(v.delete?.token).toContain('"urgent","call"');
	});

	it('uses the time-only what line when the name is erased', () => {
		const anon = insertBooking('2027-01-12T15:00:00Z');
		sqlite.prepare('update booking set name = null where id = ?').run(anon);
		const v = loadAdminBookingView(String(anon), 'de', opts());
		expect(v).toMatchObject({ delete: { what: 'Di 12. Januar, 16:00–17:00' } });
	});

	it('Started: a started booking has "Hat schon begonnen." and no delete dialog', () => {
		const started = insertBooking('2027-01-12T08:30:00Z');
		const v = loadAdminBookingView(String(started), 'de', opts());
		expect(v).toMatchObject({ kind: 'admin-booking', started: 'Hat schon begonnen.', delete: null });
	});
});
