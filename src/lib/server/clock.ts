// The one clock (AD-1, AD-9). Everything else takes `now` as a parameter.
import type { Instant } from '#lib/time/index.ts';
import { getEnv } from './env.ts';

/** The current instant as canonical text, or DEV_NOW in development when it is set. */
export function now(): Instant {
	return getEnv().devNow ?? Temporal.Now.instant().toString({ smallestUnit: 'second' });
}
