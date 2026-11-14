// Story 2.4 matrix: send problems of one booking, and the call list, at an explicit `now`.
// Tue 12 Jan 2027 18:00 Zurich start; booked early, the keybox row is due Mon 11 Jan 18:00 (17:00Z).
import { describe, expect, it } from 'vitest';
import { addMinutes, type Instant } from '#lib/time/index.ts';
import { callList, keyboxOverdueAt, sendProblems, type SendProblemEntry, type SendProblemRow } from './call-list.ts';

const START: Instant = '2027-01-12T17:00:00Z';
const CUTOFF: Instant = '2027-01-11T17:00:00Z';
const BOOKED_EARLY: Instant = '2027-01-07T10:00:00Z';

const r = (id: number, kind: SendProblemRow['kind'], state: SendProblemRow['state'], over: Partial<SendProblemRow> = {}) =>
	({ id, kind, state, urgent: null, resolvedAt: null, ...over }) satisfies SendProblemRow;
const confirmation = (state: SendProblemRow['state'] = 'accepted', over: Partial<SendProblemRow> = {}) =>
	r(1, 'confirmation', state, over);
const keybox = (state: SendProblemRow['state'], over: Partial<SendProblemRow> = {}) => r(2, 'keybox', state, over);
const heat = (id: number, state: SendProblemRow['state'], urgent: boolean | null, over: Partial<SendProblemRow> = {}) =>
	r(id, 'heat_change', state, { urgent, ...over });
const early = (rows: SendProblemRow[]): SendProblemEntry => ({ start: START, createdAt: BOOKED_EARLY, rows });

const NONE = { callRequired: [], refusals: [] };

describe('sendProblems: keybox', () => {
	it('reports a refused keybox row, not also as overdue', () => {
		expect(sendProblems(early([confirmation(), keybox('refused')]), addMinutes(CUTOFF, 60))).toEqual({
			callRequired: [{ rowId: 2, reason: 'keybox_refused' }],
			refusals: []
		});
	});

	it('reports an expired keybox row (a safety net: the feed drops a booking at its start)', () => {
		expect(sendProblems(early([confirmation(), keybox('expired')]), START)).toEqual({
			callRequired: [{ rowId: 2, reason: 'keybox_expired' }],
			refusals: []
		});
	});

	it.each(['pending', 'in_flight', 'transient_failure'] as const)(
		'reports a %s keybox row 15 minutes after its due time, and nothing at 14',
		(state) => {
			const entry = early([confirmation(), keybox(state)]);
			expect(sendProblems(entry, addMinutes(CUTOFF, 14))).toEqual(NONE);
			expect(sendProblems(entry, addMinutes(CUTOFF, 15))).toEqual({
				callRequired: [{ rowId: 2, reason: 'keybox_overdue' }],
				refusals: []
			});
		}
	);

	it('measures from the booking time for a booking made past its cutoff', () => {
		const entry = { start: START, createdAt: '2027-01-12T08:00:00Z', rows: [confirmation(), keybox('pending')] };
		expect(sendProblems(entry, '2027-01-12T08:14:00Z')).toEqual(NONE);
		expect(sendProblems(entry, '2027-01-12T08:15:00Z').callRequired).toEqual([{ rowId: 2, reason: 'keybox_overdue' }]);
	});

	it('is overdue 5 minutes before the start for a booking made 10 minutes before it', () => {
		const createdAt = addMinutes(START, -10);
		const entry = { start: START, createdAt, rows: [confirmation(), keybox('transient_failure')] };
		expect(keyboxOverdueAt(START, createdAt)).toBe(addMinutes(START, -5));
		expect(sendProblems(entry, addMinutes(START, -6))).toEqual(NONE);
		expect(sendProblems(entry, addMinutes(START, -5)).callRequired).toEqual([{ rowId: 2, reason: 'keybox_overdue' }]);
	});

	it('is overdue right at its due time for a booking made 3 minutes before the start', () => {
		const createdAt = addMinutes(START, -3);
		const entry = { start: START, createdAt, rows: [confirmation('pending'), keybox('pending')] };
		expect(keyboxOverdueAt(START, createdAt)).toBe(createdAt);
		expect(sendProblems(entry, createdAt).callRequired).toEqual([{ rowId: 2, reason: 'keybox_overdue' }]);
	});

	it.each(['accepted', 'cancelled'] as const)('reports nothing for a %s keybox row', (state) => {
		expect(sendProblems(early([confirmation(), keybox(state)]), START)).toEqual(NONE);
	});

	it('reports nothing before the keybox row exists', () => {
		expect(sendProblems(early([confirmation('pending')]), START)).toEqual(NONE);
	});
});

describe('sendProblems: urgent heat change', () => {
	it('reports a refused latest urgent row', () => {
		expect(sendProblems(early([confirmation(), keybox('pending'), heat(3, 'refused', true)]), CUTOFF)).toEqual({
			callRequired: [{ rowId: 3, reason: 'warning_refused' }],
			refusals: []
		});
	});

	it('reports an expired latest urgent row (a safety net: the feed drops a booking at its start)', () => {
		expect(sendProblems(early([confirmation(), keybox('accepted'), heat(3, 'expired', true)]), START)).toEqual({
			callRequired: [{ rowId: 3, reason: 'warning_expired' }],
			refusals: []
		});
	});

	it('still reports a refused urgent row when the newer change was cancelled (stale warning)', () => {
		// B was cancelled at recheck or by the keybox claim before its claim froze an urgent flag.
		const entry = early([confirmation(), keybox('accepted'), heat(3, 'refused', true), heat(4, 'cancelled', null)]);
		expect(sendProblems(entry, addMinutes(CUTOFF, 30))).toEqual({
			callRequired: [{ rowId: 3, reason: 'warning_refused' }],
			refusals: []
		});
	});

	it('lists an older refused urgent row as a refusal once a later urgent row was accepted', () => {
		const entry = early([confirmation(), keybox('pending'), heat(3, 'refused', true), heat(4, 'accepted', true)]);
		expect(sendProblems(entry, '2027-01-08T10:00:00Z')).toEqual({
			callRequired: [],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
		});
	});

	it('picks the latest urgent row by id, not by order, and lists the older refused one', () => {
		const entry = early([heat(4, 'accepted', true), heat(3, 'refused', true), keybox('pending'), confirmation()]);
		expect(sendProblems(entry, '2027-01-08T10:00:00Z')).toEqual({
			callRequired: [],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
		});
	});

	it('counts an unclaimed expired heat row (urgent null) as not urgent', () => {
		expect(sendProblems(early([confirmation(), keybox('accepted'), heat(3, 'expired', null)]), START)).toEqual(NONE);
	});
});

describe('sendProblems: ordering', () => {
	it('orders callRequired and refusals by row id, whatever the row order', () => {
		const entry = early([
			heat(7, 'refused', false),
			heat(5, 'refused', true),
			r(2, 'keybox', 'refused'),
			heat(6, 'refused', false),
			confirmation('refused')
		]);
		expect(sendProblems(entry, START)).toEqual({
			callRequired: [
				{ rowId: 2, reason: 'keybox_refused' },
				{ rowId: 5, reason: 'warning_refused' }
			],
			refusals: [
				{ rowId: 1, kind: 'confirmation' },
				{ rowId: 6, kind: 'heat_change' },
				{ rowId: 7, kind: 'heat_change' }
			]
		});
	});
});

describe('sendProblems: non-urgent refusals', () => {
	it('lists a refused confirmation and a refused good-news row as refusals only', () => {
		const entry = early([confirmation('refused'), keybox('pending'), heat(3, 'refused', false)]);
		expect(sendProblems(entry, '2027-01-08T10:00:00Z')).toEqual({
			callRequired: [],
			refusals: [
				{ rowId: 1, kind: 'confirmation' },
				{ rowId: 3, kind: 'heat_change' }
			]
		});
	});

	it('never lists a refusal that raises a call', () => {
		expect(sendProblems(early([confirmation(), keybox('refused')]), START).refusals).toEqual([]);
	});
});

describe('sendProblems: resolved rows', () => {
	const RESOLVED = { resolvedAt: '2027-01-11T17:20:00Z' };

	it.each([
		['refused keybox', [keybox('refused', RESOLVED)]],
		['expired keybox', [keybox('expired', RESOLVED)]],
		['overdue keybox', [keybox('transient_failure', RESOLVED)]],
		['refused urgent warning', [keybox('accepted'), heat(3, 'refused', true, RESOLVED)]],
		['expired urgent warning', [keybox('accepted'), heat(3, 'expired', true, RESOLVED)]],
		['refused confirmation', [confirmation('refused', RESOLVED), keybox('accepted')]],
		['refused good news', [keybox('accepted'), heat(3, 'refused', false, RESOLVED)]]
	])('raises nothing for a resolved %s', (_name, rows) => {
		expect(sendProblems(early(rows), START)).toEqual(NONE);
	});

	it('raises nothing for an overdue keybox row resolved and later refused', () => {
		expect(sendProblems(early([confirmation(), keybox('transient_failure', RESOLVED)]), '2027-01-11T17:20:00Z')).toEqual(NONE);
		expect(sendProblems(early([confirmation(), keybox('refused', RESOLVED)]), '2027-01-11T18:00:00Z')).toEqual(NONE);
	});

	it('raises nothing for an overdue keybox row resolved and later expired', () => {
		expect(sendProblems(early([confirmation(), keybox('pending', RESOLVED)]), '2027-01-11T17:20:00Z')).toEqual(NONE);
		expect(sendProblems(early([confirmation(), keybox('expired', RESOLVED)]), START)).toEqual(NONE);
	});

	it('does not fall back to an older urgent row when the latest one is resolved', () => {
		const entry = early([keybox('accepted'), heat(3, 'refused', true), heat(4, 'refused', true, RESOLVED)]);
		expect(sendProblems(entry, START)).toEqual({
			callRequired: [],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
		});
	});
});

describe('callList', () => {
	const at = (start: Instant, rows: SendProblemRow[]): SendProblemEntry => ({ start, createdAt: BOOKED_EARLY, rows });
	const LATER = '2027-01-13T17:00:00Z';

	it('lists only bookings with a problem, by start, then booking id', () => {
		const feed = new Map<number, SendProblemEntry>([
			[9, at(LATER, [r(90, 'confirmation', 'refused')])],
			[5, at(START, [r(50, 'keybox', 'accepted')])],
			[8, at(START, [r(80, 'keybox', 'refused')])],
			[3, at(START, [r(30, 'confirmation', 'refused'), r(31, 'keybox', 'accepted')])]
		]);
		expect(callList(feed, CUTOFF)).toEqual([
			{ bookingId: 3, start: START, callRequired: [], refusals: [{ rowId: 30, kind: 'confirmation' }] },
			{ bookingId: 8, start: START, callRequired: [{ rowId: 80, reason: 'keybox_refused' }], refusals: [] },
			{ bookingId: 9, start: LATER, callRequired: [], refusals: [{ rowId: 90, kind: 'confirmation' }] }
		]);
	});

	it('is empty for an empty feed', () => {
		expect(callList(new Map(), CUTOFF)).toEqual([]);
	});
});
