// Keybox phase (PRD §4 Glossary; AD-9). The keybox email goes out 24 hours of real time before the
// start. The confirmation names that time; the outbox planned for Epic 2 is to send at it.
// Pure: every input, including the instant to judge, is a parameter.
import { addMinutes, compareInstants, type Instant } from '#lib/time/index.ts';

/** How long before the start the keybox code goes out: 24 hours of real time. */
export const KEYBOX_LEAD_MIN = 24 * 60;

/** The instant the keybox code goes out: the start minus 24 hours of real time (not wall clock). */
export function keyboxCutoff(start: Instant): Instant {
	return addMinutes(start, -KEYBOX_LEAD_MIN);
}

/** True when `at` is at or after the keybox cutoff of `start`. */
export function isPastKeyboxCutoff(start: Instant, at: Instant): boolean {
	return compareInstants(at, keyboxCutoff(start)) >= 0;
}
