// `/book/{yyyy-mm-dd}/{hhmm}`: the booking form (FR-5, FR-6, FR-9). The action validates with the
// shared schema, books through the command, and answers with a 303: to the confirmation, or to the
// refreshed day with `?error=conflict|past&time=hhmm`. Invalid fields come back as fail(400) with
// error keys and the typed values. Guest data never goes into a URL, cookie, redirect or log.
import { fail, redirect } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { BOOKING_FIELDS, parseBooking, type BookingErrors } from '#lib/schemas/index.ts';
import { dayErrorHref, invalidUrlTarget, loadBookView, parseStart } from '#lib/server/book-view.ts';
import { createBooking, isLockTimeout, type CreateBookingResult } from '#lib/server/commands/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** What the form sends back after fail(400): the error keys and every typed value. */
export type BookFormValues = { name: string; email: string; mobile: string; duration: string; partySize: string };
export type BookFormFailure = { errors: BookingErrors; values: BookFormValues };

export const load: PageServerLoad = ({ params, url, setHeaders }) => {
	const page = loadBookView(params.date, params.time, getLocale(), {
		d: url.searchParams.get('d'),
		p: url.searchParams.get('p')
	});
	if (page.kind === 'redirect') redirect(303, page.to);
	// The form carries a one-time submit token: no cache may keep or share it.
	setHeaders({ 'cache-control': 'private, no-store' });
	return { page };
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const start = parseStart(params.date, params.time);
		if (!start) redirect(303, invalidUrlTarget(params.date));

		const data = await request.formData();
		const raw = Object.fromEntries(BOOKING_FIELDS.map((f) => [f, String(data.get(f) ?? '')]));
		const values: BookFormValues = {
			name: raw.name,
			email: raw.email,
			mobile: raw.mobile,
			duration: raw.duration,
			partySize: raw.partySize
		};
		const parsed = parseBooking(raw);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values } satisfies BookFormFailure);

		const { value } = parsed;
		let result: CreateBookingResult;
		try {
			result = createBooking({
				start,
				durationMin: value.duration,
				partySize: value.partySize,
				name: value.name,
				email: value.email,
				mobile: value.mobile,
				locale: getLocale(),
				submitToken: value.submitToken
			});
		} catch (error) {
			// Another writer held the lock too long: nothing was booked. The form says so and keeps
			// the input; a retry with the same token is safe. Anything else stays a real error.
			if (isLockTimeout(error)) {
				return fail(503, { errors: { submitToken: 'form_invalid' }, values } satisfies BookFormFailure);
			}
			throw error;
		}
		if (result.ok) redirect(303, `/booked/${result.publicId}`);
		if (result.code === 'invalid') {
			return fail(400, { errors: { submitToken: 'form_invalid' }, values } satisfies BookFormFailure);
		}
		redirect(303, dayErrorHref(params.date, params.time, result.code));
	}
};
