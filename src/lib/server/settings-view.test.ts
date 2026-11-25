// Story 3.7: the settings view model: card order, labels, notes and prefilled values (the password
// empty), the error texts, the hours card's "outside the times" flag (matrix "Hours"), and the
// pre-heat dialog text in DE and EN with its plural.
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
import { loadSettings, preheatDialog } from './settings-view.ts';

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

describe('loadSettings', () => {
	it('lists the cards in order with labels, notes and prefilled values', () => {
		const view = loadSettings('de', NOW, db);
		expect(view.title).toBe('Einstellungen');
		expect(view.save).toBe('Speichern');
		expect(view.saved).toBe('Gespeichert.');
		expect(view.cards.map((c) => [c.card, c.title, c.action, c.note])).toEqual([
			['hours', 'Betriebszeiten', '?/hours', null],
			['changeover', 'Wechselzeit', '?/changeover', 'Gilt nur für neue Buchungen.'],
			['horizon', 'Buchungshorizont', '?/horizon', null],
			['preheat', 'Vorheizzeit', '?/preheatCheck', null],
			['instructions', 'Anleitung DE / EN', '?/instructions', null],
			['contact', 'Kontaktadresse', '?/contact', null],
			['password', 'Passwort', '?/password', 'Alle anderen Admins werden abgemeldet.']
		]);
		const fields = Object.fromEntries(view.cards.map((c) => [c.card, c.fields.map((f) => [f.name, f.label, f.value, f.kind])]));
		expect(fields).toEqual({
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
			instructions: [
				['de', 'Deutsch', 'Box links.', 'textarea'],
				['en', 'English', '', 'textarea']
			],
			contact: [['email', 'E-Mail', 'sauna@example.ch', 'email']],
			password: [['password', 'Neues Passwort', '', 'password']]
		});
		expect(view.cards.filter((c) => c.paired).map((c) => c.card)).toEqual(['hours', 'preheat']);
		expect(view.cards.flatMap((c) => c.fields).find((f) => f.name === 'open')?.step).toBe(300);
		expect(view.cards.flatMap((c) => c.fields).find((f) => f.name === 'min')).toMatchObject({ min: 15, max: 90, step: 5 });
		expect(view.errors.settings_preheat_swapped).toBe('Die kürzeste Zeit darf nicht länger sein als die längste.');
		expect(view.errors.settings_contact_invalid).toBe('Diese E-Mail-Adresse stimmt so nicht. Bitte prüf sie.');
		expect(view.errors.settings_hours_order).toBe('„Bis“ muss nach „Von“ liegen.');
		expect(view.cards[0].flag).toBeNull();
	});

	it('is in English', () => {
		const view = loadSettings('en', NOW, db);
		expect(view.cards.map((c) => c.title)).toEqual([
			'Operating hours',
			'Changeover',
			'Booking horizon',
			'Pre-heat window',
			'Instructions DE / EN',
			'Contact address',
			'Password'
		]);
		expect(view.errors.settings_changeover_range).toBe('Please enter 0 to 60, in steps of 5.');
	});

	it('flags the bookings outside new hours on the hours card, linked, until they pass', () => {
		const id = insertBooking(toInstant('2027-01-12', 20 * 60 + 30));
		expect(changeSettings({ card: 'hours', openMinute: 720, closeMinute: 1260 }, { now: NOW, db })).toEqual({ ok: true });
		const flag = loadSettings('de', NOW, db).cards[0].flag;
		expect(flag).toEqual({
			kind: 'outside',
			text: '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.',
			links: [{ href: `/admin/booking/${id}`, text: 'Di 12. Januar, 20:30 · Tom Brunner' }]
		});
		// Once it has started, the flag goes.
		expect(loadSettings('de', '2027-01-12T19:31:00Z', db).cards[0].flag).toBeNull();
	});
});

describe('loadSettings: a close at midnight', () => {
	it('prefills a stored close of 1440 as 00:00, which parses back to 1440', () => {
		sqlite.prepare('update setting set close_minute = 1440').run();
		const hours = loadSettings('de', NOW, db).cards[0];
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
