// Story 2.5 matrix (outage, recovery, dead worker): worker health at an explicit `now`.
import { describe, expect, it } from 'vitest';
import { workerHealth } from './worker-health.ts';

const T = (hhmm: string) => `2027-01-10T${hhmm}:00Z`;

describe('workerHealth', () => {
	it('is stale without a heartbeat row', () => {
		expect(workerHealth(null, T('10:00'))).toBe('stale');
	});

	it('is stale once the last tick is 5 minutes old, ok at 4', () => {
		expect(workerHealth({ beatAt: T('10:00'), failingSince: null }, T('10:04'))).toBe('ok');
		expect(workerHealth({ beatAt: T('10:00'), failingSince: null }, T('10:05'))).toBe('stale');
	});

	it('is failing once sends have failed for 15 minutes while the beat stays fresh, ok at 14', () => {
		expect(workerHealth({ beatAt: T('10:14'), failingSince: T('10:00') }, T('10:14'))).toBe('ok');
		expect(workerHealth({ beatAt: T('10:15'), failingSince: T('10:00') }, T('10:15'))).toBe('failing');
	});

	it('is ok again once an accepted send cleared failing_since', () => {
		expect(workerHealth({ beatAt: T('10:20'), failingSince: null }, T('10:20'))).toBe('ok');
	});

	it('says stale, not failing, when both hold', () => {
		expect(workerHealth({ beatAt: T('10:00'), failingSince: T('09:00') }, T('10:30'))).toBe('stale');
	});
});
