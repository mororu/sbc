import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUSY_TIMEOUT_MS, createDb, openDatabase } from './index.ts';
import { applyMigrations, MIGRATIONS_FOLDER } from './migrate.ts';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'sauna-db-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
	it('creates the parent folder and sets WAL, busy timeout and foreign keys', () => {
		const sqlite = openDatabase(join(dir, 'nested', 'app.sqlite'));
		expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
		sqlite.close();
	});
});

describe('applyMigrations', () => {
	it('applies the committed migrations to a fresh database, and again without change', () => {
		const sqlite = openDatabase(join(dir, 'app.sqlite'));
		const db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		applyMigrations(db, MIGRATIONS_FOLDER);
		const rows = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as {
			n: number;
		};
		expect(rows.n).toBeGreaterThanOrEqual(1);
		sqlite.close();
	});

	it('creates the core tables with one seeded setting and season, idempotently', () => {
		const sqlite = openDatabase(join(dir, 'app.sqlite'));
		const db = createDb(sqlite);
		applyMigrations(db, MIGRATIONS_FOLDER);
		// Re-running the seed statements must not duplicate rows.
		applyMigrations(db, MIGRATIONS_FOLDER);
		const seedSql = readFileSync(join(MIGRATIONS_FOLDER, '0001_core_tables.sql'), 'utf8');
		for (const statement of seedSql.split('--> statement-breakpoint').filter((s) => s.includes('INSERT'))) {
			sqlite.exec(statement);
		}
		const tables = sqlite
			.prepare("select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' order by name")
			.all()
			.map((r) => (r as { name: string }).name);
		expect(tables).toEqual(expect.arrayContaining(['block', 'booking', 'season', 'setting']));
		expect(sqlite.prepare('select * from setting').all()).toEqual([
			{
				id: 1,
				changeover_min: 15,
				preheat_min_min: 30,
				preheat_max_min: 40,
				horizon_days: 14,
				open_minute: 600,
				close_minute: 1320
			}
		]);
		expect(sqlite.prepare('select * from season').all()).toEqual([
			{ id: 1, start_date: '2027-01-09', end_date: '2027-04-30' }
		]);
		sqlite.close();
	});

	it('rejects rows that break the constraints', () => {
		const sqlite = openDatabase(':memory:');
		applyMigrations(createDb(sqlite), MIGRATIONS_FOLDER);
		const insertBooking = (duration: number, seasonId: number) =>
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values ('2027-01-12T16:00:00Z', ?, 15, '2027-01-05T08:00:00Z', ?)"
				)
				.run(duration, seasonId);
		expect(() => insertBooking(75, 1)).toThrow(/CHECK/);
		expect(() => insertBooking(60, 99)).toThrow(/FOREIGN KEY/);
		const insertBlock = (start: string, end: string, reason: string) =>
			sqlite.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)').run(start, end, reason);
		expect(() => insertBlock('2027-01-12T10:00:00Z', '2027-01-12T11:00:00Z', 'party')).toThrow(/block_reason/);
		expect(() => insertBlock('2027-01-12T11:00:00Z', '2027-01-12T10:00:00Z', 'cleaning')).toThrow(/block_range/);
		expect(() => insertBlock('2027-01-12 10:00', '2027-01-12T11:00:00Z', 'cleaning')).toThrow(/block_instants/);
		expect(insertBlock('2027-01-12T10:00:00Z', '2027-01-12T11:00:00Z', 'private_use').changes).toBe(1);
		expect(() =>
			sqlite
				.prepare("insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values ('2027-01-12T16:00:00Z', 60, 75, '2027-01-05T08:00:00Z', 1)")
				.run()
		).toThrow(/booking_changeover/);
		expect(() =>
			sqlite
				.prepare("insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values ('2027-01-12T17:00:00+01:00', 60, 15, '2027-01-05T08:00:00Z', 1)")
				.run()
		).toThrow(/booking_instants/);
		expect(() => sqlite.prepare("insert into season (start_date, end_date) values ('2027-05-01', '2027-04-01')").run()).toThrow(/season_dates/);
		expect(() => sqlite.prepare("insert into season (start_date, end_date) values ('1.5.2027', '2027-06-01')").run()).toThrow(/season_date_format/);
		const updateSetting = (assignment: string) => () => sqlite.prepare(`update setting set ${assignment} where id = 1`).run();
		expect(updateSetting('changeover_min = 61')).toThrow(/setting_changeover/);
		expect(updateSetting('preheat_min_min = 45, preheat_max_min = 40')).toThrow(/setting_preheat/);
		expect(updateSetting('horizon_days = 0')).toThrow(/setting_horizon/);
		expect(updateSetting('open_minute = 1320, close_minute = 600')).toThrow(/setting_hours/);
		expect(() => sqlite.prepare('insert into setting (id, changeover_min, preheat_min_min, preheat_max_min, horizon_days, open_minute, close_minute) values (2, 15, 30, 40, 14, 600, 1320)').run()).toThrow(/CHECK/);
		sqlite.close();
	});

	it('fails with a clear message when the migrations folder is missing', () => {
		const db = createDb(openDatabase(':memory:'));
		expect(() => applyMigrations(db, join(dir, 'nowhere'))).toThrow(/No migrations found/);
	});

	it('throws when a migration fails, so boot aborts', () => {
		const folder = join(dir, 'migrations');
		cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
		writeFileSync(join(folder, '0000_baseline.sql'), 'THIS IS NOT SQL;');
		const db = createDb(openDatabase(':memory:'));
		expect(() => applyMigrations(db, folder)).toThrow();
	});
});
