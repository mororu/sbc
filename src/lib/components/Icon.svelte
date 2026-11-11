<!--
	Line icons on a 24×24 grid (UX-DR7): currentColor, round caps and joins.
	`row`: 17 px, stroke 1.6 (inside start-time rows). `default`: 20 px, stroke 2.
	Always decorative (aria-hidden) and paired with visible or screen-reader text.
-->
<script lang="ts" module>
	export const ICON_NAMES = [
		'flame',
		'snowflake',
		'lock',
		'chevron-left',
		'chevron-right',
		'check',
		'mail',
		'key',
		'phone',
		'sun',
		'moon',
		'error'
	] as const;

	export type IconName = (typeof ICON_NAMES)[number];
</script>

<script lang="ts">
	let { name, size = 'default' }: { name: IconName; size?: 'row' | 'default' } = $props();

	const px = $derived(size === 'row' ? 17 : 20);
	const stroke = $derived(size === 'row' ? 1.6 : 2);
</script>

<svg
	class="icon"
	width={px}
	height={px}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'flame'}
		<path
			d="M12 3c.6 3.2 5 5.6 5 10.2a5 5 0 0 1-10 0c0-2.4 1.3-4 2.6-5.1.2 1.8 1.1 2.9 2.4 3.3-.6-2.8-.6-5.6 0-8.4z"
		/>
	{:else if name === 'snowflake'}
		<path
			d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M3.4 10.4 6.8 9.4 5.9 6M20.6 13.6l-3.4 1-.9 3.4M3.4 13.6l3.4 1 .9 3.4M20.6 10.4l-3.4-1-.9-3.4"
		/>
	{:else if name === 'lock'}
		<rect x="5" y="11" width="14" height="10" rx="1.5" />
		<path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
	{:else if name === 'chevron-left'}
		<path d="m15 18-6-6 6-6" />
	{:else if name === 'chevron-right'}
		<path d="m9 6 6 6-6 6" />
	{:else if name === 'check'}
		<path d="m5 12.5 4.5 4.5L19 7.5" />
	{:else if name === 'mail'}
		<rect x="3" y="5" width="18" height="14" rx="1.5" />
		<path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
	{:else if name === 'key'}
		<circle cx="8" cy="15" r="4" />
		<path d="M10.8 12.2 20 3M17 6l3 3M14.5 8.5l2 2" />
	{:else if name === 'phone'}
		<path
			d="M5 3h3.5l2 5-2.5 1.6a11 11 0 0 0 5.4 5.4L15 12.5l5 2V18a2 2 0 0 1-2 2A15 15 0 0 1 3 5a2 2 0 0 1 2-2z"
		/>
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" />
		<path
			d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"
		/>
	{:else if name === 'moon'}
		<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
	{:else if name === 'error'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7.5V13M12 16.5v.01" />
	{/if}
</svg>

<style>
	.icon {
		display: inline-block;
		vertical-align: middle;
	}
</style>
