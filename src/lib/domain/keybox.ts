// Keybox phase (PRD §4 Glossary; AD-9). The keybox email goes out 24 hours of real time before the
// start. The confirmation names that time; the keybox outbox row is due at it (Story 2.2).
// Pure: every input, including the instant to judge, is a parameter.
import { addMinutes, compareInstants, type Instant, type Locale } from '#lib/time/index.ts';
import type { OutboxState } from './outbox.ts';

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

/**
 * When a keybox row is due: the cutoff, or `now` when the booking is made past it (the drain order
 * then sends the confirmation first).
 */
export function keyboxDueAt(start: Instant, now: Instant): Instant {
	const cutoff = keyboxCutoff(start);
	return compareInstants(now, cutoff) > 0 ? now : cutoff;
}

/** The keybox settings: the code and the instructions per locale. Blank counts as unset. */
export type KeyboxSettings = {
	code: string | null;
	instructions: Record<Locale, string | null>;
};

export type KeyboxSettingName = 'keybox_code' | 'keybox_instructions_de' | 'keybox_instructions_en';

/** The instructions setting per locale: a new locale fails to compile until it has its own column. */
const INSTRUCTIONS_SETTING: Record<Locale, KeyboxSettingName> = {
	de: 'keybox_instructions_de',
	en: 'keybox_instructions_en'
};

const blank = (value: string | null) => value === null || value.trim() === '';

/**
 * The first setting a keybox email in `locale` cannot go out without, or null when it can: the
 * code, then the instructions in the booking's language. A row missing one is held, not claimed.
 */
export function missingKeyboxSetting(settings: KeyboxSettings, locale: Locale): KeyboxSettingName | null {
	if (blank(settings.code)) return 'keybox_code';
	if (blank(settings.instructions[locale])) return INSTRUCTIONS_SETTING[locale];
	return null;
}

/**
 * True once the keybox row has finished: `accepted`, `refused` or `expired`. From then on the
 * keybox email is what counts; no heat-change email goes out (see `endsHeatChangeMail`).
 */
export function isKeyboxPhase(state: OutboxState): boolean {
	return state === 'accepted' || state === 'refused' || state === 'expired';
}

/**
 * True when a keybox row in `state` ends heat-change mail for its booking (Story 2.3): once it is
 * `in_flight` or has finished, nothing is upserted and open heat-change rows are cancelled.
 */
export function endsHeatChangeMail(state: OutboxState): boolean {
	return state === 'in_flight' || isKeyboxPhase(state);
}
