// The settings card schemas (AD-16; FR-15, FR-20; Story 3.7): one Valibot schema per card on
// `/admin/settings`, shared by the client and the actions. Error messages are i18n message keys,
// the copy from EXPERIENCE "Settings validation errors". Every card validates and saves alone:
// hours (`open`, `close`: `HH:MM` on 5-minute steps, close after open; a close of 00:00 is midnight
// at the end of the day, 1440), changeover (0–60 in steps
// of 5), horizon (1–60), pre-heat (`min`, `max`: 15–90 in steps of 5, min ≤ max, the swap error on
// `min`), instructions (`de`, `en`: trimmed, line breaks as LF, required, at most 4000 UTF-16 code
// units, as the textarea's `maxlength` counts them), contact (the
// booking form's email rules, its own error text) and password (`validateNewPassword`). A password
// is never trimmed and never part of `values`. Story 3.8 adds season (`start`, `end`: real
// `yyyy-mm-dd` dates, end after start, the order error on `end`; an optional hidden `id`, a positive
// integer of at most 9 digits) and keybox (`code`: trimmed, required, at most 32 characters, no line
// break). Imports nothing from the app (the date check is
// the block form's `isCalendarDate`, as `#lib/time` may not be imported here).
import * as v from 'valibot';
import { validateNewPassword } from './admin.ts';
import { isCalendarDate } from './block.ts';
import { emailSchema } from './booking.ts';

export const SETTINGS_CARDS = ['season', 'hours', 'changeover', 'horizon', 'preheat', 'keybox', 'instructions', 'contact', 'password'] as const;
export type SettingsCard = (typeof SETTINGS_CARDS)[number];

/** The posted fields of each card, in form order. */
export const SETTINGS_FIELDS = {
	season: ['start', 'end', 'id'],
	hours: ['open', 'close'],
	changeover: ['minutes'],
	horizon: ['days'],
	preheat: ['min', 'max'],
	keybox: ['code'],
	instructions: ['de', 'en'],
	contact: ['email'],
	password: ['password']
} as const satisfies Record<SettingsCard, readonly string[]>;

export type SettingsField<C extends SettingsCard> = (typeof SETTINGS_FIELDS)[C][number];

/** The allowed ranges (FR-20); the db CHECKs agree. */
export const CHANGEOVER_RANGE = { min: 0, max: 60, step: 5 } as const;
export const HORIZON_RANGE = { min: 1, max: 60, step: 1 } as const;
export const PREHEAT_RANGE = { min: 15, max: 90, step: 5 } as const;
/** Operating hours are `HH:MM` on this step. */
export const HOURS_STEP_MIN = 5;
/** The longest keybox code, after trimming; it holds no line break. */
export const KEYBOX_CODE_MAX = 32;
/** The longest access instructions, per locale: UTF-16 code units after CRLF → LF, as `maxlength` counts. */
export const INSTRUCTIONS_MAX = 4000;

/** Message keys in messages/*.json. */
export type SettingsErrorKey =
	| 'field_required'
	| 'block_date_invalid'
	| 'block_time_step'
	| 'settings_season_order'
	| 'settings_season_overlap'
	| 'settings_season_end_past'
	| 'settings_season_start_past'
	| 'settings_keybox_invalid'
	| 'settings_hours_order'
	| 'settings_changeover_range'
	| 'settings_horizon_range'
	| 'settings_preheat_range'
	| 'settings_preheat_swapped'
	| 'settings_instructions_too_long'
	| 'settings_contact_invalid'
	| 'admin_password_too_short'
	| 'admin_password_too_long';

export const SETTINGS_ERROR_KEYS: readonly SettingsErrorKey[] = [
	'field_required',
	'block_date_invalid',
	'block_time_step',
	'settings_season_order',
	'settings_season_overlap',
	'settings_season_end_past',
	'settings_season_start_past',
	'settings_keybox_invalid',
	'settings_hours_order',
	'settings_changeover_range',
	'settings_horizon_range',
	'settings_preheat_range',
	'settings_preheat_swapped',
	'settings_instructions_too_long',
	'settings_contact_invalid',
	'admin_password_too_short',
	'admin_password_too_long'
];

export type SettingsErrors = Partial<Record<string, SettingsErrorKey>>;
/** The typed values of a card, kept on an error (strings as posted; never the password). */
export type SettingsValues = Record<string, string>;

/** The parsed value of each card. */
export type SettingsInput = {
	/** `id` null: create the next season. Dates `yyyy-mm-dd`, end after start. */
	season: { id: number | null; startDate: string; endDate: string };
	hours: { openMinute: number; closeMinute: number };
	changeover: { changeoverMin: number };
	horizon: { horizonDays: number };
	preheat: { minMin: number; maxMin: number };
	keybox: { code: string };
	instructions: { de: string; en: string };
	contact: { contact: string };
	password: { password: string };
};

export type SettingsParse<C extends SettingsCard> =
	| { ok: true; value: SettingsInput[C] }
	| { ok: false; errors: SettingsErrors };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after local midnight of an `HH:MM` value. */
const minutes = (time: string) => {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
};

/** Midnight at the end of the day: a stored close of 1440 is shown and posted as "00:00". */
export const END_OF_DAY_MIN = 1440;

/** `HH:MM` for minutes after local midnight (prefill of the hours card); 1440 is "00:00". */
export function hhmm(minuteOfDay: number): string {
	minuteOfDay %= END_OF_DAY_MIN;
	const h = Math.floor(minuteOfDay / 60);
	const m = minuteOfDay % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const required = () => v.pipe(v.string('field_required'), v.trim(), v.nonEmpty('field_required'));

const time = () =>
	v.pipe(
		required(),
		v.regex(TIME, 'block_time_step'),
		v.check((value) => minutes(value) % HOURS_STEP_MIN === 0, 'block_time_step'),
		v.transform(minutes)
	);

/** A whole number in a range on a step, posted as text; anything else is `key`. */
const wholeNumber = (range: { min: number; max: number; step: number }, key: SettingsErrorKey) =>
	v.pipe(
		required(),
		v.regex(/^\d{1,3}$/, key),
		v.transform(Number),
		v.check((n) => n >= range.min && n <= range.max && (n - range.min) % range.step === 0, key)
	);

const instructions = () =>
	v.pipe(
		required(),
		// Browsers post line breaks as CRLF; `maxlength` counts them as one.
		v.transform((value) => value.replace(/\r\n?/g, '\n')),
		v.check((value) => value.length <= INSTRUCTIONS_MAX, 'settings_instructions_too_long')
	);

const date = () => v.pipe(required(), v.check(isCalendarDate, 'block_date_invalid'));

/** A season row id: a positive integer as text, or empty for none. */
const SEASON_ID = /^[1-9]\d{0,8}$/;

const schemas = {
	season: v.pipe(
		v.object({
			start: date(),
			end: date(),
			id: v.pipe(v.string(), v.trim(), v.check((id) => id === '' || SEASON_ID.test(id), 'field_required'))
		}),
		// `yyyy-mm-dd` compares as text.
		v.forward(
			v.check((value) => value.end > value.start, 'settings_season_order'),
			['end']
		),
		v.transform((value) => ({ id: value.id === '' ? null : Number(value.id), startDate: value.start, endDate: value.end }))
	),
	hours: v.pipe(
		v.object({ open: time(), close: time() }),
		// "Bis" 00:00 is midnight at the end of the day, after any "Von".
		v.transform((value) => ({ open: value.open, close: value.close === 0 ? END_OF_DAY_MIN : value.close })),
		v.forward(
			v.check((value) => value.close > value.open, 'settings_hours_order'),
			['close']
		),
		v.transform((value) => ({ openMinute: value.open, closeMinute: value.close }))
	),
	changeover: v.pipe(
		v.object({ minutes: wholeNumber(CHANGEOVER_RANGE, 'settings_changeover_range') }),
		v.transform((value) => ({ changeoverMin: value.minutes }))
	),
	horizon: v.pipe(
		v.object({ days: wholeNumber(HORIZON_RANGE, 'settings_horizon_range') }),
		v.transform((value) => ({ horizonDays: value.days }))
	),
	preheat: v.pipe(
		v.object({ min: wholeNumber(PREHEAT_RANGE, 'settings_preheat_range'), max: wholeNumber(PREHEAT_RANGE, 'settings_preheat_range') }),
		v.forward(
			v.check((value) => value.min <= value.max, 'settings_preheat_swapped'),
			['min']
		),
		v.transform((value) => ({ minMin: value.min, maxMin: value.max }))
	),
	keybox: v.object({
		code: v.pipe(
			required(),
			v.check((code) => code.length <= KEYBOX_CODE_MAX && !/[\r\n]/.test(code), 'settings_keybox_invalid')
		)
	}),
	instructions: v.object({ de: instructions(), en: instructions() }),
	contact: v.pipe(
		v.object({ email: emailSchema }),
		v.transform((value) => ({ contact: value.email }))
	)
};

/** The posted values of a card as strings, missing ones empty. The password card keeps none. */
export function settingsValues(card: SettingsCard, values: Record<string, unknown>): SettingsValues {
	if (card === 'password') return {};
	const out: SettingsValues = {};
	for (const field of SETTINGS_FIELDS[card]) out[field] = typeof values[field] === 'string' ? (values[field] as string) : '';
	return out;
}

/** The message key for a schema message: the booking form's email errors become the contact's own. */
function keyOf(card: SettingsCard, message: string): SettingsErrorKey {
	if (card === 'contact' && message !== 'field_required') return 'settings_contact_invalid';
	return (SETTINGS_ERROR_KEYS as readonly string[]).includes(message) ? (message as SettingsErrorKey) : 'field_required';
}

/** Parses one card; errors hold the first problem of each field, in form order. */
export function parseSettingsCard<C extends SettingsCard>(card: C, values: Record<string, unknown>): SettingsParse<C> {
	if (card === 'password') {
		const password = typeof values.password === 'string' ? values.password : '';
		if (password === '') return { ok: false, errors: { password: 'field_required' } };
		const problem = validateNewPassword(password);
		if (problem) return { ok: false, errors: { password: `admin_${problem}` as SettingsErrorKey } };
		return { ok: true, value: { password } as SettingsInput[C] };
	}
	const schema = schemas[card as Exclude<SettingsCard, 'password'>];
	const result = v.safeParse(schema, settingsValues(card, values), { abortPipeEarly: true });
	if (result.success) return { ok: true, value: result.output as SettingsInput[C] };
	const fields = SETTINGS_FIELDS[card] as readonly string[];
	const errors: SettingsErrors = {};
	for (const issue of result.issues) {
		const key = issue.path?.[0]?.key;
		const field = typeof key === 'string' && fields.includes(key) ? key : fields[0];
		errors[field] ??= keyOf(card, issue.message);
	}
	return { ok: false, errors };
}

/** The fields of `card` with an error, in form order. */
export function settingsErrorFields(card: SettingsCard, errors: SettingsErrors): string[] {
	return (SETTINGS_FIELDS[card] as readonly string[]).filter((f) => errors[f]);
}
