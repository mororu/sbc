<!--
	Reply reminders (EXPERIENCE "Reply reminder"; key-admin-home mockup; Story 3.4): the section with
	the h2 "Antworten", its reminders oldest deletion first, and a polite status line below it.
	- `home`: always shown, with the count badge (every open reminder, the nav badge's number) and
	  "Keine offenen Antworten." when the list is empty.
	- `day`: the shown day's reminders above its bookings; the section only while there are any.
	After "Erledigt" (done, or already done by another admin) the page data reloads (`invalidateAll`:
	list and nav badges), focus moves to the next reminder's h3, else to the section h2, else (day
	view, none left) to the page h1 (`nextReplyFocus`), and the status says "Erledigt. Antworten: 0."
	or "Schon erledigt.". The number is the total of open replies, the same as the nav badge, also on
	the day view. A failing reload still moves focus and announces; it never shows the failure line.
	The status line stays outside the section, so it survives the section leaving the day view.
	Without JavaScript the page passes its `form`: "Schon erledigt." / "Erledigt. Antworten: n." in
	the status, or the failure line at the reminder it concerns.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ReplyReminder from './ReplyReminder.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { nextReplyFocus, type ReplyFormResult } from '#lib/reply-outcome.ts';
	import type { RepliesView } from '#lib/server/reply-view.ts';

	let {
		replies,
		variant,
		form = null
	}: { replies: RepliesView; variant: 'home' | 'day'; form?: ReplyFormResult } = $props();

	const shown = $derived(variant === 'home' || replies.items.length > 0);

	let status = $state('');
	/** Set by the first enhanced announcement; from then on the native POST's `form` no longer speaks. */
	let announced = $state(false);
	let heading: HTMLHeadingElement | undefined = $state();

	/** The status after a native POST (no JavaScript). */
	const formStatus = $derived(
		form?.done ? m.admin_reply_status_done({ count: replies.count }) : form?.code === 'already_done' ? m.admin_reply_already_done() : ''
	);
	const shownStatus = $derived(announced ? status : formStatus);
	const failedId = $derived(form?.code === 'failed' ? form.bookingId : null);

	async function announce(text: string) {
		announced = true;
		// Cleared first, so the same line is announced again.
		status = '';
		await tick();
		status = text;
	}

	async function resolved(id: number, outcome: 'done' | 'already_done') {
		const before = replies.items.map((r) => r.id);
		try {
			await invalidateAll();
			await tick();
		} catch {
			// The command's answer stands; the list catches up on the next load.
		}
		const target = nextReplyFocus(
			before,
			id,
			replies.items.map((r) => r.id),
			Boolean(heading?.isConnected)
		);
		const element =
			target.kind === 'reminder'
				? document.getElementById(`reply-${target.id}`)
				: target.kind === 'section'
					? heading
					: document.querySelector<HTMLElement>('main h1');
		element?.focus();
		await announce(outcome === 'done' ? m.admin_reply_status_done({ count: replies.count }) : m.admin_reply_already_done());
	}
</script>

{#if shown}
	<section class="replies" aria-labelledby="replies-heading">
		<h2 id="replies-heading" class="section-label" tabindex="-1" bind:this={heading}>
			<span>{replies.heading}</span>
			{#if variant === 'home'}<span class="count">{replies.count}</span>{/if}
		</h2>
		{#if replies.items.length === 0}
			<p class="empty">{replies.empty}</p>
		{:else}
			<ul class="list">
				{#each replies.items as reminder (reminder.id)}
					<li><ReplyReminder {reminder} failed={failedId === reminder.id} onresolved={resolved} {announce} /></li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
<p class="status" class:idle={shownStatus === ''} role="status" aria-live="polite">{shownStatus}</p>

<style>
	.section-label {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 24px;
		padding: 2px 8px;
		border: 1.5px solid var(--text);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		font-variant-numeric: tabular-nums;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.empty {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.status {
		margin-top: var(--space-2);
		color: var(--muted);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	.idle {
		margin-top: 0;
	}
	@media (forced-colors: active) {
		.count {
			border-color: CanvasText;
		}
	}
</style>
