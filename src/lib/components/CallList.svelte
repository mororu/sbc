<!--
	Call list (FR-21; EXPERIENCE "Call list entry", "Count badge"; key-admin-home mockup; Story 3.6):
	the admin home's section with the h2 "Anrufliste" and its count badge (always shown, "0" and
	"Niemand muss angerufen werden." when empty), the entries (*Anruf nötig* first, then by start, as
	`deriveCallList` orders them) and a polite status line below it.
	After "Angerufen" (called, or already done elsewhere) the page data reloads (`invalidateAll`:
	list and nav badges), focus moves to the next entry's h3, else to the section h2
	(`nextCallFocus`), and the status says "Tom angerufen. Anrufliste: 0." (no name: "Angerufen.
	Anrufliste: 0.") or "Schon erledigt.". A failing reload still moves focus and announces. After a
	stale refusal the data reloads; if the entry has left meanwhile, the same already-done path runs.
	Without JavaScript the page passes its `form` (only the `called` action's results): the status
	for a called or already-done result, or for a stale one whose entry has left ("Schon erledigt."),
	the stale line at the entry a `stale` result names, the failure line at the entry a `failed` one names.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import CallEntry from './CallEntry.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { nextCallFocus, type CallFormResult } from '#lib/call-outcome.ts';
	import type { CallsView } from '#lib/server/call-view.ts';

	let { calls, form = null }: { calls: CallsView; form?: CallFormResult } = $props();

	let status = $state('');
	/** Set by the first enhanced announcement; from then on the native POST's `form` no longer speaks. */
	let announced = $state(false);
	let heading: HTMLHeadingElement | undefined = $state();

	const calledText = (name: string | null | undefined, count: number) =>
		name ? m.admin_call_status({ name, count }) : m.admin_call_status_no_name({ count });

	const listed = (id: number | null | undefined) => calls.items.some((c) => c.bookingId === id);

	/**
	 * The status after a native POST (no JavaScript): called, already done, or a stale refusal whose
	 * entry has left the list since (nothing left to call: "Schon erledigt.").
	 */
	const formStatus = $derived(
		form?.called
			? calledText(form.firstName, calls.count)
			: form?.code === 'already_done' || (form?.code === 'stale' && !listed(form.bookingId))
				? m.admin_reply_already_done()
				: ''
	);
	const shownStatus = $derived(announced ? status : formStatus);
	const failedId = $derived(form?.code === 'failed' ? form.bookingId : null);
	const staleId = $derived(form?.code === 'stale' ? form.bookingId : null);

	async function announce(text: string) {
		announced = true;
		// Cleared first, so the same line is announced again.
		status = '';
		await tick();
		status = text;
	}

	/** Reloads (list and badges); a failing reload is ignored: the command's answer stands. */
	async function reload() {
		try {
			await invalidateAll();
			await tick();
		} catch {
			// The list catches up on the next load.
		}
	}

	/** Moves focus after `id` (`nextCallFocus` from the ids `before` the reload) and announces `text`. */
	async function settle(before: number[], id: number, text: () => string) {
		const target = nextCallFocus(
			before,
			id,
			calls.items.map((c) => c.bookingId)
		);
		const element = target.kind === 'entry' ? document.getElementById(`call-${target.id}`) : heading;
		element?.focus();
		await announce(text());
	}

	async function resolved(id: number, outcome: 'called' | 'already_done', name: string | null) {
		const before = calls.items.map((c) => c.bookingId);
		await reload();
		await settle(before, id, () => (outcome === 'called' ? calledText(name, calls.count) : m.admin_reply_already_done()));
	}

	/**
	 * After a stale refusal: reloads, then true while the entry is still listed (it shows the new
	 * notice and the stale line); once it has left (called elsewhere, notice back to last told,
	 * deleted), the already-done path: focus moves on and the status says "Schon erledigt.".
	 */
	async function staled(id: number): Promise<boolean> {
		const before = calls.items.map((c) => c.bookingId);
		await reload();
		if (listed(id)) return true;
		await settle(before, id, () => m.admin_reply_already_done());
		return false;
	}
</script>

<section class="calls" aria-labelledby="calls-heading">
	<h2 id="calls-heading" class="section-label" tabindex="-1" bind:this={heading}>
		<span>{calls.heading}</span>
		<span class="count">{calls.count}</span>
	</h2>
	{#if calls.items.length === 0}
		<p class="empty">{calls.empty}</p>
	{:else}
		<ul class="list">
			{#each calls.items as item (item.bookingId)}
				<li>
					<CallEntry {item} failed={failedId === item.bookingId} stale={staleId === item.bookingId} onresolved={resolved} onstale={staled} />
				</li>
			{/each}
		</ul>
	{/if}
</section>
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
		/* The gap to "Antworten" below, as between the grid's columns. */
		margin-bottom: var(--space-6);
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
