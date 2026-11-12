<!--
	Season notice (DESIGN.md season-notice): replaces the start-time list before or after the season.
	The first sentence is the h1 in date-heading type; the rest is the body under a top hairline.
-->
<script lang="ts">
	import PageTitle from './PageTitle.svelte';
	import type { SeasonView } from '#lib/server/day-view.ts';

	let { notice }: { notice: SeasonView } = $props();
</script>

<PageTitle title={notice.title} />

<section class="season-notice">
	<h1>{notice.heading}</h1>
	<p>{notice.body}</p>
</section>

<style>
	.season-notice {
		padding-block: var(--gutter);
	}
	h1 {
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	p {
		margin-top: var(--gutter);
		padding-top: var(--gutter);
		border-top: 1px solid var(--line);
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
</style>
