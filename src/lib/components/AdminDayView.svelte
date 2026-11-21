<!--
	Admin day view (EXPERIENCE "Bookings by day"; Story 3.2): the date heading with the arrows, the
	date strip (season days plus later booking and block days; flagged days carry a dot), a polite
	status region, the open reply reminders of the day's deleted bookings (Story 3.4; only when there
	are any, so right after a deletion the deleted guest's reminder is at the top) and the bookings
	(#bookings, the skip link's target): rows below 1024 px, the admin day table from 1024 px, or the
	empty line. Only the reminders write ("Erledigt").
	Day switching mirrors the guest day view: while another admin day loads, the strip selects it at
	once, the list is dimmed and busy, "Lädt …" appears after 1 s, and on arrival the status announces
	"Dienstag, 12. Januar: 2 Buchungen" (or the empty line). If focus fell to body, the heading takes it.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import AdminBookingRow from './AdminBookingRow.svelte';
	import AdminDayTable from './AdminDayTable.svelte';
	import DateStrip from './DateStrip.svelte';
	import Icon from './Icon.svelte';
	import PageTitle from './PageTitle.svelte';
	import ReplyReminders from './ReplyReminders.svelte';
	import { isAdminDayPath, pendingAdminDay } from '#lib/admin-nav.ts';
	import { shouldAnnounce } from '#lib/day-nav.ts';
	import type { ReplyFormResult } from '#lib/reply-outcome.ts';
	import type { AdminDayView } from '#lib/server/admin-day-view.ts';

	/** `form`: the `replyDone` result of a native POST (no JavaScript), for the reply reminders. */
	let { view, form = null }: { view: AdminDayView; form?: ReplyFormResult } = $props();

	const SLOW_MS = 1000;

	const target = $derived(navigating.to?.url.pathname);
	const busy = $derived(isAdminDayPath(target));
	const selected = $derived(pendingAdminDay(target, view) ?? view.date);

	let arrived = $state('');
	let navId = 0;
	let slow = $state(false);
	$effect(() => {
		if (!busy) {
			slow = false;
			return;
		}
		// A navigation to the same path (a strip cell of the shown day) brings no new day and no new
		// announcement, so the live region keeps its text.
		if (target !== page.url.pathname) {
			navId++;
			arrived = '';
		}
		const timer = setTimeout(() => (slow = true), SLOW_MS);
		return () => clearTimeout(timer);
	});

	let heading: HTMLHeadingElement | undefined = $state();
	afterNavigate(async (nav) => {
		if (!shouldAnnounce(nav)) return;
		const id = ++navId;
		arrived = '';
		await tick();
		if (id !== navId) return;
		arrived = view.status;
		const day = isAdminDayPath(nav.from?.url.pathname) && isAdminDayPath(nav.to?.url.pathname);
		if (day && (!document.activeElement || document.activeElement === document.body)) heading?.focus();
	});
	const status = $derived(slow ? view.labels.loading : arrived);
	const statusHidden = $derived(!slow && view.empty !== null);
</script>

<PageTitle title={view.title} />

<div class="heading-row">
	<h1 class="date-heading" tabindex="-1" bind:this={heading}>
		<span class="eyebrow">{view.heading.eyebrow}</span><span class="visually-hidden">,</span>
		<span class="date">{view.heading.date}</span>
	</h1>
	<div class="arrows">
		{#if view.prev}
			<a class="arrow" href={view.prev} aria-label={view.labels.prev} data-sveltekit-reset="false"
				><Icon name="chevron-left" /></a
			>
		{:else}
			<button class="arrow" type="button" disabled aria-label={view.labels.prev}><Icon name="chevron-left" /></button>
		{/if}
		{#if view.next}
			<a class="arrow" href={view.next} aria-label={view.labels.next} data-sveltekit-reset="false"
				><Icon name="chevron-right" /></a
			>
		{:else}
			<button class="arrow" type="button" disabled aria-label={view.labels.next}><Icon name="chevron-right" /></button>
		{/if}
	</div>
</div>

{#if view.strip.length > 0}
	<div class="strip-row">
		<DateStrip cells={view.strip} {selected} label={view.labels.strip} />
	</div>
{/if}

<div class="status-slot">
	<p class:visually-hidden={statusHidden} role="status" aria-live="polite">{status}</p>
</div>

<div class="replies">
	<ReplyReminders replies={view.replies} variant="day" {form} />
</div>

<div id="bookings" class="bookings" class:busy tabindex="-1" aria-busy={busy}>
	{#if view.empty}
		<p class="empty">{view.empty}</p>
	{:else}
		<ul class="rows">
			{#each view.rows as row (row.id)}
				<li><AdminBookingRow {row} /></li>
			{/each}
		</ul>
		<div class="table">
			<AdminDayTable rows={view.rows} labels={view.labels} />
		</div>
	{/if}
</div>

<style>
	.heading-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.date-heading {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
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
	.arrows {
		display: flex;
		gap: var(--space-2);
	}
	.arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--target-min);
		min-height: var(--target-min);
		padding: 0;
		border: var(--border-control);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
	}
	.arrow:disabled {
		border: var(--border-taken);
		color: var(--taken);
		cursor: default;
	}
	.strip-row {
		display: flex;
		margin-top: var(--space-5);
	}
	.status-slot {
		margin-top: var(--space-1);
		min-height: calc(var(--type-note-size) * var(--type-note-leading));
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	.replies:has(:global(section)) {
		margin: var(--space-1) 0 var(--space-5);
	}
	.bookings {
		margin: var(--space-1) 0 var(--space-6);
		transition: opacity var(--motion-fade);
	}
	.bookings:focus {
		outline: none;
	}
	.busy {
		opacity: 0.5;
	}
	.empty {
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.table {
		display: none;
	}
	@media (min-width: 1024px) {
		.rows {
			display: none;
		}
		.table {
			display: block;
		}
	}
</style>
