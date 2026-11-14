import { describe, expect, it } from 'vitest';
import { IN_FLIGHT_TIMEOUT_MIN, isStale, KIND_ORDER, retryAt } from './outbox.ts';

const NOW = '2027-01-12T08:00:00Z';

describe('KIND_ORDER', () => {
	it('drains the confirmation first, then the keybox, then a heat change', () => {
		expect([...KIND_ORDER]).toEqual(['confirmation', 'keybox', 'heat_change']);
	});
});

describe('retryAt', () => {
	it.each([
		[1, '2027-01-12T08:01:00Z'],
		[2, '2027-01-12T08:02:00Z'],
		[3, '2027-01-12T08:05:00Z'],
		[4, '2027-01-12T08:10:00Z'],
		[5, '2027-01-12T08:15:00Z'],
		[12, '2027-01-12T08:15:00Z']
	])('after %i attempts waits until %s', (attempts, expected) => {
		expect(retryAt(attempts, NOW)).toBe(expected);
	});

	it('treats zero attempts like the first', () => {
		expect(retryAt(0, NOW)).toBe('2027-01-12T08:01:00Z');
	});

	it('counts real minutes across the DST switch', () => {
		// 28 Mar 2027 02:00 → 03:00 in Zurich; instants are UTC, so 15 min stay 15 min.
		expect(retryAt(9, '2027-03-28T00:55:00Z')).toBe('2027-03-28T01:10:00Z');
	});
});

describe('isStale', () => {
	it('is stale from the timeout on', () => {
		expect(IN_FLIGHT_TIMEOUT_MIN).toBe(10);
		expect(isStale('2027-01-12T07:50:00Z', NOW)).toBe(true);
		expect(isStale('2027-01-12T07:40:00Z', NOW)).toBe(true);
	});

	it('is not stale before the timeout', () => {
		expect(isStale('2027-01-12T07:50:01Z', NOW)).toBe(false);
		expect(isStale(NOW, NOW)).toBe(false);
	});
});
