// Development only: inserts sample bookings and blocks for one day, for trying the calendar by hand.
//   npm run db:fixtures              → the first day of the first season
//   npm run db:fixtures -- 2027-01-12
// Writes directly to the dev database (not through commands): it is a test-data tool, never app code.
// Wall-clock to instant conversion goes through src/lib/time like everywhere else, and each booking's
// notice (stored as notice at booking and last-told notice) comes from src/lib/domain.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { bookingNotice, serializeNotice, type Block, type Booking } from '#lib/domain/index.ts';
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

const setting = db
	.prepare('select changeover_min, preheat_min_min, preheat_max_min from setting where id = 1')
	.get() as { changeover_min: number; preheat_min_min: number; preheat_max_min: number };

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
const madeAt = Temporal.Now.instant().round({ smallestUnit: 'second', roundingMode: 'floor' });
/** The fixtures are booked one minute apart, in list order, so their order is real. */
const createdAt = (index: number) => madeAt.add({ minutes: index }).toString({ smallestUnit: 'second' });
const changeover = setting.changeover_min;

const insertBookingRow = db.prepare(
	`insert into booking (start_at, duration_min, changeover_min, created_at, season_id,
	   party_size, locale, name, email, mobile, public_id, submit_token, notice_at_booking, last_told_notice)
	 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertBlock = db.prepare('insert into block (start_at, end_at, reason) values (?, ?, ?)');
/** Public id and submit token as the app makes them: 128 random bits, base64url. */
const randomId = () => randomBytes(16).toString('base64url');

// A cleaning block at midday, a hot pair (17:00, then one changeover after 18:00) and a lone
// cold start at 20:00, booked in that order.
const blocks: Block[] = [{ start: at('12:00'), end: at('13:00') }];
const bookings: Booking[] = [
	{ id: 1, start: at('17:00'), durationMin: 60, changeoverMin: changeover, createdAt: createdAt(0) },
	{ id: 2, start: toInstant(date, 18 * 60 + changeover), durationMin: 60, changeoverMin: changeover, createdAt: createdAt(1) },
	{ id: 3, start: at('20:00'), durationMin: 90, changeoverMin: changeover, createdAt: createdAt(2) }
];
const preheat = { minMin: setting.preheat_min_min, maxMin: setting.preheat_max_min };

db.transaction(() => {
	for (const block of blocks) insertBlock.run(block.start, block.end, 'cleaning');
	for (const [index, booking] of bookings.entries()) {
		const guest = index + 1;
		// The notice as it stood when the booking was made: only the bookings made before it count.
		const notice = serializeNotice(bookingNotice(booking, bookings.slice(0, index), blocks, preheat));
		insertBookingRow.run(
			booking.start,
			booking.durationMin,
			booking.changeoverMin,
			booking.createdAt,
			season.id,
			2,
			'de',
			`Testgast ${guest}`,
			`testgast${guest}@example.ch`,
			// +41 79 and seven digits: a valid Swiss mobile for any guest count up to 9 999 999.
			`+4179${String(guest).padStart(7, '0')}`,
			randomId(),
			randomId(),
			notice,
			notice
		);
	}
})();

console.log(`Inserted 3 bookings and 1 block on ${date} into ${path}.`);
