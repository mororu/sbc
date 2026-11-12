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
				close_minute: 1320,
				admin_contact: 'platzhalter@sauna-luegisee.ch'
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
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token) values ('2027-01-12T16:00:00Z', ?, 15, '2027-01-05T08:00:00Z', ?, 2, 'de', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"
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
				.prepare("insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token) values ('2027-01-12T16:00:00Z', 60, 75, '2027-01-05T08:00:00Z', 1, 2, 'de', lower(hex(randomblob(16))), lower(hex(randomblob(16))))")
				.run()
		).toThrow(/booking_changeover/);
		expect(() =>
			sqlite
				.prepare("insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token) values ('2027-01-12T17:00:00+01:00', 60, 15, '2027-01-05T08:00:00Z', 1, 2, 'de', lower(hex(randomblob(16))), lower(hex(randomblob(16))))")
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

	it('checks party size and locale, and keeps public ids and submit tokens unique (Story 1.7)', () => {
		const sqlite = openDatabase(':memory:');
		applyMigrations(createDb(sqlite), MIGRATIONS_FOLDER);
		const insert = (partySize: number, locale: string, publicId: string, token: string) => () =>
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, name, email, mobile, public_id, submit_token) values ('2027-01-12T16:00:00Z', 60, 15, '2027-01-05T08:00:00Z', 1, ?, ?, null, null, null, ?, ?)"
				)
				.run(partySize, locale, publicId, token);
		expect(insert(0, 'de', 'p0', 't0')).toThrow(/booking_party_size/);
		expect(insert(7, 'de', 'p7', 't7')).toThrow(/booking_party_size/);
		expect(insert(2, 'fr', 'pf', 'tf')).toThrow(/booking_locale/);
		expect(insert(6, 'en', 'p1', 't1')()).toMatchObject({ changes: 1 });
		expect(insert(1, 'de', 'p1', 't2')).toThrow(/UNIQUE.*public_id/);
		expect(insert(1, 'de', 'p2', 't1')).toThrow(/UNIQUE.*submit_token/);
		expect(() =>
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale) values ('2027-01-12T16:00:00Z', 60, 15, '2027-01-05T08:00:00Z', 1, 2, 'de')"
				)
				.run()
		).toThrow(/NOT NULL.*public_id/);
		sqlite.close();
	});

	it('fills the new booking columns of rows made before migration 0002', () => {
		const folder = join(dir, 'migrations');
		cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
		// Migrate to 0001 only, insert an old-style row, then apply 0002 and later.
		const journalPath = join(folder, 'meta', '_journal.json');
		const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
		const full = JSON.stringify(journal);
		writeFileSync(
			journalPath,
			JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag < '0002') })
		);
		const sqlite = openDatabase(join(dir, 'old.sqlite'));
		const db = createDb(sqlite);
		applyMigrations(db, folder);
		sqlite
			.prepare(
				"insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values ('2027-01-12T16:00:00Z', 60, 15, '2027-01-05T08:00:00Z', 1)"
			)
			.run();
		writeFileSync(journalPath, full);
		applyMigrations(db, folder);
		const row = sqlite.prepare('select * from booking').get() as Record<string, unknown>;
		expect(row).toMatchObject({ start_at: '2027-01-12T16:00:00Z', party_size: 1, locale: 'de', name: null, email: null, mobile: null });
		expect(row.public_id).toMatch(/^[0-9a-f]{32}$/);
		expect(row.submit_token).toMatch(/^[0-9a-f]{32}$/);
		expect(row.public_id).not.toBe(row.submit_token);
		sqlite.close();
	});

	it('adds nullable notice columns and seeds the admin contact idempotently (Story 1.8)', () => {
		const sqlite = openDatabase(':memory:');
		applyMigrations(createDb(sqlite), MIGRATIONS_FOLDER);
		const columns = (table: string) =>
			(sqlite.prepare(`pragma table_info(${table})`).all() as { name: string; notnull: number }[]).map((c) => [
				c.name,
				c.notnull
			]);
		expect(columns('booking')).toEqual(
			expect.arrayContaining([
				['notice_at_booking', 0],
				['last_told_notice', 0]
			])
		);
		expect(columns('setting')).toEqual(expect.arrayContaining([['admin_contact', 0]]));
		// Re-running the seed keeps a value the admins have set (Epic 3) and fills only an empty one.
		const seed = readFileSync(join(MIGRATIONS_FOLDER, '0003_booking_notice.sql'), 'utf8')
			.split('--> statement-breakpoint')
			.find((s) => s.includes('UPDATE'));
		expect(seed).toBeDefined();
		sqlite.prepare("update setting set admin_contact = 'sauna@example.ch' where id = 1").run();
		sqlite.exec(seed!);
		expect(sqlite.prepare('select admin_contact from setting').get()).toEqual({ admin_contact: 'sauna@example.ch' });
		for (const empty of [null, '', '   ']) {
			sqlite.prepare('update setting set admin_contact = ? where id = 1').run(empty);
			sqlite.exec(seed!);
			sqlite.exec(seed!);
			expect(sqlite.prepare('select admin_contact from setting').get()).toEqual({
				admin_contact: 'platzhalter@sauna-luegisee.ch'
			});
		}
		sqlite.close();
	});

	it('never lets notice_at_booking change once set, but fills it on an old row (Story 1.8)', () => {
		const sqlite = openDatabase(':memory:');
		applyMigrations(createDb(sqlite), MIGRATIONS_FOLDER);
		const insert = (notice: string | null, id: string) =>
			sqlite
				.prepare(
					"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, party_size, locale, public_id, submit_token, notice_at_booking, last_told_notice) values ('2027-01-12T16:00:00Z', 60, 15, '2027-01-05T08:00:00Z', 1, 2, 'de', ?, ?, ?, ?)"
				)
				.run(id, id, notice, notice);
		const hot = '{"heat":"hot","earliest":null,"latest":null}';
		const cold = '{"heat":"cold","earliest":"2027-01-12T15:20:00Z","latest":"2027-01-12T15:30:00Z"}';
		insert(hot, 'set');
		insert(null, 'old');
		const update = (id: string, value: string | null) => () =>
			sqlite.prepare('update booking set notice_at_booking = ? where public_id = ?').run(value, id);
		expect(update('set', cold)).toThrow(/notice_at_booking is immutable/);
		expect(update('set', null)).toThrow(/notice_at_booking is immutable/);
		// Other columns, including the last-told notice, stay writable.
		expect(sqlite.prepare("update booking set last_told_notice = ?, deleted_at = '2027-01-06T08:00:00Z' where public_id = 'set'").run(cold).changes).toBe(1);
		expect(update('old', cold)().changes).toBe(1);
		expect(sqlite.prepare('select public_id, notice_at_booking from booking order by public_id').all()).toEqual([
			{ public_id: 'old', notice_at_booking: cold },
			{ public_id: 'set', notice_at_booking: hot }
		]);
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
