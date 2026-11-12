<!--
	State badge (DESIGN.md state-badge): the heat state as a bordered tag, icon + uppercase label.
	Solid border for hot, dashed for cold start. Never interactive. `large` is the confirmation size.
-->
<script lang="ts">
	import Icon from './Icon.svelte';

	let { heat, label, large = false }: { heat: 'hot' | 'cold'; label: string; large?: boolean } = $props();
</script>

<span class="badge {heat}" class:large>
	<Icon name={heat === 'hot' ? 'flame' : 'snowflake'} size={large ? 'default' : 'row'} />
	<span>{label}</span>
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px 10px;
		border-radius: var(--radius);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		text-transform: uppercase;
	}
	.hot {
		border: var(--border-hot);
		color: var(--hot);
	}
	.cold {
		border: var(--border-cold-start);
		color: var(--cold-start);
	}
	.large {
		padding: 10px 14px;
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
	}
</style>
