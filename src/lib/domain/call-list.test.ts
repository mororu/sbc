// Story 2.4 matrix: send problems of one booking, and the call list, at an explicit `now`.
// Tue 12 Jan 2027 18:00 Zurich start; booked early, the keybox row is due Mon 11 Jan 18:00 (17:00Z).
import { describe, expect, it } from 'vitest';
import { addMinutes, type Instant } from '#lib/time/index.ts';
import {
	callList,
	deriveCallList,
	keyboxPhaseHeatChange,
	sendProblems,
	warningOverdueAt,
	type CallFeedEntry,
	type SendProblemEntry,
	type SendProblemRow
} from './call-list.ts';
import { keyboxOverdueAt } from './keybox.ts';
import type { Notice } from './notice.ts';

const START: Instant = '2027-01-12T17:00:00Z';
const CUTOFF: Instant = '2027-01-11T17:00:00Z';
const BOOKED_EARLY: Instant = '2027-01-07T10:00:00Z';
/** The default pre-heat maximum (30–40 window): the warning window opens 60 minutes before the start. */
const PREHEAT_MAX = 40;

const r = (id: number, kind: SendProblemRow['kind'], state: SendProblemRow['state'], over: Partial<SendProblemRow> = {}) =>
	({ id, kind, state, urgent: null, resolvedAt: null, ...over }) satisfies SendProblemRow;
const confirmation = (state: SendProblemRow['state'] = 'accepted', over: Partial<SendProblemRow> = {}) =>
	r(1, 'confirmation', state, over);
const keybox = (state: SendProblemRow['state'], over: Partial<SendProblemRow> = {}) => r(2, 'keybox', state, over);
const heat = (id: number, state: SendProblemRow['state'], urgent: boolean | null, over: Partial<SendProblemRow> = {}) =>
	r(id, 'heat_change', state, { urgent, ...over });
const early = (rows: SendProblemRow[], preheatMaxMin = PREHEAT_MAX): SendProblemEntry => ({
	start: START,
	createdAt: BOOKED_EARLY,
	preheatMaxMin,
	rows
});

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
		const entry = { start: START, createdAt: '2027-01-12T08:00:00Z', preheatMaxMin: PREHEAT_MAX, rows: [confirmation(), keybox('pending')] };
		expect(sendProblems(entry, '2027-01-12T08:14:00Z')).toEqual(NONE);
		expect(sendProblems(entry, '2027-01-12T08:15:00Z').callRequired).toEqual([{ rowId: 2, reason: 'keybox_overdue' }]);
	});

	it('is overdue 5 minutes before the start for a booking made 10 minutes before it', () => {
		const createdAt = addMinutes(START, -10);
		const entry = { start: START, createdAt, preheatMaxMin: PREHEAT_MAX, rows: [confirmation(), keybox('transient_failure')] };
		expect(keyboxOverdueAt(START, createdAt)).toBe(addMinutes(START, -5));
		expect(sendProblems(entry, addMinutes(START, -6))).toEqual(NONE);
		expect(sendProblems(entry, addMinutes(START, -5)).callRequired).toEqual([{ rowId: 2, reason: 'keybox_overdue' }]);
	});

	it('is overdue right at its due time for a booking made 3 minutes before the start', () => {
		const createdAt = addMinutes(START, -3);
		const entry = { start: START, createdAt, preheatMaxMin: PREHEAT_MAX, rows: [confirmation('pending'), keybox('pending')] };
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

	it('lists a refused urgent row as a refusal only once a newer heat row was cancelled (Story 2.5)', () => {
		// The newer change was cancelled at recheck (taken back) or by the keybox claim (the keybox email counts).
		for (const urgent of [true, false, null]) {
			const entry = early([confirmation(), keybox('accepted'), heat(3, 'refused', true), heat(4, 'cancelled', urgent)]);
			expect(sendProblems(entry, addMinutes(CUTOFF, 30))).toEqual({
				callRequired: [],
				refusals: [{ rowId: 3, kind: 'heat_change' }]
			});
		}
	});

	it('supersedes a refused urgent row by a newer accepted good-news row (Story 2.5 matrix: superseded)', () => {
		const entry = early([confirmation(), keybox('pending'), heat(3, 'refused', true), heat(4, 'accepted', false)]);
		expect(sendProblems(entry, '2027-01-08T10:00:00Z')).toEqual({
			callRequired: [],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
		});
	});

	it('supersedes an urgent row by a newer open good-news row, even past the warning window', () => {
		const entry = early([confirmation(), heat(3, 'refused', true), heat(4, 'pending', false)]);
		expect(sendProblems(entry, addMinutes(START, -30))).toEqual({
			callRequired: [],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
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

	it('opens the urgent warning window 20 minutes before the earliest possible arrival', () => {
		// Default 30–40 pre-heat: 17:00 Zurich for an 18:00 start; a 90-minute pre-heat: 16:10.
		expect(warningOverdueAt(START, 40)).toBe('2027-01-12T16:00:00Z');
		expect(warningOverdueAt(START, 90)).toBe('2027-01-12T15:10:00Z');
	});

	it('moves the overdue time with a 90-minute pre-heat maximum to 16:10', () => {
		const entry = early([confirmation(), heat(3, 'pending', true)], 90);
		expect(sendProblems(entry, '2027-01-12T15:09:00Z')).toEqual(NONE);
		expect(sendProblems(entry, '2027-01-12T15:10:00Z').callRequired).toEqual([{ rowId: 3, reason: 'warning_overdue' }]);
	});

	it('makes an urgent change enqueued inside the window call required at once, before its settle delay', () => {
		// Enqueued at 17:30 Zurich, due 17:40 after the settle delay: phoned right away.
		const entry = early([confirmation(), heat(3, 'pending', true)]);
		expect(sendProblems(entry, '2027-01-12T16:30:00Z').callRequired).toEqual([{ rowId: 3, reason: 'warning_overdue' }]);
	});

	it('still calls through keybox_refused when an older urgent row was refused and the newer one cancelled by the keybox claim', () => {
		const entry = early([confirmation(), heat(3, 'refused', true), heat(4, 'cancelled', true), keybox('refused')]);
		expect(sendProblems(entry, addMinutes(CUTOFF, 30))).toEqual({
			callRequired: [{ rowId: 2, reason: 'keybox_refused' }],
			refusals: [{ rowId: 3, kind: 'heat_change' }]
		});
	});

	it.each(['pending', 'in_flight', 'transient_failure'] as const)(
		'reports a %s urgent row from 60 minutes before the start, nothing at 61 (Story 2.5 matrix: overdue)',
		(state) => {
			// No keybox row, to isolate the rule: in the app a held keybox row is overdue by then too.
			const entry = early([confirmation(), heat(3, state, true)]);
			// 16:59 and 17:00 Zurich for an 18:00 start.
			expect(sendProblems(entry, '2027-01-12T15:59:00Z')).toEqual(NONE);
			expect(sendProblems(entry, '2027-01-12T16:00:00Z')).toEqual({
				callRequired: [{ rowId: 3, reason: 'warning_overdue' }],
				refusals: []
			});
		}
	);

	it('reports an overdue warning next to an overdue keybox row', () => {
		const late: SendProblemEntry = {
			start: START,
			createdAt: '2027-01-12T15:30:00Z',
			preheatMaxMin: PREHEAT_MAX,
			rows: [keybox('pending'), heat(3, 'pending', true)]
		};
		expect(sendProblems(late, addMinutes(START, -5)).callRequired).toEqual([
			{ rowId: 2, reason: 'keybox_overdue' },
			{ rowId: 3, reason: 'warning_overdue' }
		]);
	});

	it('never reports an open good-news row or an open row of unknown urgency as overdue', () => {
		for (const urgent of [false, null]) {
			expect(sendProblems(early([confirmation(), heat(3, 'pending', urgent)]), addMinutes(START, -10))).toEqual(NONE);
		}
	});

	it('raises nothing for an overdue urgent row once it is resolved', () => {
		const entry = early([confirmation(), heat(3, 'transient_failure', true, { resolvedAt: '2027-01-12T16:05:00Z' })]);
		expect(sendProblems(entry, addMinutes(START, -10))).toEqual(NONE);
	});

	it('counts an unclaimed expired heat row (urgent null) as not urgent', () => {
		expect(sendProblems(early([confirmation(), keybox('accepted'), heat(3, 'expired', null)]), START)).toEqual(NONE);
	});
});

describe('sendProblems: ordering', () => {
	it('orders callRequired and refusals by row id, whatever the row order', () => {
		const entry = early([
			heat(7, 'refused', true),
			heat(5, 'refused', false),
			r(2, 'keybox', 'refused'),
			heat(6, 'refused', true),
			confirmation('refused')
		]);
		expect(sendProblems(entry, START)).toEqual({
			callRequired: [
				{ rowId: 2, reason: 'keybox_refused' },
				{ rowId: 7, reason: 'warning_refused' }
			],
			refusals: [
				{ rowId: 1, kind: 'confirmation' },
				{ rowId: 5, kind: 'heat_change' },
				{ rowId: 6, kind: 'heat_change' }
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
	const at = (start: Instant, rows: SendProblemRow[]): SendProblemEntry => ({ start, createdAt: BOOKED_EARLY, preheatMaxMin: PREHEAT_MAX, rows });
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

// Story 3.1 matrix, "Call (a)", "Call none", "Call merge", "Call order/drop". Now is Tue 12 Jan 10:00 Zurich.
describe('deriveCallList', () => {
	const NOW: Instant = '2027-01-12T09:00:00Z';
	const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
	const COLD: Notice = { heat: 'cold', earliest: '2027-01-12T16:20:00Z', latest: '2027-01-12T16:30:00Z' };
	const feedEntry = (rows: SendProblemRow[], lastTold: Notice | null, current: Notice | null, start = START): CallFeedEntry => ({
		start,
		createdAt: BOOKED_EARLY,
		preheatMaxMin: PREHEAT_MAX,
		rows,
		lastTold,
		current
	});
	const one = (entry: CallFeedEntry) => deriveCallList(new Map([[7, entry]]), NOW);

	it('makes a hot → cold change in the keybox phase call required', () => {
		expect(one(feedEntry([confirmation(), keybox('accepted')], HOT, COLD))).toEqual([
			{ bookingId: 7, start: START, marker: 'call_required', reasons: [], heatChange: 'urgent' }
		]);
	});

	it('makes a cold → hot change in the keybox phase optional', () => {
		expect(one(feedEntry([confirmation(), keybox('accepted')], COLD, HOT))).toEqual([
			{ bookingId: 7, start: START, marker: 'optional', reasons: [], heatChange: 'good_news' }
		]);
	});

	it.each(['refused', 'expired'] as const)('counts a %s keybox row as the keybox phase', (state) => {
		expect(keyboxPhaseHeatChange(feedEntry([keybox(state)], HOT, COLD))).toBe('urgent');
	});

	it.each(['pending', 'in_flight', 'transient_failure', 'cancelled'] as const)(
		'gives no trigger (a) entry for a %s keybox row with a change',
		(state) => {
			expect(keyboxPhaseHeatChange(feedEntry([confirmation(), keybox(state)], HOT, COLD))).toBe('none');
		}
	);

	// Thursday 18:00: its keybox row is due on Wednesday, so it is not overdue yet.
	const THURSDAY = '2027-01-14T17:00:00Z';

	it('gives no entry for a pending keybox row with a change (Call none)', () => {
		expect(one(feedEntry([confirmation(), keybox('pending')], HOT, COLD, THURSDAY))).toEqual([]);
	});

	it('gives no entry once the notice is back to the last-told one (Call none)', () => {
		expect(one(feedEntry([confirmation(), keybox('accepted')], COLD, { ...COLD }))).toEqual([]);
	});

	it('gives no trigger (a) entry without a keybox row or without notices', () => {
		expect(one(feedEntry([confirmation()], HOT, COLD))).toEqual([]);
		expect(one(feedEntry([keybox('accepted')], null, COLD))).toEqual([]);
		expect(one(feedEntry([keybox('accepted')], HOT, null))).toEqual([]);
	});

	it('reads the latest keybox row by id', () => {
		const rows = [r(5, 'keybox', 'pending'), r(2, 'keybox', 'accepted')];
		expect(keyboxPhaseHeatChange(feedEntry(rows, HOT, COLD))).toBe('none');
	});

	it('merges good news with keybox_refused into one call-required entry with the reason (Call merge)', () => {
		expect(one(feedEntry([confirmation(), keybox('refused')], COLD, HOT))).toEqual([
			{ bookingId: 7, start: START, marker: 'call_required', reasons: ['keybox_refused'], heatChange: 'good_news' }
		]);
	});

	it('gives a trigger (b) entry without a heat change', () => {
		expect(deriveCallList(new Map([[7, feedEntry([confirmation(), keybox('refused')], HOT, HOT)]]), NOW)).toEqual([
			{ bookingId: 7, start: START, marker: 'call_required', reasons: ['keybox_refused'], heatChange: 'none' }
		]);
	});

	it('leaves out bookings with only non-urgent refusals', () => {
		expect(one(feedEntry([confirmation('refused'), keybox('pending')], HOT, HOT, THURSDAY))).toEqual([]);
	});

	it('puts call required first, then orders by start, and drops started bookings (Call order/drop)', () => {
		const at1800 = '2027-01-12T17:00:00Z';
		const at1900 = '2027-01-12T18:00:00Z';
		const feed = new Map<number, CallFeedEntry>([
			[1, feedEntry([keybox('accepted')], COLD, HOT, at1800)],
			[2, feedEntry([keybox('accepted')], HOT, COLD, at1900)],
			[3, feedEntry([keybox('accepted')], HOT, COLD, '2027-01-12T09:00:00Z')],
			[4, feedEntry([keybox('refused')], HOT, COLD, '2027-01-12T08:00:00Z')],
			[5, feedEntry([keybox('accepted')], COLD, HOT, at1900)],
			[6, feedEntry([keybox('accepted')], HOT, COLD, at1800)]
		]);
		expect(deriveCallList(feed, NOW).map((e) => [e.bookingId, e.marker])).toEqual([
			[6, 'call_required'],
			[2, 'call_required'],
			[1, 'optional'],
			[5, 'optional']
		]);
	});

	it('is empty for an empty feed', () => {
		expect(deriveCallList(new Map(), NOW)).toEqual([]);
	});
});
