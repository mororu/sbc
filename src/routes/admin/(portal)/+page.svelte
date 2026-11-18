<!--
	Admin home (UX-DR46; Story 3.1): the h1 "Übersicht" (visually hidden, as in the key-admin-home
	mockup: the active tab already says it), the worker warning at the top, and the grid: one column
	on phones, two equal columns from 1024 px (left: call list and replies; right: next bookings).
	Stories 3.2, 3.4 and 3.6 fill the columns.
-->
<script lang="ts">
	import InlineMessage from '#lib/components/InlineMessage.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageTitle title={m.admin_home_title()} />

<h1 class="visually-hidden">{m.admin_home_title()}</h1>
{#if data.home.warning}
	<InlineMessage text={data.home.warning} />
{/if}
<div class="home-grid">
	<div class="column"></div>
	<div class="column"></div>
</div>

<style>
	.home-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-6);
		margin-top: var(--space-5);
	}
	@media (min-width: 1024px) {
		.home-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
