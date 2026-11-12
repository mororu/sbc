<!--
	One start-time row (UX-DR15, DESIGN.md start-time-row): time · state · chevron, the notice below
	spanning columns 2–3. Hot: solid border + flame. Cold start: dashed border + snowflake. Taken:
	line border, lock, struck-through time, hatch only in the left band, no chevron.
	A free row is one link to the booking form; its name is one sentence (srText, ending "Buchen.").
	The visible parts are hidden from screen readers. A taken row is not interactive.
-->
<script lang="ts">
	import Icon from './Icon.svelte';
	import type { DayRow } from '#lib/server/day-view.ts';

	let { row }: { row: DayRow } = $props();

	const icon = $derived(row.kind === 'taken' ? 'lock' : row.heat === 'hot' ? 'flame' : 'snowflake');
	const state = $derived(row.kind === 'taken' ? 'taken' : row.heat);
	const notice = $derived(row.kind === 'taken' ? row.until : row.notice);
</script>

{#snippet content()}
	<span class="visually-hidden">{row.srText}</span>
	<time class="time" datetime={row.datetime} aria-hidden="true">{row.time}</time>
	<span class="label" aria-hidden="true">
		<Icon name={icon} size="row" />
		<span>{row.label}</span>
	</span>
	{#if row.kind === 'free'}
		<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size="row" /></span>
	{/if}
	{#if notice}
		<span class="notice" aria-hidden="true">{notice}</span>
	{/if}
{/snippet}

<div class="slot">
	{#if row.kind === 'free'}
		<a class="row {state}" href={row.href}>{@render content()}</a>
	{:else}
		<div class="row {state}">{@render content()}</div>
	{/if}
</div>

<style>
	/* The row reflows by its own width, so 200 % text at 320 px stacks instead of breaking words. */
	.slot {
		container-type: inline-size;
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(76px, max-content) 1fr auto;
		align-items: center;
		column-gap: var(--space-3);
		row-gap: var(--space-1);
		padding: 16px 14px;
		border-radius: var(--radius);
		background: var(--background);
		color: inherit;
		text-decoration: none;
	}
	a.row {
		min-height: var(--target-min);
		-webkit-tap-highlight-color: transparent;
	}
	a.row:active {
		background: var(--line-subtle);
	}
	.hot {
		border: var(--border-hot);
	}
	.cold {
		border: var(--border-cold-start);
	}
	.taken {
		border: var(--border-taken);
		/* 1 px border instead of 2: one more pixel of padding keeps the columns aligned. */
		padding: 17px 15px;
		color: var(--taken);
	}
	/* The hatch fills only the left band, inside the padding: never behind text. */
	.taken::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		width: var(--hatch-band);
		border-start-start-radius: var(--radius);
		border-end-start-radius: var(--radius);
		background: repeating-linear-gradient(135deg, var(--line) 0 2px, transparent 2px 9px);
	}
	.time {
		grid-column: 1;
		grid-row: 1 / span 2;
		font-size: var(--type-slot-time-size);
		font-weight: var(--type-slot-time-weight);
		line-height: var(--type-slot-time-leading);
		font-variant-numeric: tabular-nums;
	}
	.taken .time {
		font-size: var(--type-slot-time-taken-size);
		font-weight: var(--type-slot-time-taken-weight);
		line-height: var(--type-slot-time-taken-leading);
		text-decoration: line-through;
	}
	.label {
		grid-column: 2;
		grid-row: 1;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}
	.taken .label {
		grid-column: 2 / span 2;
	}
	.chevron {
		grid-column: 3;
		grid-row: 1;
		display: inline-flex;
		color: var(--muted);
	}
	.hot .label {
		color: var(--hot);
	}
	.cold .label {
		color: var(--cold-start);
	}
	.notice {
		grid-column: 2 / span 2;
		grid-row: 2;
		min-width: 0;
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
		color: var(--muted);
	}
	.taken .notice {
		color: var(--taken);
	}
	/* Too narrow for time and label side by side (large text on a small phone): stack them. */
	@container (max-width: 16em) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
		.time,
		.label,
		.taken .label,
		.notice {
			grid-column: 1;
			grid-row: auto;
		}
		.chevron {
			display: none;
		}
	}
	@media (forced-colors: active) {
		.taken::before {
			display: none;
		}
	}
</style>
