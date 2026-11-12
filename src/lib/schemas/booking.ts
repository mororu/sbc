// The booking form schema (AD-16): one Valibot schema, used by the form on the client and by the
// form action on the server. Error messages are i18n message keys, never text; the server result is
// authoritative. Imports nothing from the app.
import * as v from 'valibot';

/** Mirrors `DURATIONS` in src/lib/domain/start-times.ts (schemas may not import the domain). */
export const BOOKING_DURATIONS = [60, 90, 120, 150, 180] as const;
export const PARTY_SIZES = [1, 2, 3, 4, 5, 6] as const;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
/** Generous for any written form of a phone number; the stored E.164 has at most 16 characters. */
export const MOBILE_MAX = 32;
/** The longest canonical notice is about 90 characters; anything far longer is crafted. */
export const NOTICE_MAX = 200;
/** Submit tokens (and public ids): 16 random bytes as base64url, exactly 22 characters. */
export const RANDOM_ID = /^[A-Za-z0-9_-]{22}$/;

/** Message keys in messages/*.json. */
export type BookingErrorKey =
	| 'field_required'
	| 'name_too_long'
	| 'name_invalid'
	| 'email_invalid'
	| 'mobile_invalid'
	| 'form_invalid';

export const CONTACT_FIELDS = ['name', 'email', 'mobile'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export const BOOKING_FIELDS = [...CONTACT_FIELDS, 'duration', 'partySize', 'submitToken', 'notice'] as const;
export type BookingField = (typeof BOOKING_FIELDS)[number];
export type BookingErrors = Partial<Record<BookingField, BookingErrorKey>>;

/** Separators people type in phone numbers: spaces (any kind), hyphens, dots and slashes. */
const SEPARATORS = /[\s\-./]/gu;

/**
 * A mobile number in E.164, or null if it is not one we accept.
 * - `079 123 45 67` (national: 0, then 9 digits, not 00) → `+41791234567`
 * - `+41 79 123 45 67`, `0041 79 123 45 67`, also `+41 079 …` → `+41791234567`
 * - another `+` or `00` international number: 8–15 digits in all → `+` and the digits
 */
export function normaliseMobile(input: string): string | null {
	const s = input.replace(SEPARATORS, '');
	let international: string;
	if (/^\+\d+$/.test(s)) international = s.slice(1);
	else if (/^00\d+$/.test(s)) international = s.slice(2);
	else if (/^0[1-9]\d{8}$/.test(s)) return `+41${s.slice(1)}`;
	else return null;

	if (international.startsWith('41')) {
		let national = international.slice(2);
		if (/^0\d{9}$/.test(national)) national = national.slice(1);
		return /^[1-9]\d{8}$/.test(national) ? `+41${national}` : null;
	}
	return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
}

const required = (key: BookingErrorKey) => v.pipe(v.string(key), v.trim(), v.nonEmpty(key));

/** True when `value` has no control character (U+0000–U+001F, U+007F). */
export function hasNoControlCharacters(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code < 0x20 || code === 0x7f) return false;
	}
	return true;
}

export const nameSchema = v.pipe(
	required('field_required'),
	v.maxLength(NAME_MAX, 'name_too_long'),
	v.check(hasNoControlCharacters, 'name_invalid')
);

export const emailSchema = v.pipe(
	required('field_required'),
	v.maxLength(EMAIL_MAX, 'email_invalid'),
	v.email('email_invalid')
);

export const mobileSchema = v.pipe(
	required('mobile_invalid'),
	v.maxLength(MOBILE_MAX, 'mobile_invalid'),
	v.rawTransform(({ dataset, addIssue, NEVER }) => {
		const mobile = normaliseMobile(dataset.value);
		if (mobile === null) {
			addIssue({ message: 'mobile_invalid' });
			return NEVER;
		}
		return mobile;
	})
);

/** A whole number from a form field, one of `allowed`. */
const choice = <T extends readonly number[]>(allowed: T) =>
	v.pipe(
		v.string('form_invalid'),
		v.regex(/^\d{1,3}$/, 'form_invalid'),
		v.transform(Number),
		v.check((n) => allowed.includes(n), 'form_invalid')
	);

export const bookingSchema = v.object({
	name: nameSchema,
	email: emailSchema,
	mobile: mobileSchema,
	duration: choice(BOOKING_DURATIONS),
	partySize: choice(PARTY_SIZES),
	/** 128 bits, base64url (22 characters). */
	submitToken: v.pipe(v.string('form_invalid'), v.regex(RANDOM_ID, 'form_invalid')),
	/**
	 * The notice the form displayed, as canonical notice JSON (AD-24). Only checked for presence here
	 * (schemas may not import the domain); the action parses it with `parseNotice`.
	 */
	notice: v.pipe(v.string('form_invalid'), v.nonEmpty('form_invalid'), v.maxLength(NOTICE_MAX, 'form_invalid'))
});

export type BookingInput = v.InferOutput<typeof bookingSchema>;

export const contactSchemas: Record<ContactField, v.GenericSchema<string, string>> = {
	name: nameSchema,
	email: emailSchema,
	mobile: mobileSchema
};

function errorKey(message: string): BookingErrorKey {
	const keys: BookingErrorKey[] = ['field_required', 'name_too_long', 'name_invalid', 'email_invalid', 'mobile_invalid'];
	return (keys as string[]).includes(message) ? (message as BookingErrorKey) : 'form_invalid';
}

/** Validates one contact field; the error key, or null when it is fine. */
export function validateContactField(field: ContactField, value: string): BookingErrorKey | null {
	const result = v.safeParse(contactSchemas[field], value, { abortPipeEarly: true });
	return result.success ? null : errorKey(result.issues[0].message);
}

/** Validates the whole form. Errors hold the first problem of each field, in form order. */
export function parseBooking(
	values: Record<string, unknown>
): { ok: true; value: BookingInput } | { ok: false; errors: BookingErrors } {
	// A missing field counts as empty, so it gets the field's own message.
	const filled = Object.fromEntries(BOOKING_FIELDS.map((f) => [f, values[f] ?? '']));
	const result = v.safeParse(bookingSchema, filled, { abortPipeEarly: true });
	if (result.success) return { ok: true, value: result.output };
	const errors: BookingErrors = {};
	for (const issue of result.issues) {
		const key = issue.path?.[0]?.key;
		const field = (BOOKING_FIELDS as readonly unknown[]).includes(key) ? (key as BookingField) : 'submitToken';
		errors[field] ??= errorKey(issue.message);
	}
	return { ok: false, errors };
}

/** The fields with an error, in form order. */
export function errorFields(errors: BookingErrors): BookingField[] {
	return BOOKING_FIELDS.filter((f) => errors[f]);
}
