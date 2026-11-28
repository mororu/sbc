<!--
	Booking detail (EXPERIENCE "Booking detail"; key-admin-delete-dialog mockup; Stories 3.2, 3.3),
	capped at --detail-max: the back link to the day (44 px, uppercased by CSS), the eyebrow date, the
	time range as h1, the flag and tags, the FR-16 list (email and mobile as text inside mailto:/tel:
	links), the notice now and the last-told notice side by side (one column on phones), the refused
	emails, and, for a booking that has not started, the destructive "Buchung löschen" (full width
	below 1024 px) that opens the impact dialog. It needs JavaScript, so the button appears only after
	hydration. While the POST runs the dialog cannot be closed.
	The dialog's confirm posts the impact token to `?/delete`:
	- success: the day of the booking, with focus on its h1;
	- `stale`: the page data is reloaded, the dialog shows the new impact with the stale line, focus on its title;
	- `past`: "Hat schon begonnen." in the dialog, no confirm; on close the page reloads;
	- `not_found`: the page data is reloaded; the dialog unmounts and the page shows "Diese Buchung gibt
	  es nicht mehr.", focused. Whenever a reload leaves no deletable detail, focus goes to the page h1;
	- lock timeout, network error or a failed reload: the inline "Das hat nicht geklappt …", focused.
	A booking already deleted shows the gone view with the link to its day.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ChangeTag from '#lib/components/ChangeTag.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ImpactDialog from '#lib/components/ImpactDialog.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import type { AdminNoticeItem } from '#lib/server/admin-day-view.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const view = $derived(data.view);

	let dialog: ImpactDialog | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();
	let busy = $state(false);
	let outcome: 'stale' | 'past' | 'failed' | null = $state(null);
	let attempt = $state(0);
	/** The trigger needs the dialog, which needs JavaScript: shown only after hydration. */
	let mounted = $state(false);
	/** Set before a programmatic close, so `closed` does not also move focus to the trigger. */
	let programmaticClose = false;

	onMount(() => {
		mounted = true;
	});

	const focusHeading = () => document.querySelector<HTMLElement>('main h1')?.focus();

	/** True while the page still shows a deletable detail (the dialog stays mounted). */
	const deletable = () => view.kind === 'admin-booking' && view.delete !== null;

	/** Reloads the page data; false when that failed (the failure is then shown in the dialog). */
	async function reload(): Promise<boolean> {
		try {
			await invalidateAll();
			return true;
		} catch {
			outcome = 'failed';
			attempt++;
			return false;
		}
	}

	function openDialog() {
		outcome = null;
		dialog?.open();
	}

	async function closed() {
		const wasPast = outcome === 'past';
		outcome = null;
		if (programmaticClose) {
			programmaticClose = false;
			return;
		}
		if (wasPast) {
			// The booking has started: the reloaded detail has no delete button any more.
			try {
				await invalidateAll();
			} catch {
				// Keep the page as it is; focus goes back to the trigger below if it is still there.
			}
			await tick();
			if (trigger?.isConnected) trigger.focus();
			else focusHeading();
			return;
		}
		trigger?.focus();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		outcome = null;
		return async ({ result, update }) => {
			try {
				if (result.type === 'redirect') {
					await update();
					await tick();
					focusHeading();
					return;
				}
				const code = result.type === 'failure' ? (result.data as { code?: string } | undefined)?.code : undefined;
				if (code === 'stale' || code === 'not_found') {
					if (!(await reload())) return;
					await tick();
					if (!deletable()) {
						// Gone or started meanwhile: the dialog unmounted with the delete model.
						focusHeading();
						return;
					}
					if (code === 'stale') {
						outcome = 'stale';
						await tick();
						dialog?.focusTitle();
					} else {
						// Should not happen (the reload shows the gone view); close without the trigger focus.
						programmaticClose = true;
						dialog?.close(true);
						focusHeading();
					}
				} else if (code === 'past') {
					outcome = 'past';
				} else {
					outcome = 'failed';
					attempt++;
				}
			} finally {
				busy = false;
			}
		};
	};
</script>

{#snippet notice(item: AdminNoticeItem)}
	<div class="notice">
		<p class="label">{item.term}</p>
		{#if item.notice}
			<span class="state {item.notice.heat}">
				<Icon name={item.notice.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />
				<span>{item.notice.label}</span>
			</span>
			<p class="text">{item.notice.text}</p>
		{:else}
			<p class="text">{item.missing}</p>
		{/if}
	</div>
{/snippet}

{#if view.kind === 'admin-booking-gone'}
	<PageTitle title={view.title} />
	<article class="detail">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin day href from the server -->
		<a class="back" href={view.back.href}><Icon name="chevron-left" size="row" />{view.back.text}</a>
		<h1 class="gone" tabindex="-1">{view.message}</h1>
	</article>
{:else}
	<PageTitle title={view.title} />

	<article class="detail">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin day href from the server -->
		<a class="back" href={view.back.href}><Icon name="chevron-left" size="row" />{view.back.text}</a>
		<p class="eyebrow">{view.eyebrow}</p>
		<h1 tabindex="-1"><time datetime={view.datetime}>{view.heading}</time></h1>
		{#if view.started}<p class="note">{view.started}</p>{/if}
		{#if view.flag}<p class="flag">{view.flag}</p>{/if}
		{#if view.changed || view.oldCode}
			<p class="tags">
				{#if view.changed}<ChangeTag text={view.changed} />{/if}
				{#if view.oldCode}<ChangeTag text={view.oldCode} />{/if}
			</p>
		{/if}

		<dl>
			{#each view.details as item (item.term)}
				<dt>{item.term}</dt>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mailto:/tel: links -->
				<dd>{#if item.href}<a href={item.href}>{item.value}</a>{:else}{item.value}{/if}</dd>
			{/each}
		</dl>

		<div class="notices">
			{@render notice(view.notices.now)}
			{@render notice(view.notices.lastTold)}
		</div>

		{#if view.refusals}
			<section class="refusals" aria-labelledby="refusals-heading">
				<h2 id="refusals-heading" class="label">{view.refusals.heading}</h2>
				<ul>
					{#each view.refusals.items as item, i (i)}<li>{item}</li>{/each}
				</ul>
			</section>
		{/if}

		{#if view.delete}
			<div class="delete">
				{#if mounted}
					<button class="destructive" type="button" bind:this={trigger} onclick={openDialog}>{view.delete.button}</button>
				{/if}
			</div>
			<ImpactDialog
				bind:this={dialog}
				id="delete-booking"
				title={view.delete.title}
				what={view.delete.what}
				row={view.delete.row}
				confirm={view.delete.button}
				cancel={view.delete.cancel}
				destructive
				action="?/delete"
				fields={{ impactToken: view.delete.token }}
				{submit}
				{busy}
				outcome={outcome ? { kind: outcome, text: view.delete.messages[outcome] } : null}
				{attempt}
				onclose={closed}
			/>
		{/if}
	</article>
{/if}

<style>
	.detail {
		max-width: var(--detail-max);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: var(--target-min);
		color: var(--text);
		font-size: var(--type-brand-size);
		font-weight: var(--type-brand-weight);
		letter-spacing: var(--type-brand-tracking);
		text-decoration: none;
		text-transform: uppercase;
	}
	.eyebrow {
		margin-top: 10px;
		color: var(--muted);
		font-size: var(--type-date-eyebrow-size);
		font-weight: var(--type-date-eyebrow-weight);
		letter-spacing: var(--type-date-eyebrow-tracking);
		text-transform: uppercase;
	}
	h1 {
		margin-top: var(--space-2);
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	.note,
	.flag {
		margin-top: var(--space-3);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.note {
		color: var(--muted);
	}
	.flag {
		padding-left: var(--space-3);
		border-left: 2px solid var(--text);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px 18px;
		align-items: baseline;
		margin: 22px 0 0;
	}
	dt {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-weight);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	}
	dd a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	.notices {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		margin-top: 22px;
	}
	@media (min-width: 600px) {
		.notices {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.label {
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		text-transform: uppercase;
	}
	.hot {
		color: var(--hot);
	}
	.cold {
		color: var(--cold-start);
	}
	.text {
		color: var(--muted);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	.refusals {
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--line);
	}
	.refusals ul {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
	}
	/* The gone line is the page h1: the same date-heading scale as the detail's h1. */
	.gone {
		margin-top: var(--space-4);
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	.delete {
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--line);
	}
	.destructive {
		width: 100%;
		min-height: var(--target-min);
		padding: 0 18px;
		border: 1.5px solid transparent;
		border-radius: var(--radius);
		background: var(--error);
		color: var(--on-error);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		cursor: pointer;
	}
	@media (min-width: 1024px) {
		.destructive {
			width: auto;
		}
	}
</style>
