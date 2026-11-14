import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { getAdminContact, getKeyboxSettings } from './setting.ts';

let sqlite: Database.Database;
let db: Db;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => {
	sqlite.close();
});

describe('getAdminContact', () => {
	it('reads the seeded placeholder address', () => {
		expect(getAdminContact(db)).toBe('platzhalter@sauna-luegisee.ch');
	});

	it('reads an address the admins have set', () => {
		sqlite.prepare("update setting set admin_contact = 'sauna@example.ch' where id = 1").run();
		expect(getAdminContact(db)).toBe('sauna@example.ch');
	});

	it.each([null, '', '   '])('returns null for %j', (value) => {
		sqlite.prepare('update setting set admin_contact = ? where id = 1').run(value);
		expect(getAdminContact(db)).toBeNull();
	});

	it('returns null without a setting row', () => {
		sqlite.prepare('delete from setting').run();
		expect(getAdminContact(db)).toBeNull();
	});
});

describe('getKeyboxSettings', () => {
	it('starts empty: every keybox setting is null after the migrations', () => {
		expect(getKeyboxSettings(db)).toEqual({ code: null, instructions: { de: null, en: null } });
	});

	it('reads each setting trimmed, and blank as null', () => {
		sqlite
			.prepare('update setting set keybox_code = ?, keybox_instructions_de = ?, keybox_instructions_en = ? where id = 1')
			.run(' 4711 ', '  Box links\n\nSchlüssel zurück  ', '   ');
		expect(getKeyboxSettings(db)).toEqual({
			code: '4711',
			instructions: { de: 'Box links\n\nSchlüssel zurück', en: null }
		});
	});

	it('returns nulls without a setting row', () => {
		sqlite.prepare('delete from setting').run();
		expect(getKeyboxSettings(db)).toEqual({ code: null, instructions: { de: null, en: null } });
	});
});
