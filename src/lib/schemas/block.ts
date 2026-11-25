// The block form schema (AD-16; Story 3.5): date, start ("Von"), end ("Bis") as HH:MM on 5-minute
// steps, and the reason. One Valibot schema for the form on the client and the actions on the
// server. Error messages are i18n message keys. A block lies on one local date, so the end is at
// most 23:55. Imports nothing from the app: the caller converts the local date and minutes into
// instants (`toInstant` from src/lib/time on the server).
import * as v from 'valibot';

/** Mirrors `BLOCK_REASONS` in the db schema (schemas may not import the db layer). */
export const BLOCK_FORM_REASONS = ['cleaning', 'maintenance', 'private_use'] as const;
export type BlockFormReason = (typeof BLOCK_FORM_REASONS)[number];

/** Times are on 5-minute steps (the time inputs carry `step=300`). */
export const BLOCK_STEP_MIN = 5;

export const BLOCK_FIELDS = ['date', 'start', 'end', 'reason'] as const;
export type BlockField = (typeof BLOCK_FIELDS)[number];

/**
 * Message keys in messages/*.json. `block_past` and `block_time_missing` are set on the server: one
 * needs the clock, the other the time zone (a time the spring clock change skips).
 */
export type BlockErrorKey =
	| 'field_required'
	| 'block_date_invalid'
	| 'block_time_step'
	| 'block_end_not_after_start'
	| 'block_time_missing'
	| 'block_past';
export type BlockErrors = Partial<Record<BlockField, BlockErrorKey>>;

/** The typed values, kept on an error (all strings, as posted). */
export type BlockValues = Record<BlockField, string>;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a real calendar date `yyyy-mm-dd` (Gregorian, no clock read); also the settings season card's date check. */
export function isCalendarDate(value: string): boolean {
	const match = DATE.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	if (month < 1 || month > 12 || day < 1) return false;
	const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
	return day <= days;
}

/** Minutes after local midnight of an `HH:MM` value. */
export function minuteOf(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
}

const required = () => v.pipe(v.string('field_required'), v.trim(), v.nonEmpty('field_required'));

const time = () =>
	v.pipe(
		required(),
		v.regex(TIME, 'block_time_step'),
		v.check((value) => minuteOf(value) % BLOCK_STEP_MIN === 0, 'block_time_step')
	);

export const blockFormSchema = v.pipe(
	v.object({
		date: v.pipe(required(), v.check(isCalendarDate, 'block_date_invalid')),
		start: time(),
		end: time(),
		reason: v.picklist(BLOCK_FORM_REASONS, 'field_required')
	}),
	v.forward(
		v.check((value) => minuteOf(value.end) > minuteOf(value.start), 'block_end_not_after_start'),
		['end']
	)
);

export type BlockFormInput = v.InferOutput<typeof blockFormSchema>;

/** The posted values as strings, missing ones empty. */
export function blockValues(values: Record<string, unknown>): BlockValues {
	const text = (key: BlockField) => (typeof values[key] === 'string' ? (values[key] as string) : '');
	return { date: text('date'), start: text('start'), end: text('end'), reason: text('reason') };
}

/** Validates the block form; errors hold the first problem of each field, in form order. */
export function validateBlockForm(
	values: Record<string, unknown>
): { ok: true; value: BlockFormInput } | { ok: false; errors: BlockErrors } {
	const result = v.safeParse(blockFormSchema, blockValues(values), { abortPipeEarly: true });
	if (result.success) return { ok: true, value: result.output };
	const keys: BlockErrorKey[] = ['field_required', 'block_date_invalid', 'block_time_step', 'block_end_not_after_start'];
	const errors: BlockErrors = {};
	for (const issue of result.issues) {
		const key = issue.path?.[0]?.key;
		const field = (BLOCK_FIELDS as readonly unknown[]).includes(key) ? (key as BlockField) : 'date';
		const message = (keys as string[]).includes(issue.message) ? (issue.message as BlockErrorKey) : 'field_required';
		errors[field] ??= message;
	}
	return { ok: false, errors };
}

/**
 * Parses the block form into instants: `toInstant(date, minuteOfDay)` is the caller's converter
 * (src/lib/time on the server). Returns `{ start, end, reason }` or the errors.
 */
export function parseBlockForm(
	values: Record<string, unknown>,
	toInstant: (date: string, minuteOfDay: number) => string
): { ok: true; value: { start: string; end: string; reason: BlockFormReason } } | { ok: false; errors: BlockErrors } {
	const result = validateBlockForm(values);
	if (!result.ok) return result;
	const { date, start, end, reason } = result.value;
	return { ok: true, value: { start: toInstant(date, minuteOf(start)), end: toInstant(date, minuteOf(end)), reason } };
}

/** The fields with an error, in form order. */
export function blockErrorFields(errors: BlockErrors): BlockField[] {
	return BLOCK_FIELDS.filter((f) => errors[f]);
}
