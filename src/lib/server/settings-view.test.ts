// Story 3.7: the settings view model: card order, labels, notes and prefilled values (the password
// empty), the error texts, the hours card's "outside the times" flag (matrix "Hours"), and the
// pre-heat dialog text in DE and EN with its plural. Story 3.8: the season card's target (cases 1–4),
// the flag split by cause (matrix "Shorten") and the keybox card's old-code groups (DE/EN, plural).
// The test sets up its own database; app code reaches the db only through commands and queries.
// eslint-disable-next-line no-restricted-imports
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSettingsCard } from '#lib/schemas/index.ts';
import { toInstant } from '#lib/time/index.ts';
import { changeSettings } from './commands/index.ts';
// eslint-disable-next-line no-restricted-imports
import { createDb, openDatabase, type Db } from './db/index.ts';
// eslint-disable-next-line no-restricted-imports
import { applyMigrations, MIGRATIONS_FOLDER } from './db/migrate.ts';
import type { PreheatImpact } from './db/queries/index.ts';
import { loadAdminHome } from './admin-view.ts';
import { loadSettings, oldCodeGroups, preheatDialog, seasonTarget } from './settings-view.ts';

/** Tue 12 Jan 2027, 11:06 Zurich. */
const NOW = '2027-01-12T10:06:00Z';

let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	sqlite
		.prepare("update setting set keybox_instructions_de = 'Box links.', keybox_instructions_en = null, admin_contact = 'sauna@example.ch'")
		.run();
});

afterEach(() => sqlite.close());

const insertBooking = (start: string) =>
	Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', 'PV1', 'TV1', 'Tom Brunner')"
			)
			.run(start).lastInsertRowid
	);

const hoursCard = (view: ReturnType<typeof loadSettings>) => view.cards.find((c) => c.card === 'hours') ?? view.cards[0];
const seasonCard = (view: ReturnType<typeof loadSettings>) => view.cards.find((c) => c.card === 'season') ?? view.cards[0];
const keyboxCard = (view: ReturnType<typeof loadSettings>) => view.cards.find((c) => c.card === 'keybox') ?? view.cards[0];

let k = 0;
/** A live booking with its own ids; with `code`, an accepted keybox row that sent it. */
const book = (start: string, name: string | null = 'Tom Brunner', code?: string) => {
	const id = Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, ?)"
			)
			.run(start, `PK${++k}`, `TK${k}`, name).lastInsertRowid
	);
	if (code !== undefined) {
		sqlite
			.prepare("insert into outbox (booking_id, kind, state, due_at, snapshot_keybox_code) values (?, 'keybox', 'accepted', '2027-01-11T17:00:00Z', ?)")
			.run(id, code);
	}
	return id;
};

describe('loadSettings', () => {
	it('lists the cards in order with labels, notes and prefilled values', () => {
		const view = loadSettings('de', NOW, db);
		expect(view.title).toBe('Einstellungen');
		expect(view.save).toBe('Speichern');
		expect(view.saved).toBe('Gespeichert.');
		expect(view.cards.map((c) => [c.card, c.title, c.action, c.note])).toEqual([
			['season', 'Saison', '?/season', null],
			['hours', 'Betriebszeiten', '?/hours', null],
			['changeover', 'Wechselzeit', '?/changeover', 'Gilt nur für neue Buchungen.'],
			['horizon', 'Buchungshorizont', '?/horizon', null],
			['preheat', 'Vorheizzeit', '?/preheatCheck', null],
			['keybox', 'Schlüsselbox-Code', '?/keybox', 'Gilt für jede Schlüsselmail ab jetzt; verschickte Mails bleiben.'],
			['instructions', 'Anleitung DE / EN', '?/instructions', null],
			['contact', 'Kontaktadresse', '?/contact', null],
			['password', 'Passwort', '?/password', 'Alle anderen Admins werden abgemeldet.']
		]);
		const fields = Object.fromEntries(view.cards.map((c) => [c.card, c.fields.map((f) => [f.name, f.label, f.value, f.kind])]));
		expect(fields).toEqual({
			season: [
				['start', 'Beginn', '2027-01-09', 'date'],
				['end', 'Ende', '2027-04-30', 'date']
			],
			hours: [
				['open', 'Von', '10:00', 'time'],
				['close', 'Bis', '22:00', 'time']
			],
			changeover: [['minutes', 'Minuten', '15', 'number']],
			horizon: [['days', 'Tage', '14', 'number']],
			preheat: [
				['min', 'Kürzeste Zeit (Minuten)', '30', 'number'],
				['max', 'Längste Zeit (Minuten)', '40', 'number']
			],
			keybox: [['code', 'Code', '', 'text']],
			instructions: [
				['de', 'Deutsch', 'Box links.', 'textarea'],
				['en', 'English', '', 'textarea']
			],
			contact: [['email', 'E-Mail', 'sauna@example.ch', 'email']],
			password: [['password', 'Neues Passwort', '', 'password']]
		});
		expect(view.cards.filter((c) => c.paired).map((c) => c.card)).toEqual(['season', 'hours', 'preheat']);
		expect(view.cards.map((c) => c.submitLabel)).toEqual(Array(9).fill('Speichern'));
		expect(view.cards.find((c) => c.card === 'season')).toMatchObject({ hidden: [{ name: 'id', value: '1' }], readOnly: null });
		expect(view.errors.settings_season_order).toBe('Das Ende muss nach dem Beginn liegen.');
		expect(view.errors.settings_season_overlap).toBe('Diese Daten überschneiden sich mit einer anderen Saison.');
		expect(view.cards.flatMap((c) => c.fields).find((f) => f.name === 'open')?.step).toBe(300);
		expect(view.cards.flatMap((c) => c.fields).find((f) => f.name === 'min')).toMatchObject({ min: 15, max: 90, step: 5 });
		expect(view.errors.settings_preheat_swapped).toBe('Die kürzeste Zeit darf nicht länger sein als die längste.');
		expect(view.errors.settings_contact_invalid).toBe('Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie.');
		expect(view.errors.settings_hours_order).toBe('„Bis“ muss nach „Von“ liegen.');
		expect(view.cards.map((c) => c.flag)).toEqual(Array(9).fill(null));
		expect(view.cards.flatMap((c) => c.groups)).toEqual([]);
	});

	it('is in English', () => {
		const view = loadSettings('en', NOW, db);
		expect(view.cards.map((c) => c.title)).toEqual([
			'Season',
			'Operating hours',
			'Changeover',
			'Booking horizon',
			'Pre-heat window',
			'Keybox code',
			'Instructions DE / EN',
			'Contact address',
			'Password'
		]);
		expect(view.errors.settings_changeover_range).toBe('Please enter 0 to 60, in steps of 5.');
		expect(view.errors.settings_season_order).toBe('The end must be after the start.');
		expect(view.cards[0].fields.map((f) => f.label)).toEqual(['Start', 'End']);
		expect(view.cards[5].fields.map((f) => f.label)).toEqual(['Code']);
	});

	it('flags the bookings outside new hours on the hours card, linked, until they pass', () => {
		const id = insertBooking(toInstant('2027-01-12', 20 * 60 + 30));
		expect(changeSettings({ card: 'hours', openMinute: 720, closeMinute: 1260 }, { now: NOW, db })).toEqual({ ok: true });
		const flag = hoursCard(loadSettings('de', NOW, db)).flag;
		expect(flag).toEqual({
			kind: 'outside',
			text: '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.',
			links: [{ href: `/admin/booking/${id}`, text: 'Di 12. Januar, 20:30 · Tom Brunner' }]
		});
		// Once it has started, the flag goes.
		expect(hoursCard(loadSettings('de', '2027-01-12T19:31:00Z', db)).flag).toBeNull();
		expect(loadSettings('de', NOW, db).cards[0].flag).toBeNull();
	});
});

describe('loadSettings: a close at midnight', () => {
	it('prefills a stored close of 1440 as 00:00, which parses back to 1440', () => {
		sqlite.prepare('update setting set close_minute = 1440').run();
		const hours = hoursCard(loadSettings('de', NOW, db));
		const values = Object.fromEntries(hours.fields.map((f) => [f.name, f.value]));
		expect(values).toEqual({ open: '10:00', close: '00:00' });
		expect(parseSettingsCard('hours', values)).toEqual({ ok: true, value: { openMinute: 600, closeMinute: 1440 } });
	});
});

describe('preheatDialog', () => {
	const impact = (count: number): PreheatImpact => ({
		from: { minMin: 30, maxMin: 40 },
		to: { minMin: 40, maxMin: 50 },
		changed: Array.from({ length: count }, () => ({ affected: null, told: null, current: null, class: 'urgent' as const, consequence: 'mail' as const })),
		token: 'T'
	});

	it('words the window change and the count, singular and plural', () => {
		expect(preheatDialog(impact(1), 'de')).toEqual({
			title: 'Vorheizzeit ändern?',
			what: '30–40 → 40–50 Minuten · 1 Buchung bekommt eine neue Ankunftszeit',
			confirm: 'Speichern',
			cancel: 'Abbrechen',
			token: 'T',
			values: { min: '40', max: '50' },
			messages: {
				stale: 'Die Auswirkung hat sich geändert. Bitte prüf sie nochmal.',
				failed: 'Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal.'
			}
		});
		expect(preheatDialog(impact(3), 'de').what).toBe('30–40 → 40–50 Minuten · 3 Buchungen bekommen eine neue Ankunftszeit');
		expect(preheatDialog(impact(0), 'de').what).toBe('30–40 → 40–50 Minuten · 0 Buchungen bekommen eine neue Ankunftszeit');
	});

	it('is in English', () => {
		const dialog = preheatDialog(impact(1), 'en');
		expect(dialog.title).toBe('Change pre-heat window?');
		expect(dialog.what).toBe('30–40 → 40–50 minutes · 1 booking gets a new arrival time');
		expect(preheatDialog(impact(2), 'en').what).toBe('30–40 → 40–50 minutes · 2 bookings get a new arrival time');
		expect(dialog.confirm).toBe('Save');
		expect(dialog.cancel).toBe('Cancel');
	});
});

describe('seasonTarget (Story 3.8)', () => {
	const row = (id: number, startDate: string, endDate: string) => ({ id, startDate, endDate });
	const last = row(1, '2026-01-10', '2026-04-30');
	const current = row(2, '2027-01-09', '2027-04-30');
	const next = row(3, '2027-12-20', '2028-04-30');
	const later = row(4, '2028-12-20', '2029-04-30');

	it('1. edits the row containing today (its edges included)', () => {
		expect(seasonTarget([last, current, next], '2027-01-12')).toEqual({ kind: 'edit', row: current });
		expect(seasonTarget([current], '2027-01-09')).toEqual({ kind: 'edit', row: current });
		expect(seasonTarget([current], '2027-04-30')).toEqual({ kind: 'edit', row: current });
	});

	it('2. else edits the earliest row starting after today', () => {
		expect(seasonTarget([later, last, current, next], '2027-05-10')).toEqual({ kind: 'edit', row: next });
		expect(seasonTarget([current], '2027-01-08')).toEqual({ kind: 'edit', row: current });
	});

	it('3. else creates, showing the latest ended row; 4. with no row, none', () => {
		expect(seasonTarget([current, last], '2027-05-10')).toEqual({ kind: 'create', last: current });
		expect(seasonTarget([], '2027-05-10')).toEqual({ kind: 'create', last: null });
	});
});

describe('loadSettings: the season card (Story 3.8)', () => {
	const MAY = '2027-05-10T08:00:00Z';

	it('ended: the last season read-only with its years, empty fields, "Nächste Saison anlegen", no id', () => {
		const card = seasonCard(loadSettings('de', MAY, db));
		expect(card.readOnly).toEqual({ label: 'Letzte Saison (vorbei)', text: '9. Januar 2027 – 30. April 2027' });
		expect(card.fields.map((f) => f.value)).toEqual(['', '']);
		expect(card.submitLabel).toBe('Nächste Saison anlegen');
		expect(card.hidden).toEqual([]);
		const en = seasonCard(loadSettings('en', MAY, db));
		expect(en.readOnly).toEqual({ label: 'Last season (ended)', text: '9 January 2027 – 30 April 2027' });
		expect(en.submitLabel).toBe('Add next season');
	});

	it('after creating the next one: editable with its dates and id, "Speichern"', () => {
		expect(changeSettings({ card: 'season', id: null, startDate: '2027-12-20', endDate: '2028-04-30' }, { now: MAY, db })).toEqual({ ok: true });
		const card = seasonCard(loadSettings('de', MAY, db));
		expect(card.fields.map((f) => f.value)).toEqual(['2027-12-20', '2028-04-30']);
		expect(card.hidden).toEqual([{ name: 'id', value: '2' }]);
		expect(card.submitLabel).toBe('Speichern');
		expect(card.readOnly).toBeNull();
	});

	it('no season at all: empty fields and the create button, no read-only line', () => {
		sqlite.prepare('delete from season').run();
		const card = seasonCard(loadSettings('de', NOW, db));
		expect(card).toMatchObject({ readOnly: null, hidden: [], submitLabel: 'Nächste Saison anlegen' });
		expect(card.fields.map((f) => f.value)).toEqual(['', '']);
	});

	it('Shorten: the season card lists the 2 bookings after the new end, the hours card none', () => {
		const a = book(toInstant('2027-01-21', 18 * 60));
		const b = book(toInstant('2027-01-22', 18 * 60), null);
		expect(changeSettings({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-20' }, { now: NOW, db })).toEqual({ ok: true });
		const view = loadSettings('de', NOW, db);
		expect(seasonCard(view).flag).toEqual({
			kind: 'outside',
			text: '2 Buchungen liegen ausserhalb der neuen Zeiten. Sie bleiben gültig.',
			links: [
				{ href: `/admin/booking/${a}`, text: 'Do 21. Januar, 18:00 · Tom Brunner' },
				{ href: `/admin/booking/${b}`, text: 'Fr 22. Januar, 18:00 · (ohne Name)' }
			]
		});
		expect(hoursCard(view).flag).toBeNull();
		// The home keeps one combined flag.
		expect(loadAdminHome('de', NOW, db).flags).toEqual([seasonCard(view).flag]);
	});

	it('a booking outside both the season and the hours counts for the season card only', () => {
		book(toInstant('2027-01-21', 21 * 60 + 30));
		book(toInstant('2027-01-13', 21 * 60 + 30));
		expect(changeSettings({ card: 'season', id: 1, startDate: '2027-01-09', endDate: '2027-01-20' }, { now: NOW, db })).toEqual({ ok: true });
		const view = loadSettings('de', NOW, db);
		expect(seasonCard(view).flag?.links.map((l) => l.text)).toEqual(['Do 21. Januar, 21:30 · Tom Brunner']);
		expect(hoursCard(view).flag?.links.map((l) => l.text)).toEqual(['Mi 13. Januar, 21:30 · Tom Brunner']);
	});
});

describe('loadSettings: the keybox card (Story 3.8)', () => {
	const setCode = (code: string) => sqlite.prepare('update setting set keybox_code = ? where id = 1').run(code);

	it('prefills the code and lists the upcoming bookings sent with the old code; nothing once they start', () => {
		setCode('5822');
		const a = book(toInstant('2027-01-12', 17 * 60 + 15), 'Tom Brunner', '4711');
		book(toInstant('2027-01-13', 18 * 60), 'Lena Graf', '4711');
		book(toInstant('2027-01-14', 18 * 60), 'Anna Meier', '4711');
		book(toInstant('2027-01-12', 9 * 60), 'Past Guest', '4711');
		const card = keyboxCard(loadSettings('de', NOW, db));
		expect(card.fields[0].value).toBe('5822');
		expect(card.groupsHeading).toBeNull();
		expect(card.groups).toEqual([
			{
				code: '4711',
				text: '3 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:',
				links: [
					{ href: `/admin/booking/${a}`, text: 'Di 12. Januar, 17:15 · Tom Brunner' },
					expect.objectContaining({ text: 'Mi 13. Januar, 18:00 · Lena Graf' }),
					expect.objectContaining({ text: 'Do 14. Januar, 18:00 · Anna Meier' })
				]
			}
		]);
		expect(keyboxCard(loadSettings('de', '2027-01-14T17:00:00Z', db)).groups).toEqual([]);
	});

	it('Second change: two groups by first start under the intro heading', () => {
		setCode('6933');
		book(toInstant('2027-01-12', 17 * 60), 'A', '5822');
		book(toInstant('2027-01-13', 17 * 60), 'B', '4711');
		book(toInstant('2027-01-14', 17 * 60), 'C', '4711');
		const card = keyboxCard(loadSettings('de', NOW, db));
		expect(card.groupsHeading).toBe('Kommende Buchungen mit einem alten Code:');
		expect(card.groups.map((g) => [g.code, g.text, g.links.length])).toEqual([
			['5822', '1 kommende Buchung hat ihre Schlüsselmail noch mit dem alten Code 5822 bekommen:', 1],
			['4711', '2 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:', 2]
		]);
		expect(keyboxCard(loadSettings('en', NOW, db)).groupsHeading).toBe('Upcoming bookings with an old code:');
	});
});

describe('oldCodeGroups (Story 3.8)', () => {
	const b = (id: number, code: string) => ({ id, start: toInstant('2027-01-12', 17 * 60 + 15), name: 'Tom Brunner', code });

	it('words the line in English, singular and plural', () => {
		expect(oldCodeGroups([b(1, '4711'), b(2, '4711'), b(3, '4711')], 'en')[0].text).toBe(
			'3 upcoming bookings got their keybox email with the old code 4711:'
		);
		expect(oldCodeGroups([b(1, '4711')], 'en')).toEqual([
			{
				code: '4711',
				text: '1 upcoming booking got its keybox email with the old code 4711:',
				links: [{ href: '/admin/booking/1', text: 'Tue 12 January, 17:15 · Tom Brunner' }]
			}
		]);
		expect(oldCodeGroups([], 'de')).toEqual([]);
	});
});

describe('loadSettings: season dates (Story 3.8 review)', () => {
	it('renders the running season\'s Beginn read-only, Ende editable; the next season\'s Beginn editable', () => {
		const [start, end] = seasonCard(loadSettings('de', NOW, db)).fields;
		expect(start.readOnly).toBe(true);
		expect(end.readOnly).toBeUndefined();
		const before = seasonCard(loadSettings('de', '2027-01-05T10:00:00Z', db)).fields[0];
		expect(before.readOnly).toBeUndefined();
		// On its first day the start has not passed yet.
		expect(seasonCard(loadSettings('de', '2027-01-09T10:00:00Z', db)).fields[0].readOnly).toBeUndefined();
	});

	it('uses the Zurich date: at 2027-04-30T22:30Z (1 May in Zurich) the card creates the next season', () => {
		const card = seasonCard(loadSettings('de', '2027-04-30T22:30:00Z', db));
		expect(card.submitLabel).toBe('Nächste Saison anlegen');
		expect(card.readOnly).toEqual({ label: 'Letzte Saison (vorbei)', text: '9. Januar 2027 – 30. April 2027' });
		expect(card.hidden).toEqual([]);
	});

	it('limits the code input to 32 characters and has the new error texts', () => {
		const view = loadSettings('de', NOW, db);
		expect(keyboxCard(view).fields[0].maxlength).toBe(32);
		expect(view.errors.settings_season_end_past).toBe('Das Ende darf nicht in der Vergangenheit liegen.');
		expect(view.errors.settings_keybox_invalid).toBe('Höchstens 32 Zeichen, ohne Zeilenumbruch.');
		expect(loadSettings('en', NOW, db).errors.settings_season_end_past).toBe("The end can't be in the past.");
		expect(view.errors.settings_season_start_past).toBe('Der Beginn darf nicht in der Vergangenheit liegen.');
		expect(loadSettings('en', NOW, db).errors.settings_season_start_past).toBe("The start can't be in the past.");
	});
});
