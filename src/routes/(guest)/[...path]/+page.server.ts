// Any path no other route matches: a 404 inside the guest shell (header, footer with the contact),
// rendered by `(guest)/+error.svelte`, instead of SvelteKit's bare default page. Rest routes rank
// last, so every real route still wins.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	error(404, 'Not found');
};
