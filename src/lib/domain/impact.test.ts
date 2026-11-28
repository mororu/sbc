// Story 3.3: the impact core. Tue 12 Jan 2027 (UTC+1), changeover 15, pre-heat 30–40: Anna
// 16:00–17:00 is deleted, Tom 17:15–18:15 is behind her.
import { describe, expect, it } from 'vitest';
import { addMinutes, toInstant, type Instant } from '#lib/time/index.ts';
import type { Block, Booking } from './heat.ts';
import { impactOn, impactToken, type ImpactInput } from './impact.ts';
import { keyboxOverdueAt } from './keybox.ts';
import type { Notice } from './notice.ts';
import { OUTBOX_STATE_LIST } from './outbox.ts';

const at = (hhmm: string): Instant => {
	const [h, m] = hhmm.split(':').map(Number);
	return toInstant('2027-01-12', h * 60 + m);
};
const HOT: Notice = { heat: 'hot', earliest: null, latest: null };
const COLD_TOM: Notice = { heat: 'cold', earliest: at('16:35'), latest: at('16:45') };
const tom: Booking = { id: 2, start: at('17:15'), durationMin: 60, changeoverMin: 15, createdAt: '2027-01-07T10:00:00Z' };
const anna: Booking = { id: 1, start: at('16:00'), durationMin: 60, changeoverMin: 15, createdAt: '2027-01-07T09:00:00Z' };

/** Mon 11 Jan, 13:00 Zurich: before Tom's keybox row is due (17:15) or overdue (17:30). */
const NOW: Instant = '2027-01-11T12:00:00Z';
/** Tom's keybox row: due at the cutoff, Mon 11 Jan 17:15 Zurich; overdue 15 minutes later. */
const OVERDUE: Instant = '2027-01-11T16:30:00Z';

const input = (over: Partial<ImpactInput> = {}): ImpactInput => ({
	affected: tom,
	bookings: [tom],
	blocks: [],
	preheat: { minMin: 30, maxMin: 40 },
	told: HOT,
	keyboxState: 'pending',
	now: NOW,
	...over
});

describe('impactOn', () => {
	it('is a mail while the keybox row is pending: hot → cold is urgent', () => {
		expect(impactOn(input())).toEqual({ affected: tom, told: HOT, current: COLD_TOM, class: 'urgent', consequence: 'mail' });
	});

	it('is a mail without a keybox row, or with a cancelled one', () => {
		expect(impactOn(input({ keyboxState: null })).consequence).toBe('mail');
		expect(impactOn(input({ keyboxState: 'cancelled' })).consequence).toBe('mail');
	});

	it.each(['in_flight', 'accepted', 'refused', 'expired'] as const)('is a call once the keybox row is %s', (keyboxState) => {
		expect(impactOn(input({ keyboxState }))).toMatchObject({ class: 'urgent', consequence: 'call' });
	});

	it('is a mail while the keybox email is retrying: the retry carries the new notice (retro D4)', () => {
		expect(impactOn(input({ keyboxState: 'transient_failure' }))).toMatchObject({ class: 'urgent', consequence: 'mail' });
	});

	it('is a call for a retrying keybox email from its overdue time on, like the call list (C4 overdue)', () => {
		expect(keyboxOverdueAt(tom.start, tom.createdAt)).toBe(OVERDUE);
		const at = (now: Instant) => impactOn(input({ keyboxState: 'transient_failure', now })).consequence;
		expect(at(addMinutes(OVERDUE, -1))).toBe('mail');
		expect(at(OVERDUE)).toBe('call');
		expect(at(addMinutes(OVERDUE, 30))).toBe('call');
	});

	it('changes the token when the overdue time passes: the confirm then finds the impact stale', () => {
		const before = impactToken(impactOn(input({ keyboxState: 'transient_failure', now: addMinutes(OVERDUE, -1) })));
		expect(impactToken(impactOn(input({ keyboxState: 'transient_failure', now: OVERDUE })))).not.toBe(before);
	});

	it('covers every outbox state: pending, cancelled, a retry and none get a mail', () => {
		const mail = OUTBOX_STATE_LIST.filter((s) => impactOn(input({ keyboxState: s })).consequence === 'mail');
		expect(mail.sort()).toEqual(['cancelled', 'pending', 'transient_failure']);
	});

	it('is good news when the change makes a cold-told booking hot', () => {
		// Told cold; after the change (here: a booking 16:00–17:00 back to back) it is hot.
		const result = impactOn(input({ told: COLD_TOM, bookings: [anna, tom], keyboxState: 'accepted' }));
		expect(result).toMatchObject({ current: HOT, class: 'good_news', consequence: 'call' });
	});

	it('has no effect without an affected booking, without a told notice, or when nothing worth telling changed', () => {
		expect(impactOn(input({ affected: null }))).toEqual({ affected: null, told: null, current: null, class: 'none', consequence: 'none' });
		expect(impactOn(input({ told: null }))).toMatchObject({ current: COLD_TOM, class: 'none', consequence: 'none' });
		expect(impactOn(input({ told: COLD_TOM }))).toMatchObject({ class: 'none', consequence: 'none' });
	});

	it('counts the blocks after the change: a block in between keeps a cold notice cold', () => {
		const block: Block = { start: at('16:30'), end: at('16:40') };
		// Told cold 16:35–16:45; a block ending 16:40 moves the earliest arrival later: urgent.
		expect(impactOn(input({ told: COLD_TOM, blocks: [block] }))).toMatchObject({
			current: { heat: 'cold', earliest: at('16:40'), latest: at('16:45') },
			class: 'urgent',
			consequence: 'mail'
		});
	});
});

describe('impactToken', () => {
	it('is the same for the same impact and differs when any shown value differs', () => {
		const base = impactToken(impactOn(input()));
		expect(impactToken(impactOn(input()))).toBe(base);
		const others = [
			input({ keyboxState: 'accepted' }),
			input({ told: COLD_TOM }),
			input({ preheat: { minMin: 30, maxMin: 45 } }),
			input({ blocks: [{ start: at('16:30'), end: at('16:40') }] }),
			input({ affected: { ...tom, id: 3 } }),
			input({ affected: null })
		].map((i) => impactToken(impactOn(i)));
		for (const token of others) expect(token).not.toBe(base);
		expect(new Set(others).size).toBe(others.length);
	});
});
