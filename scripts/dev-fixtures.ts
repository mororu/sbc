// Development only: inserts sample bookings and blocks for one day, for trying the calendar by hand.
//   npm run db:fixtures              → the first day of the first season
//   npm run db:fixtures -- 2027-01-12
// Writes directly to the dev database (not through commands): it is a test-data tool, never app code.
// Wall-clock to instant conversion goes through src/lib/time like everywhere else.
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { isValidDate, toInstant } from '#lib/time/index.ts';

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

if (process.env.NODE_ENV === 'production') fail('db:fixtures refuses to run with NODE_ENV=production.');
if (existsSync('.env')) process.loadEnvFile('.env');

const path = process.env.DATABASE_PATH;
if (!path || !existsSync(path)) {
	fail(`No database at ${path ?? '(DATABASE_PATH unset)'}. Start the app once (npm run dev) to create it.`);
}

const db = new Database(path);
const first = db.prepare('select start_date from season order by start_date limit 1').get() as
	| { start_date: string }
	| undefined;
if (!first) fail('No season row. Did the migrations run?');

const date = process.argv[2] ?? first.start_date;
if (!isValidDate(date)) fail(`Not a date: ${date} (expected yyyy-mm-dd).`);

const season = db
	.prepare('select id from season where start_date <= ? and ? <= end_date')
	.get(date, date) as { id: number } | undefined;
if (!season) fail(`${date} is not in any season, so the calendar would never show it.`);

const setting = db.prepare('select changeover_min from setting where id = 1').get() as {
	changeover_min: number;
};

const dayStart = toInstant(date, 0);
const dayEnd = toInstant(date, 24 * 60);
const existing = db
	.prepare(
		`select (select count(*) from booking where deleted_at is null and start_at >= ? and start_at < ?)
		      + (select count(*) from block where start_at >= ? and start_at < ?) as n`
	)
	.get(dayStart, dayEnd, dayStart, dayEnd) as { n: number };
if (existing.n > 0) fail(`${date} already has bookings or blocks; not adding overlapping fixtures.`);

const at = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant(date, h * 60 + m);
};
const createdAt = Temporal.Now.instant().toString({ smallestUnit: 'second' });
const changeover = setting.changeover_min;

const insertBooking = db.prepare(
	'insert into booking (start_at, duration_min, changeover_min, created_at, season_id) values (?, ?, ?, ?, ?)'
);
const insertBlock = db.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)');

db.transaction(() => {
	// A cleaning block at midday, a hot pair (17:00, then one changeover after 18:00) and a lone
	// cold start at 20:00.
	insertBlock.run(at('12:00'), at('13:00'), 'cleaning');
	insertBooking.run(at('17:00'), 60, changeover, createdAt, season.id);
	insertBooking.run(toInstant(date, 18 * 60 + changeover), 60, changeover, createdAt, season.id);
	insertBooking.run(at('20:00'), 90, changeover, createdAt, season.id);
})();

console.log(`Inserted 3 bookings and 1 block on ${date} into ${path}.`);
