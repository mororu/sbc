// Story 3.1 matrix, "Limit": 5 wrong passwords 10:00:00–10:00:20 (Zurich, 12 Jan 2027); a try at
// 10:00:30 is refused until 10:01:20, a try at 10:01:20 is checked. Records expire after 15 minutes.
import { describe, expect, it } from 'vitest';
import {
	isRecordExpired,
	pruneSignInRecords,
	recordSignInFailure,
	signInGate,
	type SignInRecord
} from './sign-in-limit.ts';

const at = (mmss: string) => `2027-01-12T09:${mmss}Z`;

const failures = (times: string[]) =>
	times.reduce<SignInRecord | undefined>((record, t) => recordSignInFailure(record, at(t)), undefined);

describe('signInGate', () => {
	it('allows a first try and up to the 5th failure without waiting', () => {
		expect(signInGate(undefined, at('00:00'))).toEqual({ allowed: true });
		expect(signInGate(failures(['00:00', '00:05', '00:10', '00:15']), at('00:16'))).toEqual({ allowed: true });
	});

	it('refuses a try 10 s after the 5th failure until 60 s after it, then allows one', () => {
		const record = failures(['00:00', '00:05', '00:10', '00:15', '00:20']);
		expect(record).toEqual({ failures: 5, lastFailureAt: at('00:20') });
		expect(signInGate(record, at('00:30'))).toEqual({ allowed: false, retryAt: at('01:20') });
		expect(signInGate(record, at('01:19'))).toEqual({ allowed: false, retryAt: at('01:20') });
		expect(signInGate(record, at('01:20'))).toEqual({ allowed: true });
	});

	it('keeps one try per minute after the 6th failure', () => {
		const record = recordSignInFailure(failures(['00:00', '00:05', '00:10', '00:15', '00:20']), at('01:20'));
		expect(record.failures).toBe(6);
		expect(signInGate(record, at('01:50'))).toEqual({ allowed: false, retryAt: at('02:20') });
		expect(signInGate(record, at('02:20'))).toEqual({ allowed: true });
	});
});

describe('record expiry', () => {
	const record = failures(['00:00', '00:05', '00:10', '00:15', '00:20']);

	it('expires 15 minutes after the last failure', () => {
		expect(isRecordExpired(record!, at('15:19'))).toBe(false);
		expect(isRecordExpired(record!, at('15:20'))).toBe(true);
	});

	it('restarts the count after an expired record', () => {
		expect(recordSignInFailure(record, '2027-01-12T09:15:20Z')).toEqual({ failures: 1, lastFailureAt: '2027-01-12T09:15:20Z' });
	});

	it('prunes only the expired records', () => {
		const records = new Map<string, SignInRecord>([
			['a', record!],
			['b', { failures: 2, lastFailureAt: at('10:00') }]
		]);
		pruneSignInRecords(records, at('15:20'));
		expect([...records.keys()]).toEqual(['b']);
	});
});
