import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { bookingByToken, getConfirmation } from './booking.ts';

let sqlite: Database.Database;
let db: Db;

const PUBLIC_ID = 'PUBLICID0000000000000A';
const TOKEN = 'SUBMITTOKEN00000000000';

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
	sqlite
		.prepare(
			"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token) values ('2027-01-12T13:00:00Z', 90, 15, '2027-01-12T08:00:00Z', 1, 3, 'de', ?, ?)"
		)
		.run(PUBLIC_ID, TOKEN);
});

afterEach(() => {
	sqlite.close();
});

const setContact = (value: string | null) =>
	sqlite.prepare('update setting set admin_contact = ? where id = 1').run(value);

describe('getConfirmation', () => {
	it.each([
		['  a@b.ch ', 'a@b.ch'],
		['', null],
		['   ', null],
		[null, null]
	])('reads the admin contact %j as the footer does: %j', (stored, expected) => {
		setContact(stored);
		expect(getConfirmation(PUBLIC_ID, db)?.adminContact).toBe(expected);
	});

	it('returns null for an unknown or deleted booking', () => {
		expect(getConfirmation('UNKNOWN000000000000000', db)).toBeNull();
		sqlite.prepare("update booking set deleted_at = '2027-01-12T09:00:00Z'").run();
		expect(getConfirmation(PUBLIC_ID, db)).toBeNull();
	});
});

describe('bookingByToken', () => {
	it('finds the booking a token made, live or deleted', () => {
		expect(bookingByToken(TOKEN, db)).toMatchObject({ publicId: PUBLIC_ID, deleted: false });
		sqlite.prepare("update booking set deleted_at = '2027-01-12T09:00:00Z'").run();
		expect(bookingByToken(TOKEN, db)).toMatchObject({ publicId: PUBLIC_ID, deleted: true });
		expect(bookingByToken('UNKNOWN000000000000000', db)).toBeNull();
	});
});
