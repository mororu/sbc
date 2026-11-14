<!--
	Fallback error page for errors outside the guest layout (for example when the guest layout's own
	load fails). The header, the same message and calendar link as the guest error page, no footer
	(the footer needs the guest layout's data). It reveals nothing: no id, no reason, no stack.
-->
<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageTitle title={notFound ? m.not_found_title() : m.error_page_title()} />

<div class="column">
	<AppHeader />
	<main id="main" tabindex="-1">
		<section class="error-page">
			<h1>{notFound ? m.not_found_heading() : m.error_page_heading()}</h1>
			<a href={resolve('/(guest)')}>{m.error_page_home()}</a>
		</section>
	</main>
</div>

<style>
	main {
		padding: var(--space-6) var(--gutter) 0;
	}
	main:focus {
		outline: none;
	}
	@media (min-width: 600px) {
		.column {
			max-width: var(--content-max);
			margin-inline: auto;
		}
	}
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
