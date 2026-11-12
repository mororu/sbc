<!--
	Primary button (DESIGN.md button-primary): full width, `primary` fill, 54 px minimum height that
	grows with the text. While busy the label changes to `busyLabel` and `aria-disabled` is set; the
	button keeps focus, and the form ignores further taps (the caller cancels them).
-->
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		label,
		busy = false,
		busyLabel,
		...rest
	}: { label: string; busy?: boolean; busyLabel: string } & Omit<HTMLButtonAttributes, 'type'> = $props();
</script>

<button class="primary" type="submit" aria-disabled={busy ? 'true' : undefined} {...rest}>
	{busy ? busyLabel : label}
</button>

<style>
	.primary {
		display: block;
		width: 100%;
		min-height: var(--button-height);
		padding: var(--space-3) var(--space-4);
		border: 1.5px solid transparent;
		border-radius: var(--radius);
		background: var(--primary);
		color: var(--on-primary);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		cursor: pointer;
	}
	.primary[aria-disabled='true'] {
		cursor: progress;
	}
</style>
