<!--
	Text field (DESIGN.md text-field): a visible label above the input, an underline in `line-strong`
	(2 px `focus` when focused, 2 px `error` with a message below when invalid), and a purpose line.
	Purpose and error are tied to the input with aria-describedby; errors are not announced live.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	let {
		id,
		label,
		purpose,
		error = null,
		value = $bindable(''),
		...rest
	}: {
		id: string;
		label: string;
		purpose: string;
		error?: string | null;
		value?: string;
	} & Omit<HTMLInputAttributes, 'id' | 'value'> = $props();
</script>

<div class="field" class:invalid={!!error}>
	<label for={id}>{label}</label>
	<input
		{id}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error ${id}-purpose` : `${id}-purpose`}
		{...rest}
	/>
	{#if error}
		<p class="error" id="{id}-error"><Icon name="error" /><span>{error}</span></p>
	{/if}
	<p class="purpose" id="{id}-purpose">{purpose}</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
	}
	label {
		margin-bottom: var(--space-2);
		font-size: var(--type-field-label-size);
		font-weight: var(--type-field-label-weight);
		line-height: var(--type-field-label-leading);
		color: var(--muted);
	}
	input {
		min-height: var(--field-height);
		padding: var(--space-2) 0;
		border: 0;
		/* 1 px normally, 2 px when focused or invalid; the -1 px margin then keeps the layout still. */
		border-bottom: 1px solid var(--line-strong);
		border-radius: var(--radius-none);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--type-field-size);
		font-weight: var(--type-field-weight);
	}
	input:focus {
		outline: none;
		border-bottom: var(--border-field-focus);
		margin-bottom: -1px;
	}
	.invalid input {
		border-bottom: 2px solid var(--error);
		margin-bottom: -1px;
	}
	.invalid input:focus {
		border-bottom: var(--border-field-focus);
	}
	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-2);
		font-size: var(--type-field-error-size);
		font-weight: var(--type-field-error-weight);
		line-height: var(--type-field-error-leading);
		color: var(--error);
	}
	.purpose {
		margin-top: var(--space-1);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	@media (forced-colors: active) {
		input:focus {
			outline: 2px solid Highlight;
		}
	}
</style>
