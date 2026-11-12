// Story 1.6 matrix (AD-24): pre-heat 30–40 min, changeover 15, an 18:00 cold start unless stated.
import { describe, expect, it } from 'vitest';
import { toInstant, type Instant, type LocalDate } from '#lib/time/index.ts';
import {
	arrivalFor,
	bookingNotice,
	freeNotice,
	noticeEquals,
	parseNotice,
	serializeNotice,
	type Notice
} from './notice.ts';
import { offeredStartTimes, type Block, type Booking, type Settings } from './start-times.ts';

const DAY = '2027-01-12';
const settings: Settings = {
	changeoverMin: 15,
	openMinute: 600,
	closeMinute: 1320,
	horizonDays: 14,
	preheatMinMin: 30,
	preheatMaxMin: 40
};
const preheat = { minMin: 30, maxMin: 40 };

const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};
const at = (hhmm: string, date: LocalDate = DAY): Instant => toInstant(date, minutes(hhmm));

let nextId = 1;
function booking(from: string, to: string, opts: Partial<Booking> = {}): Booking {
	return {
		id: nextId++,
		start: at(from),
		durationMin: minutes(to) - minutes(from),
		changeoverMin: 15,
		createdAt: '2027-01-01T10:00:00Z',
		...opts
	};
}
const block = (from: string, to: string): Block => ({ start: at(from), end: at(to) });
const cold = (earliest: string, latest: string | null): Notice => ({
	heat: 'cold',
	earliest: at(earliest),
	latest: latest === null ? null : at(latest)
});

describe('freeNotice', () => {
	it('gives 17:20–17:30 with nothing before 18:00', () => {
		expect(freeNotice(at('18:00'), [], [], settings)).toEqual(cold('17:20', '17:30'));
	});

	it('moves earliest to the end of a block ending 17:25', () => {
		expect(freeNotice(at('18:00'), [], [block('16:00', '17:25')], settings)).toEqual(cold('17:25', '17:30'));
	});

	it('ignores a booking whose changeover ends before the window', () => {
		expect(freeNotice(at('18:00'), [booking('16:00', '17:00')], [], settings)).toEqual(cold('17:20', '17:30'));
	});

	it('collapses to 17:45 after a booking ending 17:30', () => {
		expect(freeNotice(at('18:00'), [booking('16:30', '17:30')], [], settings)).toEqual(cold('17:45', null));
	});

	it('collapses to 17:30 after a block ending 17:30 (equal ends)', () => {
		expect(freeNotice(at('18:00'), [], [block('16:00', '17:30')], settings)).toEqual(cold('17:30', null));
	});

	it('collapses to the start after a block ending at the start', () => {
		expect(freeNotice(at('18:00'), [], [block('17:00', '18:00')], settings)).toEqual(cold('18:00', null));
	});

	it("uses a booking's recorded changeover, not the current one", () => {
		const made = booking('16:30', '17:30', { changeoverMin: 5 });
		expect(freeNotice(at('18:00'), [made], [], settings)).toEqual(cold('17:35', null));
	});

	it('may give an arrival before operating hours', () => {
		expect(freeNotice(at('10:00'), [], [], settings)).toEqual(cold('09:20', '09:30'));
	});

	it('is correct across the spring DST switch', () => {
		expect(freeNotice(toInstant('2027-03-28', 600), [], [], settings)).toEqual({
			heat: 'cold',
			earliest: '2027-03-28T07:20:00Z',
			latest: '2027-03-28T07:30:00Z'
		});
	});

	it('is correct across the autumn DST switch', () => {
		// Sun 31 Oct 2027, back to UTC+1: 10:00 is 09:00Z, arrival 09:20–09:30 local.
		expect(freeNotice(toInstant('2027-10-31', 600), [], [], settings)).toEqual({
			heat: 'cold',
			earliest: '2027-10-31T08:20:00Z',
			latest: '2027-10-31T08:30:00Z'
		});
	});

	it('never puts earliest after the start when a recorded changeover is longer than the gap', () => {
		// Ends 17:40 with recorded changeover 25; the current 15 lets 18:00 be offered, cold.
		const made = booking('16:40', '17:40', { changeoverMin: 25 });
		expect(freeNotice(at('18:00'), [made], [], settings)).toEqual(cold('18:00', null));
	});

	it('is hot with no arrival after a booking ending one changeover earlier', () => {
		expect(freeNotice(at('18:15'), [booking('17:00', '18:00')], [], settings)).toEqual({
			heat: 'hot',
			earliest: null,
			latest: null
		});
	});

	it('ignores deleted bookings and items ending after the start', () => {
		const deleted = booking('16:30', '17:30', { deletedAt: '2027-01-02T10:00:00Z' });
		const after = booking('19:00', '20:00');
		expect(freeNotice(at('18:00'), [deleted, after], [block('18:30', '19:00')], settings)).toEqual(
			cold('17:20', '17:30')
		);
	});

	it('is what offeredStartTimes carries', () => {
		const offered = offeredStartTimes({
			date: DAY,
			bookings: [booking('16:30', '17:30')],
			blocks: [],
			settings,
			seasons: [{ startDate: '2027-01-09', endDate: '2027-04-30' }],
			now: '2027-01-05T08:00:00Z'
		});
		const at18 = offered.find((o) => o.start === at('18:00'));
		expect(at18?.notice).toEqual(cold('17:45', null));
		expect(offered.every((o) => o.notice.heat === o.heat)).toBe(true);
	});
});

describe('arrivalFor', () => {
	it('takes the latest of several clamps', () => {
		const items = [booking('15:00', '17:00')];
		expect(arrivalFor(at('18:00'), items, [block('17:00', '17:25')], preheat)).toEqual({
			earliest: at('17:25'),
			latest: at('17:30')
		});
	});

	it('collapses when earliest equals latest', () => {
		expect(arrivalFor(at('18:00'), [], [block('17:00', '17:30')], preheat)).toEqual({
			earliest: at('17:30'),
			latest: null
		});
	});

	it('keeps latest when earliest is one minute before it', () => {
		expect(arrivalFor(at('18:00'), [], [block('17:00', '17:29')], preheat)).toEqual({
			earliest: at('17:29'),
			latest: at('17:30')
		});
	});
});

describe('bookingNotice', () => {
	it('gives the arrival window of an existing cold booking', () => {
		const own = booking('18:00', '19:00');
		expect(bookingNotice(own, [own], [], preheat)).toEqual(cold('17:20', '17:30'));
	});

	it("uses the neighbour's recorded changeover", () => {
		const before = booking('16:30', '17:30', { changeoverMin: 5 });
		const own = booking('18:00', '19:00');
		expect(bookingNotice(own, [before, own], [], preheat)).toEqual(cold('17:35', null));
	});

	it("clamps to the start when the neighbour's recorded changeover exceeds the gap", () => {
		const before = booking('16:40', '17:40', { changeoverMin: 25 });
		const own = booking('18:00', '19:00');
		expect(bookingNotice(own, [before, own], [], preheat)).toEqual(cold('18:00', null));
	});

	it('gives the start for a block still running at the start', () => {
		const own = booking('18:00', '19:00');
		expect(bookingNotice(own, [own], [block('17:30', '18:30')], preheat)).toEqual(cold('18:00', null));
		expect(arrivalFor(at('18:00'), [], [block('17:30', '18:30')], preheat)).toEqual({
			earliest: at('18:00'),
			latest: null
		});
	});

	it('is hot when back to back with the booking before it', () => {
		const before = booking('17:00', '18:00');
		const own = booking('18:15', '19:15');
		expect(bookingNotice(own, [before, own], [], preheat)).toEqual({ heat: 'hot', earliest: null, latest: null });
	});
});

describe('serializeNotice and parseNotice', () => {
	it('writes the canonical JSON in key order', () => {
		const notice = { latest: null, earliest: '2027-01-12T16:45:00Z', heat: 'cold' } as Notice;
		expect(serializeNotice(notice)).toBe('{"heat":"cold","earliest":"2027-01-12T16:45:00Z","latest":null}');
		expect(serializeNotice({ heat: 'hot', earliest: null, latest: null })).toBe(
			'{"heat":"hot","earliest":null,"latest":null}'
		);
	});

	it.each<Notice>([
		{ heat: 'hot', earliest: null, latest: null },
		{ heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' },
		{ heat: 'cold', earliest: '2027-01-12T16:45:00Z', latest: null }
	])('round-trips %o', (notice) => {
		const json = serializeNotice(notice);
		expect(parseNotice(json)).toEqual(notice);
		expect(serializeNotice(parseNotice(json))).toBe(json);
	});

	it.each([
		'not json',
		'',
		'null',
		'[]',
		'"cold"',
		'{"heat":"warm","earliest":null,"latest":null}',
		'{"heat":"hot","earliest":null}',
		'{"heat":"hot","earliest":null,"latest":null,"past":true}',
		'{"heat":"hot","earliest":"2027-01-12T16:20:00Z","latest":null}',
		'{"heat":"cold","earliest":null,"latest":null}',
		'{"heat":"cold","earliest":"2027-01-12T16:20","latest":null}',
		'{"heat":"cold","earliest":"2027-01-12T16:20:00.000Z","latest":null}',
		'{"heat":"cold","earliest":"2027-01-12T16:40:00Z","latest":"2027-01-12T16:30:00Z"}',
		'{"heat":"cold","earliest":"2027-01-12T16:30:00Z","latest":"2027-01-12T16:30:00Z"}',
		'{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":5}'
	])('throws on %s', (json) => {
		expect(() => parseNotice(json)).toThrow(/^Notice: /);
	});
});

describe('noticeEquals', () => {
	const a: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };

	it('is true for the same value', () => {
		expect(noticeEquals(a, { ...a })).toBe(true);
		expect(noticeEquals({ heat: 'hot', earliest: null, latest: null }, { heat: 'hot', earliest: null, latest: null })).toBe(
			true
		);
	});

	it.each<Notice>([
		{ heat: 'hot', earliest: null, latest: null },
		{ heat: 'cold', earliest: '2027-01-12T16:25:00Z', latest: '2027-01-12T16:30:00Z' },
		{ heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: null }
	])('is false against %o', (other) => {
		expect(noticeEquals(a, other)).toBe(false);
		expect(noticeEquals(other, a)).toBe(false);
	});
});
