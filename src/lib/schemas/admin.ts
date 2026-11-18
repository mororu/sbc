// Admin form schemas (AD-16; Story 3.1): the sign-in form, and the rule for a new admin password
// (the CLI now, the settings card in Story 3.7). Error messages are i18n message keys. A password is
// never trimmed, logged or sent back in form values. Imports nothing from the app.
import * as v from 'valibot';

/** Password lengths count Unicode code points, on both sides (CLI and sign-in). */
const codePoints = (value: string) => [...value].length;

/** A new admin password needs at least this many characters (Unicode code points). */
export const PASSWORD_MIN = 12;
/** Longer than any real password: bounds the argon2 work a crafted request can cause. */
export const PASSWORD_MAX = 1024;

export type AdminErrorKey = 'field_required' | 'password_wrong' | 'password_too_short' | 'password_too_long';

export const SIGN_IN_FIELDS = ['password', 'to'] as const;

const signInSchema = v.object({
	password: v.pipe(
		v.string('field_required'),
		v.nonEmpty('field_required'),
		// Too long to be the password: wrong, without hashing it.
		v.check((value) => codePoints(value) <= PASSWORD_MAX, 'password_wrong')
	),
	/** The return target, checked by the server (`safeReturnTarget`); anything else is ignored. */
	to: v.optional(v.string(), '')
});

export type SignInInput = v.InferOutput<typeof signInSchema>;

/** Parses the sign-in form. The only possible error is on `password`. */
export function parseSignIn(
	values: Record<string, unknown>
): { ok: true; value: SignInInput } | { ok: false; errors: { password: AdminErrorKey } } {
	const result = v.safeParse(signInSchema, {
		password: values.password ?? '',
		to: typeof values.to === 'string' ? values.to : ''
	});
	if (result.success) return { ok: true, value: result.output };
	const message = result.issues[0].message;
	const key: AdminErrorKey = message === 'password_wrong' ? 'password_wrong' : 'field_required';
	return { ok: false, errors: { password: key } };
}

/** The error key for a new admin password, or null when it may be stored. */
export function validateNewPassword(password: string): AdminErrorKey | null {
	const length = codePoints(password);
	if (length < PASSWORD_MIN) return 'password_too_short';
	if (length > PASSWORD_MAX) return 'password_too_long';
	return null;
}
