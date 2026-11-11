<!-- App header (UX-DR8): brand left; language switch then theme switch right. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import LanguageSwitch from './LanguageSwitch.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';
</script>

<header class="app-header">
	<a class="brand" href={resolve('/(guest)')}>{m.brand()}</a>
	<div class="controls">
		<LanguageSwitch />
		<ThemeSwitch />
	</div>
</header>

<style>
	.app-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 14px var(--gutter) 0;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		color: var(--text);
		font-size: var(--type-brand-size);
		font-weight: var(--type-brand-weight);
		letter-spacing: var(--type-brand-tracking);
		text-transform: uppercase;
		text-decoration: none;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-inline-start: auto;
	}
</style>
