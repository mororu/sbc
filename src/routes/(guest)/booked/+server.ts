// `POST /booked` with JSON `{ submitToken }`: where the booking a submit token made lives. The day
// page asks this after a lost response (the form's reload then redirected to the conflict message),
// so the guest still reaches their own confirmation. The token is a 128-bit capability equal to
// resubmitting the form, so this exposes nothing new. It goes only in the POST body, never in a URL,
// cookie or log. A malformed body is a bare 400; an unknown or deleted booking a bare 404.
import { json } from '@sveltejs/kit';
import { bookedHref } from '#lib/server/guest-urls.ts';
import { bookingByToken } from '#lib/server/db/queries/index.ts';
import { isRandomId } from '#lib/server/ids.ts';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': 'private, no-store' };

export const POST: RequestHandler = async ({ request }) => {
	let token: unknown;
	try {
		token = ((await request.json()) as { submitToken?: unknown } | null)?.submitToken;
	} catch {
		return new Response(null, { status: 400, headers });
	}
	if (typeof token !== 'string' || !isRandomId(token)) return new Response(null, { status: 400, headers });

	const found = bookingByToken(token);
	if (!found || found.deleted) return new Response(null, { status: 404, headers });
	return json({ href: bookedHref(found.publicId, false) }, { headers });
};
