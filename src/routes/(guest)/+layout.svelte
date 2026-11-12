<!-- Guest shell: skip link first, then header, main and footer in one column (560 px max from 600 px). -->
<script lang="ts">
	import AppFooter from '#lib/components/AppFooter.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import SkipLink from '#lib/components/SkipLink.svelte';
	import { page } from '$app/state';
	import { skipTarget } from '#lib/day-nav.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// A day view puts the start-time list (#times) after the date strip; skip straight to it.
	const target = $derived(skipTarget(page.data));
</script>

<SkipLink {target} />
<div class="column">
	<AppHeader />
	<main id="main" tabindex="-1">
		{@render children()}
	</main>
	<AppFooter contact={data.adminContact} />
</div>

<style>
	.column {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}
	main {
		flex: 1;
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
</style>
