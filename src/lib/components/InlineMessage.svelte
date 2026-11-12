<!--
	Inline message (DESIGN.md inline-message): a bordered note with an icon, at the top of the content
	it refers to. Errors use `role="alert"` and the error colour; info uses `role="status"` and text.
	`focus`: focusable (tabindex -1) and focused when it appears. `autofocus` does it on a plain page
	load without JavaScript, and SvelteKit honours it after a client navigation; the mount effect
	covers a message that appears without a navigation (an enhanced form's failure).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		text,
		kind = 'error',
		focus = false
	}: { text: string; kind?: 'error' | 'info'; focus?: boolean } = $props();

	let element: HTMLElement | undefined = $state();
	onMount(() => {
		if (focus) element?.focus();
	});
</script>

<!-- svelte-ignore a11y_autofocus, a11y_no_noninteractive_tabindex -->
<div
	class="inline-message {kind}"
	role={kind === 'error' ? 'alert' : 'status'}
	tabindex={focus ? -1 : undefined}
	autofocus={focus}
	bind:this={element}
>
	<Icon name={kind === 'error' ? 'error' : 'check'} />
	<p>{text}</p>
</div>

<style>
	.inline-message {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: 10px 14px;
		border: 1.5px solid currentColor;
		border-radius: var(--radius);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	.error {
		color: var(--error);
	}
	.info {
		color: var(--text);
	}
	p {
		/* One line of note text is 18.9 px; the 20 px icon sits on its first line. */
		padding-top: 1px;
	}
</style>
