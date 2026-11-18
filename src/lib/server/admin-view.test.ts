// Story 3.1 matrix, "Health": the admin home's worker warning at Tue 12 Jan 2027, 10:00 Zurich.
import { describe, expect, it } from 'vitest';
import { workerWarning } from './admin-view.ts';

const NOW = '2027-01-12T09:00:00Z';

describe('workerWarning', () => {
	it('says the worker is not running, without a time, before any heartbeat', () => {
		expect(workerWarning(null, NOW, 'de')).toBe('Der Versand läuft nicht.');
		expect(workerWarning(null, NOW, 'en')).toBe("Sending isn't running.");
	});

	it('names the last tick of a stale heartbeat as a clock time', () => {
		const beat = { beatAt: '2027-01-12T08:55:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit 09:55 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since 09:55.");
	});

	it('adds the date for a tick on an earlier day', () => {
		const beat = { beatAt: '2027-01-11T21:30:00Z', failingSince: null };
		expect(workerWarning(beat, NOW, 'de')).toBe('Der Versand läuft seit Mo 11. Januar, 22:30 nicht.');
		expect(workerWarning(beat, NOW, 'en')).toBe("Sending hasn't run since Mon 11 January, 22:30.");
	});

	it('names when sends started failing while the worker ticks', () => {
		const beat = { beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:45:00Z' };
		expect(workerWarning(beat, NOW, 'de')).toBe('Seit 09:45 geht keine Mail raus. Der Versand versucht es weiter.');
		expect(workerWarning(beat, NOW, 'en')).toBe('No email has gone out since 09:45. Sending keeps trying.');
	});

	it('shows nothing while the worker is healthy', () => {
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: null }, NOW, 'de')).toBeNull();
		// Failing for less than 15 minutes is still ok.
		expect(workerWarning({ beatAt: '2027-01-12T08:59:00Z', failingSince: '2027-01-12T08:50:00Z' }, NOW, 'de')).toBeNull();
	});
});
