// Story 3.5: the block read queries on an in-memory database. Mon 11 Jan 2027, 08:00 Zurich,
// changeover 15, pre-heat 30–40.
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, openDatabase, type Db } from '../index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from '../migrate.ts';
import { getAdminDayBlocks, getBlock, getBlockCheck, getBlockDeletion, getUpcomingBlocks } from './block.ts';

const NOW = '2027-01-11T07:00:00Z';

let sqlite: Database.Database;
let db: Db;
let n = 0;

beforeEach(() => {
	sqlite = openDatabase(':memory:');
	db = createDb(sqlite);
	applyMigrations(db, MIGRATIONS_FOLDER);
});

afterEach(() => sqlite.close());

const insertBlock = (start: string, end: string, reason = 'cleaning') =>
	Number(sqlite.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)').run(start, end, reason).lastInsertRowid);
const insertBooking = (start: string, name: string | null, lastTold: string | null = null) =>
	Number(
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, name, last_told_notice) values (?, 60, 15, '2027-01-07T10:00:00Z', 1, 2, 'de', ?, ?, ?, ?)"
			)
			.run(start, `PQ${++n}`, `TQ${n}`, name, lastTold).lastInsertRowid
	);

describe('getUpcomingBlocks', () => {
	it('lists blocks that have not ended, in start order, with their reasons', () => {
		insertBlock('2027-01-10T08:00:00Z', '2027-01-10T10:00:00Z');
		const running = insertBlock('2027-01-11T06:30:00Z', '2027-01-11T08:00:00Z', 'maintenance');
		const later = insertBlock('2027-01-12T08:00:00Z', '2027-01-12T10:00:00Z', 'private_use');
		const soon = insertBlock('2027-01-11T15:00:00Z', '2027-01-11T16:00:00Z');
		insertBlock('2027-01-11T06:00:00Z', NOW);
		expect(getUpcomingBlocks(NOW, db).map((b) => [b.id, b.reason])).toEqual([
			[running, 'maintenance'],
			[soon, 'cleaning'],
			[later, 'private_use']
		]);
	});
});

describe('getAdminDayBlocks', () => {
	it('lists the blocks overlapping the range', () => {
		const inside = insertBlock('2027-01-11T08:00:00Z', '2027-01-11T10:00:00Z');
		insertBlock('2027-01-12T08:00:00Z', '2027-01-12T10:00:00Z');
		expect(getAdminDayBlocks('2027-01-10T23:00:00Z', '2027-01-11T23:00:00Z', db)).toEqual([
			{ id: inside, start: '2027-01-11T08:00:00Z', end: '2027-01-11T10:00:00Z', reason: 'cleaning' }
		]);
	});
});

describe('getBlockCheck', () => {
	it('is past at or before now, and names overlapped bookings by first name (null when erased)', () => {
		insertBooking('2027-01-11T17:00:00Z', 'Anna Meier');
		insertBooking('2027-01-11T18:30:00Z', null);
		const check = getBlockCheck({ start: '2027-01-11T17:30:00Z', end: '2027-01-11T19:00:00Z' }, NOW, db);
		expect(check).toMatchObject({
			date: '2027-01-11',
			past: false,
			conflict: {
				kind: 'overlap',
				bookings: [
					{ start: '2027-01-11T17:00:00Z', firstName: 'Anna' },
					{ start: '2027-01-11T18:30:00Z', firstName: null }
				]
			}
		});
		expect(getBlockCheck({ start: NOW, end: '2027-01-11T08:00:00Z' }, NOW, db).past).toBe(true);
	});
});

describe('getBlockDeletion', () => {
	it('is null for an unknown block and started for a running one', () => {
		expect(getBlockDeletion(99, NOW, db)).toBeNull();
		const id = insertBlock('2027-01-11T06:30:00Z', '2027-01-11T08:00:00Z');
		expect(getBlockDeletion(id, NOW, db)).toMatchObject({ block: { id }, date: '2027-01-11', started: true });
		expect(getBlock(id, db)).toMatchObject({ id, reason: 'cleaning' });
	});
});
