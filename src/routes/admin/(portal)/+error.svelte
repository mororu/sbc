<!--
	Admin error page (Story 3.2), inside the admin shell, so the header and nav stay. A 404 ("Diese
	Seite gibt es nicht.": an unknown day, a deleted or unknown booking) or "Das hat nicht geklappt.",
	with a link to Buchungen. Reveals nothing: no id, no reason, no stack.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { ADMIN_TAB_HREF } from '#lib/admin-nav.ts';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const notFound = $derived(page.status === 404);
</script>

<PageTitle title={notFound ? m.not_found_title() : m.error_page_title()} />

<section class="error-page">
	<h1>{notFound ? m.not_found_heading() : m.error_page_heading()}</h1>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- root-relative admin href (admin-nav.ts) -->
	<a href={ADMIN_TAB_HREF.day}>{m.admin_not_found_link()}</a>
</section>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
	}
	h1 {
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
</style>
