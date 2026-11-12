<!-- Calendar day view (UX-DR13, UX-DR15): optional season note, the date heading, then the rows. -->
<script lang="ts">
	import PageTitle from './PageTitle.svelte';
	import StartTimeRow from './StartTimeRow.svelte';
	import type { DayView } from '#lib/server/day-view.ts';

	let { view }: { view: DayView } = $props();
</script>

<PageTitle title={view.title} />

{#if view.note}
	<p class="note">{view.note}</p>
{/if}

<h1 class="date-heading">
	<!-- The space after the hidden comma keeps the accessible name "Heute, 12. Januar"; the flex
	     column drops it visually. -->
	<span class="eyebrow">{view.heading.eyebrow}</span><span class="visually-hidden">,</span>
	<span class="date">{view.heading.date}</span>
</h1>

{#if view.rows.length > 0}
	<ul class="rows">
		{#each view.rows as row, i (`${row.kind}-${row.datetime}-${i}`)}
			<li><StartTimeRow {row} /></li>
		{/each}
	</ul>
{/if}

<style>
	.note {
		margin-bottom: var(--space-5);
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
		color: var(--muted);
	}
	.date-heading {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	.eyebrow {
		font-size: var(--type-date-eyebrow-size);
		font-weight: var(--type-date-eyebrow-weight);
		letter-spacing: var(--type-date-eyebrow-tracking);
		line-height: var(--type-body-sm-leading);
		text-transform: uppercase;
		color: var(--muted);
	}
	.rows {
		list-style: none;
		margin: var(--list-top) 0 var(--space-6);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--slot-gap);
	}
</style>
