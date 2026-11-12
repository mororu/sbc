<!--
	Guest error page, inside the guest layout. It reveals nothing: no id, no reason, no stack. A 404
	("Diese Seite gibt es nicht.") or a plain "Das hat nicht geklappt.", with a link to the calendar.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageTitle title={notFound ? m.not_found_title() : m.error_page_title()} />

<section class="error-page">
	<h1>{notFound ? m.not_found_heading() : m.error_page_heading()}</h1>
	<a href={resolve('/(guest)')}>{m.error_page_home()}</a>
</section>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
		padding-block: var(--gutter);
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
