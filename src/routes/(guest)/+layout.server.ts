// The guest shell's data: the admin contact for the footer (UX-DR43), read through a query that
// selects only `admin_contact`. No guest data. With no address set, the footer shows no contact.
// A failing read is logged and treated as "no address", so every guest page still renders.
import { mailtoHref } from '#lib/mailto.ts';
import { getAdminContact } from '#lib/server/db/queries/index.ts';
import type { LayoutServerLoad } from './$types';

function readAdminContact(): string | null {
	try {
		return getAdminContact();
	} catch (e) {
		console.error('Could not read the admin contact for the footer', e);
		return null;
	}
}

export const load: LayoutServerLoad = () => {
	const address = readAdminContact();
	return { adminContact: address ? { address, href: mailtoHref(address) } : null };
};
