<!--
	Admin block row (Story 3.5): a block on the admin day view below 1024 px, among the booking rows
	in start order. The time range on line 1, "Block · Reinigung" muted on line 2, over the same
	hairline as a booking row. Not a link: blocks are deleted from the Blocks list.
-->
<script lang="ts">
	import type { AdminDayBlockRow } from '#lib/server/admin-day-view.ts';

	let { block }: { block: AdminDayBlockRow } = $props();
</script>

<div class="admin-block-row">
	<time class="time" datetime={block.datetime}>{block.time}</time>
	<span class="what">{block.text}</span>
</div>

<style>
	.admin-block-row {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		padding: 14px 0;
		border-bottom: 1px solid var(--line);
	}
	.time {
		font-size: var(--type-strip-day-size);
		font-weight: var(--type-strip-day-weight);
		line-height: var(--type-strip-day-leading);
	}
	.what {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-sm-leading);
	}
</style>
