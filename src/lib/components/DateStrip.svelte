<!--
	Date strip (UX-DR14, DESIGN.md date-strip): every day from today to the end of the horizon, 44 px
	cells over a 1 px line-strong baseline. Selectable days are plain links to /day/{date}; days
	outside a season are muted, struck-through spans whose hidden name says "nicht buchbar". The
	selected cell is weight 600 with a 2 px primary underline over the baseline and carries
	aria-current="date". Only the strip scrolls horizontally, never the page: on mount, whenever the
	selection moves and whenever the cells change, the strip container scrolls the selected cell
	into the middle (smooth; a jump on first render and under reduced motion).
-->
<script lang="ts">
	import type { StripDay } from '#lib/server/day-view.ts';

	let { cells, selected, label }: { cells: StripDay[]; selected: string; label: string } = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let mounted = false;

	$effect(() => {
		const date = selected;
		// Read the cells too, so a new strip (another day's data) re-centres the selection.
		void cells.length;
		if (!scroller) return;
		const cell = scroller.querySelector<HTMLElement>(`[data-date="${date}"]`);
		if (!cell) return;
		const left = cell.offsetLeft - (scroller.clientWidth - cell.offsetWidth) / 2;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		scroller.scrollTo({ left: Math.max(0, left), behavior: mounted && !reduce ? 'smooth' : 'auto' });
		mounted = true;
	});
</script>

<nav class="strip" aria-label={label}>
	<div class="scroller" bind:this={scroller}>
		<ul>
			{#each cells as cell (cell.date)}
				<li data-date={cell.date}>
					{#if cell.href}
						<a
							class="cell"
							class:selected={cell.date === selected}
							href={cell.href}
							aria-current={cell.date === selected ? 'date' : undefined}
							data-sveltekit-reset="false"
						>
							<span class="visually-hidden">{cell.name}</span>
							<span class="weekday" aria-hidden="true">{cell.weekday}</span>
							<span class="day" aria-hidden="true">{cell.day}</span>
						</a>
					{:else}
						<span class="cell off">
							<span class="visually-hidden">{cell.name}</span>
							<span class="weekday" aria-hidden="true">{cell.weekday}</span>
							<span class="day" aria-hidden="true">{cell.day}</span>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</nav>

<style>
	.strip {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* The padding leaves room for the focus ring inside the scrolling box; the negative margin
	   keeps the cells aligned with the column. */
	.scroller {
		position: relative;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		padding: var(--space-2);
		margin: calc(-1 * var(--space-2));
	}
	.scroller::-webkit-scrollbar {
		display: none;
	}
	/* The baseline spans the whole strip, scrolled content included. */
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		gap: var(--space-2);
		width: max-content;
		min-width: 100%;
		border-bottom: 1px solid var(--line-strong);
	}
	li {
		flex: none;
		display: flex;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
		width: var(--target-min);
		min-height: var(--target-min);
		padding: var(--space-1) 0 var(--space-3);
		border-radius: var(--radius-none);
		color: var(--text);
		text-decoration: none;
	}
	/* The 2 px underline replaces 2 px of padding (the cell keeps its height) and is pulled down by
	   1 px so it overlaps the baseline. */
	.selected {
		padding-bottom: calc(var(--space-3) - 2px);
		margin-bottom: -1px;
		border-bottom: var(--border-selected-day);
		font-weight: 600;
	}
	.weekday {
		font-size: var(--type-strip-weekday-size);
		font-weight: var(--type-strip-weekday-weight);
		letter-spacing: var(--type-strip-weekday-tracking);
		text-transform: uppercase;
		color: var(--muted);
	}
	.day {
		font-size: var(--type-strip-day-size);
		font-weight: var(--type-strip-day-weight);
		line-height: var(--type-strip-day-leading);
		font-variant-numeric: tabular-nums;
	}
	.selected .weekday,
	.selected .day {
		font-weight: 600;
	}
	.off,
	.off .weekday {
		color: var(--muted);
	}
	.off .day {
		text-decoration: line-through;
	}
</style>
