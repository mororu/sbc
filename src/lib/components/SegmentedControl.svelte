<!--
	Segmented control (DESIGN.md segmented-control): a fieldset with a section-label legend and a
	44 px group of native radios, visually hidden behind styled labels, so arrow keys and the checked
	state come free. Selected: `text` fill, check icon. Unavailable: disabled radio, muted, struck
	through. Each option may carry a fuller accessible name ("90 Minuten, bis 19:30"); the notes
	below are tied to the fieldset with aria-describedby.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	type Option = { value: number; text: string; name?: string; enabled?: boolean };

	let {
		id,
		legend,
		name,
		options,
		value = $bindable(),
		describedby,
		onchange,
		notes
	}: {
		id: string;
		legend: string;
		name: string;
		options: Option[];
		value: number;
		describedby?: string;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		notes?: Snippet;
	} = $props();
</script>

<fieldset class="segmented" aria-describedby={describedby}>
	<legend>{legend}</legend>
	<div class="group">
		{#each options as option (option.value)}
			{@const disabled = option.enabled === false}
			<label class="segment" class:disabled>
				<input
					class="visually-hidden"
					type="radio"
					id="{id}-{option.value}"
					{name}
					value={option.value}
					{disabled}
					bind:group={value}
					aria-label={option.name}
					{onchange}
				/>
				{#if value === option.value && !disabled}<Icon name="check" size="row" />{/if}
				<span aria-hidden={option.name ? 'true' : undefined}>{option.text}</span>
			</label>
		{/each}
	</div>
	{@render notes?.()}
</fieldset>

<style>
	.segmented {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		margin-bottom: var(--space-3);
		padding: 0;
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.group {
		display: flex;
		border: var(--border-control);
		border-radius: var(--radius);
	}
	.segment {
		position: relative;
		flex: 1 1 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-width: 0;
		min-height: var(--target-min);
		padding: var(--space-1) 2px;
		font-size: var(--type-segment-size);
		font-weight: var(--type-segment-weight);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.segment + .segment {
		border-inline-start: var(--border-control);
	}
	.segment:first-child {
		border-start-start-radius: var(--radius);
		border-end-start-radius: var(--radius);
	}
	.segment:last-child {
		border-start-end-radius: var(--radius);
		border-end-end-radius: var(--radius);
	}
	.segment:has(input:checked) {
		background: var(--text);
		color: var(--background);
		font-weight: var(--type-segment-selected-weight);
	}
	.segment:has(input:focus-visible) {
		outline: var(--focus-ring-width) solid var(--focus);
		outline-offset: var(--focus-ring-offset);
		z-index: 1;
	}
	.disabled {
		color: var(--muted);
		text-decoration: line-through;
		cursor: default;
	}
	@media (forced-colors: active) {
		.segment:has(input:checked) {
			background: SelectedItem;
			color: SelectedItemText;
		}
		.disabled {
			color: GrayText;
		}
		.segment:has(input:focus-visible) {
			outline-color: Highlight;
		}
	}
</style>
