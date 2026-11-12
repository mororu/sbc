// heat.ts helpers not covered through start-times.test.ts (freeHeat, bookingHeat, bookingEnd are).
import { describe, expect, it } from 'vitest';
import { live, type Booking } from './heat.ts';

const booking = (id: number, deletedAt?: string | null): Booking => ({
	id,
	start: '2027-01-12T16:00:00Z',
	durationMin: 60,
	changeoverMin: 15,
	createdAt: '2027-01-01T10:00:00Z',
	deletedAt
});

describe('live', () => {
	it('drops deleted bookings and keeps the order of the rest', () => {
		const kept = [booking(1), booking(3, null)];
		expect(live([kept[0], booking(2, '2027-01-02T10:00:00Z'), kept[1]])).toEqual(kept);
	});
});
