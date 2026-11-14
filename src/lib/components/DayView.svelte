<!--
	Calendar day view (UX-DR13, UX-DR14, UX-DR15): optional season note, the heading row with the
	day arrows, the strip row ("Heute" link, then the date strip), a polite status region, the empty
	line, and the start-time list (#times, the skip link's target).
	Everything is a plain link, so it works without JavaScript. With JavaScript, while SvelteKit
	loads another day the strip selects it at once, the list is dimmed and busy, and "Lädt …"
	appears after 1 s; on arrival the status announces the day's status line.
	A conflict or past message for the form whose submit is pending (see day-nav.ts) may be the guest's own
	booking after a lost response: the token is looked up (POST /booked) and, if it booked, the page
	moves on to the confirmation. Until the lookup answers the message stays as rendered.
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import DateStrip from './DateStrip.svelte';
	import Icon from './Icon.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import PageTitle from './PageTitle.svelte';
	import StartTimeRow from './StartTimeRow.svelte';
	import {
		isDayPath,
		pendingDay,
		readPending,
		resumePending,
		resumeToken,
		sessionStore,
		shouldAnnounce,
		withoutDayError
	} from '#lib/day-nav.ts';
	import type { DayView } from '#lib/server/day-view.ts';

	let { view }: { view: DayView } = $props();

	const SLOW_MS = 1000;

	// Counts the page's real (not shallow) navigations, and is bumped when the view goes away: a
	// resume that started before another navigation must not jump to the confirmation.
	let navCount = 0;
	onDestroy(() => navCount++);

	// Once a refusal message is shown, drop `?error=&time=` from the address (shallow, replacing the
	// entry), so a reload, a bookmark or the language switch does not show it again. After the
	// navigation has finished, so the message keeps its focus and the title its "Fehler: ".
	// Before that, a refusal for the form whose submit is pending starts the resume (see day-nav.ts).
	afterNavigate((nav) => {
		if (!nav.shallow) navCount++;
		const url = new URL((page.shallow?.url ?? page.url).href);
		const token = resumeToken(url, view.date, readPending(sessionStore()));
		if (token) void resume(token).catch(() => {});
		const clean = withoutDayError(url);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current page, less its query
		if (clean) void goto(clean, { shallow: true, replace: true, state: {} });
	});

	/** Looks up the pending token and, if it booked, moves on to the confirmation (replacing this entry). */
	function resume(token: string) {
		const started = navCount;
		return resumePending({
			storage: sessionStore(),
			fetcher: fetch,
			// Root-relative like every path the client helpers check: the app has no base path.
			endpoint: '/booked',
			token,
			stillHere: () => navCount === started,
			navigate: async (href) => {
				try {
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- a confirmation path from the server
					await goto(href, { replace: true });
				} catch {
					location.assign(href);
				}
			}
		});
	}

	// While a day loads, the list is busy; the strip selects the target at once if it is a
	// selectable cell, otherwise the current selection stays.
	const target = $derived(navigating.to?.url.pathname);
	// A shallow URL update (dropping `?error=`) loads nothing: the list stays as it is.
	const busy = $derived(isDayPath(target) && !(navigating.to && 'shallow' in navigating && navigating.shallow));
	const selected = $derived(pendingDay(target, view) ?? view.date);

	// Empty on first render, so nothing is announced on page load. `navId` lets only the latest
	// navigation write it.
	let arrived = $state('');
	let navId = 0;
	let slow = $state(false);
	$effect(() => {
		if (!busy) {
			slow = false;
			return;
		}
		// A new day is loading: the old day's status must not reappear.
		navId++;
		arrived = '';
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
		// Day links keep focus. If the focused control is gone (an arrow became a disabled button,
		// "Heute" vanished, or the route remounted) focus fell to body: put it on the heading.
		const day = isDayPath(nav.from?.url.pathname) && isDayPath(nav.to?.url.pathname);
		if (day && (!document.activeElement || document.activeElement === document.body)) {
			heading?.focus();
		}
	});
	const status = $derived(slow ? view.labels.loading : arrived);
	// With an empty line, the arrival status repeats it: announce it, but do not show it twice.
	const statusHidden = $derived(!slow && view.empty !== null);
</script>

<PageTitle title={view.title} />

{#if view.error}
	<!-- A refused booking (FR-6): first in main, focused on load, the title prefixed "Fehler: ". -->
	<div class="error">
		{#key view.error.text}<InlineMessage text={view.error.text} focus />{/key}
	</div>
{/if}

{#if view.note}
	<p class="note">{view.note}</p>
{/if}

<div class="heading-row">
	<h1 class="date-heading" tabindex="-1" bind:this={heading}>
		<!-- The space after the hidden comma keeps the accessible name "Heute, 12. Januar"; the flex
		     column drops it visually. -->
		<span class="eyebrow">{view.heading.eyebrow}</span><span class="visually-hidden">,</span>
		<span class="date">{view.heading.date}</span>
	</h1>
	<div class="arrows">
		{#if view.prev}
			<a
				class="arrow"
				href={view.prev}
				aria-label={view.labels.prev}
				data-sveltekit-reset="false"><Icon name="chevron-left" /></a
			>
		{:else}
			<button class="arrow" type="button" disabled aria-label={view.labels.prev}>
				<Icon name="chevron-left" />
			</button>
		{/if}
		{#if view.next}
			<a
				class="arrow"
				href={view.next}
				aria-label={view.labels.next}
				data-sveltekit-reset="false"><Icon name="chevron-right" /></a
			>
		{:else}
			<button class="arrow" type="button" disabled aria-label={view.labels.next}>
				<Icon name="chevron-right" />
			</button>
		{/if}
	</div>
</div>

<div class="strip-row">
	{#if view.today}
		<a class="today" href={view.today} data-sveltekit-reset="false">
			{view.labels.today}
		</a>
	{/if}
	<DateStrip cells={view.strip} {selected} label={view.labels.strip} />
</div>

<!-- The slot keeps one note line of height, so "Lädt …" and the arrival text shift nothing. -->
<div class="status-slot">
	<p class:visually-hidden={statusHidden} role="status" aria-live="polite">{status}</p>
</div>

<div id="times" class="times" class:busy tabindex="-1" aria-busy={busy}>
	{#if view.empty}
		<p class="empty">{view.empty.text}</p>
	{/if}
	{#if view.rows.length > 0}
		<ul class="rows">
			{#each view.rows as row, i (`${row.kind}-${row.datetime}-${i}`)}
				<li><StartTimeRow {row} /></li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.error {
		margin-bottom: var(--space-5);
	}
	.note {
		margin-bottom: var(--space-5);
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
		color: var(--muted);
	}
	/* h1 left, arrows right; the arrows wrap below the heading when the row gets too narrow. */
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
	.arrow,
	.today {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--target-min);
		min-height: var(--target-min);
		border: var(--border-control);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		text-decoration: none;
	}
	.arrow {
		padding: 0;
		cursor: pointer;
	}
	.arrow:disabled {
		border: var(--border-taken);
		color: var(--taken);
		cursor: default;
	}
	/* The strip's scroll box reaches --space-2 past its cells (room for the focus ring), so this
	   gap leaves --space-2 between "Heute" and the first cell. */
	.strip-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-top: var(--space-5);
	}
	.today {
		flex: none;
		padding: 0 var(--space-3);
		font-size: var(--type-segment-size);
		font-weight: var(--type-segment-weight);
	}
	.status-slot {
		margin-top: var(--space-1);
		min-height: calc(var(--type-note-size) * var(--type-note-leading));
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	/* Strip → status line → list: 4 + one note line (18.9) + 4 px, about --list-top (26 px). */
	.times {
		margin: var(--space-1) 0 var(--space-6);
		transition: opacity var(--motion-fade);
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
		display: flex;
		flex-direction: column;
		gap: var(--slot-gap);
	}
	.empty + .rows {
		margin-top: var(--list-top);
	}
</style>
