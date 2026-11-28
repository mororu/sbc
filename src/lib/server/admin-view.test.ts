// Story 3.1 matrix, "Health": the admin home's worker warning at Tue 12 Jan 2027, 10:00 Zurich.
// Story 3.2 matrix, "Home" and "Flag": the next bookings (Heute/Morgen) and the home flags.
// Story 3.4 matrix, "Home list" and "Empty": the home's reply reminders on an in-memory database.
// The test migrates and edits its own in-memory database.
// eslint-disable-next-line no-restricted-imports
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from '#lib/server/db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from '#lib/server/db/migrate.ts';
import { countReplyReminders, type AdminBooking } from '#lib/server/db/queries/index.ts';
import type { AdminRowContext } from './admin-day-view.ts';
import { buildHomeFlags, buildNextBookings, loadAdminHome, workerWarning } from './admin-view.ts';

const NOW = '2027-01-12T09:00:00Z';

describe('workerWarning', () => {
	it('says the worker is not running, without a time, before any heartbeat', () => {
		expect(workerWarning(null, NOW, 'de')).toBe('Der Versand läuft nicht.');
		expect(workerWarning(null, NOW, 'en')).toBe("Sending isn't running.");
	});

	it('names the last tick of a stale heartbeat as a clock time', () => {
		const beat = { beatAt: '2027-01-12T08:55:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit 09:55 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since 09:55.");
	});

	it('adds the date for a tick on an earlier day', () => {
		const beat = { beatAt: '2027-01-11T21:30:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit Mo 11. Januar, 22:30 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since Mon 11 January, 22:30.");
	});

	it('names when sends started failing while the worker ticks', () => {
		const beat = { beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:45:00Z' };
		expect(workerWarning(beat, NOW, 'de')).toBe('Seit 09:45 geht keine Mail raus. Der Versand versucht es weiter.');
		expect(workerWarning(beat, NOW, 'en')).toBe('No email has gone out since 09:45. Sending keeps trying.');
	});

	it('shows nothing while the worker is healthy', () => {
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: null }, NOW, 'de')).toBeNull();
		// Failing for less than 15 minutes is still ok.
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:50:00Z' }, NOW, 'de')).toBeNull();
	});
});

const context = (over: Partial<AdminRowContext> = {}): AdminRowContext => ({
	now: NOW,
	locale: 'de',
	seasons: [{ startDate: '2027-01-09', endDate: '2027-03-31' }],
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
	email: null,
	mobile: null,
	current: null,
	lastTold: null,
	keybox: null,
	refusals: [],
	...over
});

describe('buildNextBookings', () => {
	it('groups today and tomorrow under their labels, with the empty line for a day without bookings', () => {
		const next = buildNextBookings([booking()], context());
		expect(next.heading).toBe('Nächste Buchungen');
		expect(next.groups.map((g) => g.label)).toEqual(['Heute · Di 12. Januar', 'Morgen · Mi 13. Januar']);
		expect(next.groups[0].rows.map((r) => r.id)).toEqual([7]);
		expect(next.groups[0].empty).toBeNull();
		expect(next.groups[1]).toEqual({ label: 'Morgen · Mi 13. Januar', rows: [], empty: 'Keine Buchungen an diesem Tag.' });
	});

	it('heads a blank stored name "(ohne Name)", like the calls and replies (retro D5)', () => {
		const next = buildNextBookings([booking({ name: '  ' })], context());
		expect(next.groups[0].rows[0].name).toBe('(ohne Name)');
	});

	it('uses the English labels', () => {
		const next = buildNextBookings([], context({ locale: 'en' }));
		expect(next.heading).toBe('Next bookings');
		expect(next.groups.map((g) => g.label)).toEqual(['Today · Tue 12 January', 'Tomorrow · Wed 13 January']);
	});
});

describe('buildHomeFlags', () => {
	const candidate = (id: number, start: string, over: { durationMin?: number; refused?: boolean; name?: string | null } = {}) => ({
		id,
		start,
		durationMin: over.durationMin ?? 60,
		name: over.name === undefined ? 'Tom Brunner' : over.name,
		refused: over.refused ?? false
	});

	it('says one flagged booking in the singular, with its link', () => {
		const flags = buildHomeFlags([candidate(1, '2027-01-12T20:30:00Z', { durationMin: 90 }), candidate(2, '2027-01-13T16:00:00Z')], context());
		expect(flags).toEqual([
			{
				kind: 'outside',
				text: '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.',
				links: [{ href: '/admin/booking/1', text: 'Di 12. Januar, 21:30 · Tom Brunner' }]
			}
		]);
	});

	it('uses the EXPERIENCE plural for several, and flags a booking outside every season', () => {
		const flags = buildHomeFlags([candidate(1, '2027-01-12T20:30:00Z', { durationMin: 90 }), candidate(2, '2027-04-05T14:00:00Z')], context());
		expect(flags[0].text).toBe('2 Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig.');
		expect(flags[0].links.map((l) => l.href)).toEqual(['/admin/booking/1', '/admin/booking/2']);
	});

	it('lists the bookings with a refused email, one link each', () => {
		const flags = buildHomeFlags(
			[candidate(3, '2027-01-13T16:00:00Z', { refused: true }), candidate(4, '2027-01-14T16:00:00Z', { refused: true, name: null })],
			context()
		);
		expect(flags).toEqual([
			{
				kind: 'refused',
				text: '2 Buchungen haben eine abgelehnte Mail.',
				links: [
					{ href: '/admin/booking/3', text: 'Mi 13. Januar, 17:00 · Tom Brunner' },
					{ href: '/admin/booking/4', text: 'Do 14. Januar, 17:00 · (ohne Name)' }
				]
			}
		]);
		expect(buildHomeFlags([candidate(3, '2027-01-13T16:00:00Z', { refused: true })], context())[0].text).toBe(
			'1 Buchung hat eine abgelehnte Mail.'
		);
		// A blank stored name is "(ohne Name)" too (retro D5).
		expect(buildHomeFlags([candidate(3, '2027-01-13T16:00:00Z', { refused: true, name: '  ' })], context())[0].links).toEqual([
			{ href: '/admin/booking/3', text: 'Mi 13. Januar, 17:00 · (ohne Name)' }
		]);
	});

	it('flags nothing for a booking that has started, or when nothing applies', () => {
		expect(buildHomeFlags([candidate(1, '2027-01-12T06:00:00Z', { refused: true })], context())).toEqual([]);
		expect(buildHomeFlags([candidate(1, '2027-01-13T16:00:00Z')], context())).toEqual([]);
	});
});

describe('loadAdminHome: replies (Story 3.4)', () => {
	let sqlite: Database.Database;
	let db: Db;
	let n = 0;

	beforeEach(() => {
		sqlite = openDatabase(':memory:');
		db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
	});

	afterEach(() => sqlite.close());

	const insert = (name: string, locale: string, email: string | null, deletedAt: string | null, replyDoneAt: string | null = null) => {
		const id = `HM${String(++n).padStart(20, '0')}`;
		return Number(
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, email, deleted_at, reply_done_at) values ('2027-01-12T15:00:00Z', 60, 15, '2027-01-07T10:00:00Z', 1, 2, ?, ?, ?, ?, ?, ?, ?)"
				)
				.run(locale, id, id, name, email, deletedAt, replyDoneAt).lastInsertRowid
		);
	};

	it('lists Ben then Anna (oldest deletion first); the count is the nav count (Home list)', () => {
		insert('Anna Meier', 'de', 'anna@example.ch', '2027-01-12T08:00:00Z');
		insert('Ben Arnold', 'en', 'ben@example.ch', '2027-01-12T07:00:00Z');
		insert('Cleo Done', 'de', 'cleo@example.ch', '2027-01-12T06:00:00Z', '2027-01-12T06:30:00Z');
		insert('Dan Nomail', 'de', null, '2027-01-12T06:00:00Z');
		insert('Eva Live', 'de', 'eva@example.ch', null);
		const { replies } = loadAdminHome('de', NOW, db);
		expect(replies.heading).toBe('Antworten');
		expect(replies.items.map((r) => [r.name, r.when])).toEqual([
			['Ben Arnold', 'Di 12. Januar, 16:00–17:00 · gelöscht'],
			['Anna Meier', 'Di 12. Januar, 16:00–17:00 · gelöscht']
		]);
		expect(replies.count).toBe(2);
		expect(replies.count).toBe(countReplyReminders(db));
	});

	it('shows the heading, 0 and the empty line without open reminders (Empty)', () => {
		insert('Eva Live', 'de', 'eva@example.ch', null);
		expect(loadAdminHome('de', NOW, db).replies).toEqual({ heading: 'Antworten', count: 0, empty: 'Keine offenen Antworten.', items: [] });
	});
});
