// Story 3.6 matrix, "Tom", "Optional", "Refused", "Both", "Before keybox" and "Empty": the call
// list's view model on an in-memory database, `now` Tue 12 Jan 2027, 11:06 Zurich, pre-heat 30–40;
// the English copy; the home list and the nav badge agree.
// The test migrates and edits its own in-memory database.
// eslint-disable-next-line no-restricted-imports
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveCallList, serializeNotice, type Notice } from '#lib/domain/index.ts';
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from '#lib/server/db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from '#lib/server/db/migrate.ts';
import { getCallFeed } from '#lib/server/db/queries/index.ts';
import { loadAdminHome } from './admin-view.ts';
import { buildCallItem, buildCallList, callDateLine, loadCalls } from './call-view.ts';

const NOW = '2027-01-12T10:06:00Z';
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
const TOM_COLD: Notice = { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' };

let sqlite: Database.Database;
let db: Db;
let n = 0;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	sqlite.exec("update setting set keybox_code = ' 4711 '");
});

afterEach(() => sqlite.close());

type Row = { start: string; durationMin?: number; name?: string | null; mobile?: string | null; lastTold?: Notice | null; deletedAt?: string };

const insertBooking = (row: Row): number => {
	const id = `CV${String(++n).padStart(20, '0')}`;
	return Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, email, mobile, deleted_at, last_told_notice) values (?, ?, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, ?, 'guest@example.ch', ?, ?, ?)"
			)
			.run(
				row.start,
				row.durationMin ?? 60,
				id,
				id,
				row.name === undefined ? 'Tom Brunner' : row.name,
				row.mobile === undefined ? '+41794123581' : row.mobile,
				row.deletedAt ?? null,
				row.lastTold === undefined ? serializeNotice(HOT) : row.lastTold === null ? null : serializeNotice(row.lastTold)
			).lastInsertRowid
	);
};

const insertOutbox = (bookingId: number, kind: string, state: string, dueAt: string) =>
	sqlite.prepare('insert into outbox (booking_id, kind, state, due_at) values (?, ?, ?, ?)').run(bookingId, kind, state, dueAt);

/** Tom: 17:15, keybox email accepted, told hot; Ben before him was deleted → cold 16:35–16:45. */
const tom = () => {
	insertBooking({ start: '2027-01-12T15:00:00Z', name: 'Ben Arnold', deletedAt: '2027-01-12T10:00:00Z' });
	const id = insertBooking({ start: '2027-01-12T16:15:00Z' });
	insertOutbox(id, 'keybox', 'accepted', '2027-01-11T16:15:00Z');
	return id;
};

describe('loadCalls', () => {
	it("shows Tom's entry exactly (Tom)", () => {
		const id = tom();
		expect(loadCalls('de', NOW, db)).toEqual({
			heading: 'Anrufliste',
			count: 1,
			empty: 'Niemand muss angerufen werden.',
			items: [
				{
					bookingId: id,
					heading: '17:15 · Tom Brunner',
					firstName: 'Tom',
					marker: { text: 'Anruf nötig', urgent: true },
					dateLine: 'Heute, Di 12. Januar',
					line: { from: { heat: 'hot', label: 'heiss' }, to: { heat: 'cold', label: 'Kaltstart' }, becomes: 'wird zu' },
					notice: 'Kaltstart: komm zwischen 16:35 und 16:45 und heiz ein.',
					lastTold: 'zuletzt gesagt: Schon heiss um 17:15.',
					reasons: [],
					code: null,
					tel: { href: 'tel:+41794123581', text: '+41794123581' },
					token: serializeNotice(TOM_COLD)
				}
			]
		});
	});

	it('marks good news optional and lists it after the call-required entries (Optional, Refused)', () => {
		const tomId = tom();
		// Mia, Wed 18:00: told cold, now hot after a booking ending 17:45. Keybox email sent.
		const mia = insertBooking({
			start: '2027-01-13T17:00:00Z',
			name: 'Mia Keller',
			lastTold: { heat: 'cold', earliest: '2027-01-13T16:20:00Z', latest: '2027-01-13T16:30:00Z' }
		});
		insertOutbox(mia, 'keybox', 'accepted', '2027-01-12T17:00:00Z');
		insertBooking({ start: '2027-01-13T15:15:00Z', durationMin: 90, name: 'Leo Frei', lastTold: HOT });
		// Sara, Thu 18:00, told what she has: her keybox email was refused.
		const sara = insertBooking({
			start: '2027-01-14T17:00:00Z',
			name: 'Sara Huber',
			lastTold: { heat: 'cold', earliest: '2027-01-14T16:20:00Z', latest: '2027-01-14T16:30:00Z' }
		});
		insertOutbox(sara, 'keybox', 'refused', '2027-01-13T17:00:00Z');
		const { items } = loadCalls('de', NOW, db);
		expect(items.map((i) => i.bookingId)).toEqual([tomId, sara, mia]);
		expect(items[2]).toMatchObject({
			heading: '18:00 · Mia Keller',
			marker: { text: 'optional', urgent: false },
			dateLine: 'Morgen, Mi 13. Januar',
			line: { from: { heat: 'cold' }, to: { heat: 'hot', label: 'heiss' } },
			notice: 'Schon heiss um 18:00.',
			lastTold: 'zuletzt gesagt: Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.',
			reasons: [],
			code: null
		});
		expect(items[1]).toMatchObject({
			heading: '18:00 · Sara Huber',
			marker: { text: 'Anruf nötig', urgent: true },
			dateLine: 'Do 14. Januar',
			line: null,
			notice: 'Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.',
			lastTold: 'zuletzt gesagt: Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein.',
			reasons: ['Schlüsselmail abgelehnt'],
			code: 'Code durchgeben: 4711'
		});
	});

	it('shows one call-required entry with the reason and the line when both triggers apply (Both)', () => {
		const id = tom();
		sqlite.prepare("update outbox set state = 'refused' where booking_id = ?").run(id);
		const { items } = loadCalls('de', NOW, db);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			marker: { urgent: true },
			reasons: ['Schlüsselmail abgelehnt'],
			code: 'Code durchgeben: 4711',
			line: { from: { heat: 'hot' }, to: { heat: 'cold' } }
		});
	});

	it('lists nothing for a heat change before the keybox email (Before keybox)', () => {
		insertBooking({ start: '2027-01-14T16:15:00Z', name: 'Ben Arnold', deletedAt: '2027-01-12T10:00:00Z' });
		const id = insertBooking({ start: '2027-01-14T17:30:00Z' });
		insertOutbox(id, 'keybox', 'pending', '2027-01-13T17:30:00Z');
		expect(loadCalls('de', NOW, db)).toMatchObject({ count: 0, items: [] });
	});

	it('keeps the heading, 0 and the empty line without entries (Empty)', () => {
		expect(loadCalls('de', NOW, db)).toEqual({ heading: 'Anrufliste', count: 0, empty: 'Niemand muss angerufen werden.', items: [] });
	});

	it('names every send-problem reason, and the code only with a keybox reason and a set code', () => {
		const at = (start: string) => insertBooking({ start, lastTold: null });
		const a = at('2027-01-14T17:00:00Z');
		insertOutbox(a, 'keybox', 'expired', '2027-01-13T17:00:00Z');
		// Today 21:00: due at the cutoff, Mon 21:00, overdue from 21:15. Still pending (held): overdue.
		const b = at('2027-01-12T20:00:00Z');
		insertOutbox(b, 'keybox', 'pending', '2027-01-11T20:00:00Z');
		const c = at('2027-01-16T17:00:00Z');
		insertOutbox(c, 'keybox', 'accepted', '2027-01-11T17:00:00Z');
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at, snapshot_urgent) values (?, 'heat_change', 'refused', '2027-01-11T17:00:00Z', 1)").run(c);
		const d = at('2027-01-17T17:00:00Z');
		insertOutbox(d, 'keybox', 'accepted', '2027-01-11T17:00:00Z');
		sqlite.prepare("insert into outbox (booking_id, kind, state, due_at, snapshot_urgent) values (?, 'heat_change', 'expired', '2027-01-11T17:00:00Z', 1)").run(d);
		const view = (locale: 'de' | 'en') => loadCalls(locale, NOW, db).items.map((i) => [i.reasons, i.code, i.lastTold, i.line]);
		expect(view('de')).toEqual([
			[['Schlüsselmail hängt seit über 15 Minuten'], 'Code durchgeben: 4711', null, null],
			[['Schlüsselmail ist nicht rausgegangen'], 'Code durchgeben: 4711', null, null],
			[['Warnmail abgelehnt'], null, null, null],
			[['Warnmail ist nicht rausgegangen'], null, null, null]
		]);
		expect(view('en').map((v) => [v[0], v[1]])).toEqual([
			[['Keybox email stuck for over 15 minutes'], 'Give the code: 4711'],
			[['Keybox email never went out'], 'Give the code: 4711'],
			[['Warning email refused'], null],
			[['Warning email never went out'], null]
		]);
		sqlite.exec('update setting set keybox_code = null');
		expect(loadCalls('de', NOW, db).items[0].code).toBeNull();
	});

	it('falls back to "(ohne Name)" and no tel link once the contact is erased', () => {
		const id = tom();
		sqlite.prepare('update booking set name = null, mobile = null where id = ?').run(id);
		expect(loadCalls('de', NOW, db).items[0]).toMatchObject({ heading: '17:15 · (ohne Name)', firstName: null, tel: null });
	});

	it('renders the English copy', () => {
		tom();
		expect(loadCalls('en', NOW, db)).toMatchObject({
			heading: 'Call list',
			empty: 'Nobody needs a call.',
			items: [
				{
					marker: { text: 'Call needed', urgent: true },
					dateLine: 'Today, Tue 12 January',
					line: { from: { label: 'hot' }, to: { label: 'cold start' }, becomes: 'becomes' },
					notice: 'Cold start: come between 16:35 and 16:45 and light the fire.',
					lastTold: 'last told: Already hot at 17:15.'
				}
			]
		});
	});

	it('agrees with the nav badge: both count deriveCallList(getCallFeed(now))', () => {
		tom();
		const home = loadAdminHome('de', NOW, db);
		expect(home.calls.count).toBe(deriveCallList(getCallFeed(NOW, db), NOW).length);
		expect(home.calls.count).toBe(1);
	});
});

describe('callDateLine', () => {
	it('says today and tomorrow by the Zurich date, else the short date', () => {
		// 00:30 Zurich on Wed 13 Jan is 23:30Z on the 12th.
		expect(callDateLine('2027-01-12T23:30:00Z', NOW, 'de')).toBe('Morgen, Mi 13. Januar');
		expect(callDateLine('2027-01-12T22:30:00Z', NOW, 'de')).toBe('Heute, Di 12. Januar');
		expect(callDateLine('2027-01-14T17:00:00Z', NOW, 'en')).toBe('Thu 14 January');
	});
});

describe('buildCallList', () => {
	it('keeps an entry whose contact row is missing: no name, no tel link; the count equals the derived list', () => {
		const id = tom();
		const feed = getCallFeed(NOW, db);
		const entries = deriveCallList(feed, NOW);
		const view = buildCallList(feed, entries, new Map(), '4711', NOW, 'de');
		expect(view.count).toBe(entries.length);
		expect(view.items).toMatchObject([{ bookingId: id, heading: '17:15 · (ohne Name)', firstName: null, tel: null }]);
	});
});

describe('buildCallItem', () => {
	it('never throws on a notice it cannot word: the notice and last-told lines are left out', () => {
		const broken = { heat: 'cold', earliest: null, latest: null } as unknown as Notice;
		const item = buildCallItem(
			{
				entry: { bookingId: 1, start: '2027-01-12T16:15:00Z', marker: 'call_required', reasons: ['keybox_refused'], heatChange: 'none' },
				feed: { start: '2027-01-12T16:15:00Z', createdAt: '2027-01-07T10:00:00Z', preheatMaxMin: 40, rows: [], lastTold: broken, current: broken },
				contact: null,
				keyboxCode: null
			},
			NOW,
			'de'
		);
		expect(item).toMatchObject({ notice: null, lastTold: null, line: null });
	});
});
