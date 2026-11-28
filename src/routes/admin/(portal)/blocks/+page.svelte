<!--
	Blocks (EXPERIENCE "Blocks"; UX-DR40, UX-DR66; Story 3.5): the h1 "Blocks", the polite status
	("Gespeichert." after a save, "Block gelöscht." after a delete, "Schon erledigt." when another
	admin deleted the block first), "Neuer Block", and the upcoming blocks in start order
	("Mo 11. Januar · 09:00–11:00 · Reinigung"), or "Keine Blocks geplant.". A block that has not
	started has the destructive "Block löschen" (shown after hydration: the dialog needs JavaScript),
	which opens its impact dialog; a running one says "Hat schon begonnen.".
	The dialog's confirm posts the block id and the impact token to `?/delete`:
	- success: `/admin/blocks?deleted`, focus on the h1;
	- `stale`: the page data is reloaded, the dialog shows the new impact with the stale line, focus on its title;
	- `past`: "Hat schon begonnen." in the dialog, no confirm; on close the page reloads;
	- `not_found`: the page data is reloaded (the row is gone), "Schon erledigt." in the status, focus on the h1;
	- lock timeout, network error or a failed reload: the inline "Das hat nicht geklappt …", focused.
	The decisions come from `#lib/blocks-outcome.ts` (`deleteStep`, `afterDeleteReload`). The status
	flags `?saved` / `?deleted` are announced on arrival and then removed from the address
	(`withoutBlocksFlags`, a shallow `goto`); a repeated status is announced again. Deleting needs
	JavaScript (the dialog), as accepted in Story 3.3.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { afterDeleteReload, deleteStep, withoutBlocksFlags } from '#lib/blocks-outcome.ts';
	import ImpactDialog from '#lib/components/ImpactDialog.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const view = $derived(data.view);

	let dialogs: Record<number, ImpactDialog | undefined> = $state({});
	let triggers: Record<number, HTMLButtonElement | undefined> = $state({});
	/** The block whose dialog is open (or was last), for the outcome line. */
	let active: number | null = $state(null);
	let busy = $state(false);
	let outcome: 'stale' | 'past' | 'failed' | null = $state(null);
	let attempt = $state(0);
	let mounted = $state(false);
	let programmaticClose = false;

	/**
	 * The polite status. The server render shows the flag's text; after hydration it is set by
	 * `announce` only, so a reload of the page data never brings a flag's text back.
	 */
	let status: string = $state((() => data.view.status ?? '')());

	onMount(() => {
		mounted = true;
	});

	/** Empties the live region first, so the same text twice in a row is announced again. */
	async function announce(text: string) {
		status = '';
		await tick();
		status = text;
	}

	// On arrival (also after a save or a delete): announce the flag's status, then drop the flag
	// from the address, so a reload or a bookmark does not show it again. The text stays.
	afterNavigate((nav) => {
		// The shallow replace below fires afterNavigate again: skip it, so nothing is announced twice.
		if (nav.shallow) return;
		const clean = withoutBlocksFlags(new URL((page.shallow?.url ?? page.url).href));
		if (!clean) return;
		if (view.status) void announce(view.status);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current page, without its flags
		void goto(clean, { shallow: true, replace: true, state: page.state });
	});

	const focusHeading = () => document.querySelector<HTMLElement>('main h1')?.focus();
	const deletable = (id: number) => view.rows.some((r) => r.id === id && r.delete !== null);

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

	function openDialog(id: number) {
		active = id;
		outcome = null;
		// A dialog that unmounted with its row never fired `close`: start clean.
		programmaticClose = false;
		dialogs[id]?.open();
	}

	async function closed(id: number) {
		const wasPast = outcome === 'past';
		outcome = null;
		if (programmaticClose) {
			programmaticClose = false;
			return;
		}
		if (wasPast) {
			try {
				await invalidateAll();
			} catch {
				// Keep the page as it is.
			}
			await tick();
		}
		const trigger = triggers[id];
		if (trigger?.isConnected) trigger.focus();
		else focusHeading();
	}

	const submit =
		(id: number): SubmitFunction =>
		({ cancel }) => {
			if (busy) {
				cancel();
				return;
			}
			busy = true;
			outcome = null;
			return async ({ result, update }) => {
				try {
					const step = deleteStep(result);
					if (step.kind === 'redirect') {
						await update();
						await tick();
						focusHeading();
						return;
					}
					if (step.kind === 'past') {
						outcome = 'past';
						return;
					}
					if (step.kind === 'failed') {
						outcome = 'failed';
						attempt++;
						return;
					}
					if (!(await reload())) return;
					await tick();
					const next = afterDeleteReload(step.code, deletable(id));
					if (next.dialog === 'close' && dialogs[id]) {
						// The row's dialog may have unmounted with it; otherwise it closes now.
						programmaticClose = true;
						dialogs[id]?.close(true);
					}
					outcome = next.outcome;
					if (next.status === 'gone') void announce(view.messages.gone);
					await tick();
					if (next.focus === 'title') dialogs[id]?.focusTitle();
					else focusHeading();
				} finally {
					busy = false;
				}
			};
		};
</script>

<PageTitle title={view.title} />

<div class="blocks">
	<h1 tabindex="-1">{view.title}</h1>
	<div class="status-slot">
		<p role="status" aria-live="polite">{status}</p>
	</div>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin href from the server -->
	<a class="create" href={view.create.href}>{view.create.text}</a>

	{#if view.empty}
		<p class="empty">{view.empty}</p>
	{:else}
		<ul class="rows">
			{#each view.rows as row (row.id)}
				<li class="row">
					<p class="text">{row.text}</p>
					{#if row.started}<p class="note">{row.started}</p>{/if}
					{#if row.delete}
						{#if mounted}
							<button class="destructive" type="button" bind:this={triggers[row.id]} onclick={() => openDialog(row.id)}
								>{row.delete.confirm}</button
							>
						{/if}
						<ImpactDialog
							bind:this={dialogs[row.id]}
							id="delete-block-{row.id}"
							title={row.delete.title}
							what={row.delete.what}
							row={row.delete.row}
							confirm={row.delete.confirm}
							cancel={row.delete.cancel}
							destructive
							action="?/delete"
							fields={{ blockId: String(row.id), impactToken: row.delete.token }}
							submit={submit(row.id)}
							busy={busy && active === row.id}
							outcome={outcome && active === row.id ? { kind: outcome, text: row.delete.messages[outcome] } : null}
							{attempt}
							onclose={() => closed(row.id)}
						/>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.blocks {
		max-width: var(--detail-max);
	}
	h1 {
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	.status-slot {
		margin-top: var(--space-1);
		min-height: calc(var(--type-note-size) * var(--type-note-leading));
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	.create {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: var(--target-min);
		margin-top: var(--space-3);
		padding: 0 18px;
		border: 1.5px solid transparent;
		border-radius: var(--radius);
		background: var(--primary);
		color: var(--on-primary);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		text-decoration: none;
	}
	.empty {
		margin-top: var(--space-5);
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
	.rows {
		list-style: none;
		margin: var(--space-5) 0 0;
		padding: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		min-height: var(--target-min);
		padding: 14px 0;
		border-bottom: 1px solid var(--line);
	}
	.text {
		min-width: 0;
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
		font-variant-numeric: tabular-nums;
	}
	.note {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.destructive {
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
		.create {
			width: auto;
		}
	}
</style>
