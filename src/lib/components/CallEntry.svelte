<!--
	Call list entry (DESIGN.md call-list entry; EXPERIENCE "Call list entry"; UX-DR31; Story 3.6): a
	box with the marker (*Anruf nötig*: 1.5 px error border and text; *optional*: line-strong border,
	muted text; always text), the h3 "17:15 · Tom Brunner" (tabindex -1: focus lands here when the
	entry before it leaves), the muted date line, the heat-change line, "NEUER HINWEIS" over the
	notice to give, the muted "zuletzt gesagt: …", the reasons, the code line, then the `tel:` link
	(phone icon, the number as text, 44 px) and the secondary "Angerufen"; link and button wrap.
	- "Angerufen" posts the booking id and the shown notice token to `?/called` (`use:enhance`;
	  `aria-disabled` while it runs, further taps are ignored). The result is mapped by `callOutcome`:
	  called or already done calls `onresolved` (the list refreshes, moves focus and announces); stale
	  calls `onstale` (the list refreshes): while the entry is still listed it shows the new notice
	  and the stale line, focused; once it has left, the list takes the already-done path. A
	  redirect (an ended session) is applied; a failed command (503, an error result or a network
	  error): the inline "Das hat nicht geklappt …" at the entry, focused; the entry stays. The stale
	  and the failure line never show together: the latest result wins.
	- `failed` / `stale` (without JavaScript): the page's `form` names this entry; the same line
	  shows, autofocused, until the first enhanced result replaces it.
-->
<script lang="ts">
	import { applyAction, enhance, type SubmitFunction } from '$app/forms';
	import HeatChangeLine from './HeatChangeLine.svelte';
	import Icon from './Icon.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { callOutcome, entryLine, type EntryLine } from '#lib/call-outcome.ts';
	import type { CallItemView } from '#lib/server/call-view.ts';

	let {
		item,
		failed = false,
		stale = false,
		onresolved,
		onstale
	}: {
		item: CallItemView;
		/** A native POST (no JavaScript) for this entry failed: the page's `form`. */
		failed?: boolean;
		/** A native POST for this entry was refused as stale: the page's `form`. */
		stale?: boolean;
		/** Called after the command answered called or already done; refreshes the list. Must not throw. */
		onresolved: (id: number, outcome: 'called' | 'already_done', firstName: string | null) => Promise<void>;
		/** Called after a stale refusal; refreshes the list. True while the entry is still listed. Must not throw. */
		onstale: (id: number) => Promise<boolean>;
	} = $props();

	let running = $state(false);
	/** Set by the first enhanced result: from then on the native `failed` / `stale` props no longer show. */
	let dismissed = $state(false);
	/** The line an enhanced result left: never both, the latest wins. */
	let line = $state<EntryLine>(null);
	/** Counts results, so a repeated line mounts (and focuses) again. */
	let attempt = $state(0);
	const shown = $derived(entryLine({ dismissed, line, failed, stale }));

	const show = (next: EntryLine) => {
		dismissed = true;
		line = next;
		attempt++;
	};

	const submit: SubmitFunction = ({ cancel }) => {
		if (running) {
			cancel();
			return;
		}
		running = true;
		return async ({ result }) => {
			try {
				const outcome = callOutcome(result);
				if (outcome === 'redirect') {
					show(null);
					await applyAction(result).catch(() => show('failed'));
				} else if (outcome === 'failed') show('failed');
				else if (outcome === 'stale') {
					show(null);
					// Still listed: the entry shows the new notice and the stale line; else the list moved on.
					if (await onstale(item.bookingId)) show('stale');
				} else {
					show(null);
					const data = result.type === 'success' ? (result.data as { firstName?: string | null } | undefined) : undefined;
					await onresolved(item.bookingId, outcome, data?.firstName ?? item.firstName);
				}
			} finally {
				running = false;
			}
		};
	};
</script>

<article class="entry">
	<p class="marker" class:urgent={item.marker.urgent}>{item.marker.text}</p>
	<h3 id="call-{item.bookingId}" class="name tabular" tabindex="-1">{item.heading}</h3>
	<p class="muted tabular">{item.dateLine}</p>
	{#if shown === 'stale'}
		{#key attempt}
			<div class="message"><InlineMessage kind="info" text={m.admin_call_stale()} focus /></div>
		{/key}
	{/if}
	{#if item.line}<p class="line"><HeatChangeLine line={item.line} /></p>{/if}
	{#if item.notice}
		<div class="notice">
			<p class="label">{m.admin_call_new_notice()}</p>
			<p class="notice-text tabular">{item.notice}</p>
		</div>
	{/if}
	{#if item.lastTold}<p class="muted tabular">{item.lastTold}</p>{/if}
	{#each item.reasons as reason, index (index)}<p class="reason">{reason}</p>{/each}
	{#if item.code}<p class="code tabular">{item.code}</p>{/if}
	{#if shown === 'failed'}
		{#key attempt}
			<div class="message"><InlineMessage text={m.admin_action_failed()} focus /></div>
		{/key}
	{/if}
	<div class="actions">
		{#if item.tel}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a tel: link -->
			<a class="tel tabular" href={item.tel.href}><Icon name="phone" /><span>{item.tel.text}</span></a>
		{/if}
		<form method="POST" action="?/called" use:enhance={submit}>
			<input type="hidden" name="bookingId" value={item.bookingId} />
			<input type="hidden" name="notice" value={item.token} />
			<button class="secondary" type="submit" aria-disabled={running ? 'true' : undefined}>{m.admin_call_called()}</button>
		</form>
	</div>
</article>

<style>
	.entry {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: 16px 14px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
	}
	.entry > :global(*) {
		max-width: 100%;
	}
	.marker {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		color: var(--muted);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		line-height: 1.2;
		text-transform: uppercase;
	}
	.marker.urgent {
		border: 1.5px solid var(--error);
		color: var(--error);
	}
	.name {
		font-size: var(--type-name-size);
		font-weight: var(--type-name-weight);
		line-height: var(--type-name-leading);
		overflow-wrap: anywhere;
	}
	.name:focus {
		outline-offset: 2px;
	}
	.tabular {
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
		line-height: var(--type-body-sm-leading);
	}
	.message {
		align-self: stretch;
		margin-top: var(--space-1);
	}
	.notice {
		margin-top: var(--space-1);
	}
	.label {
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.notice-text {
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
	}
	.reason,
	.code {
		font-size: var(--type-body-sm-size);
		font-weight: 600;
		line-height: var(--type-body-sm-leading);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		align-self: stretch;
		gap: 8px 16px;
		margin-top: var(--space-1);
	}
	.tel {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		min-width: 0;
		color: var(--text);
		overflow-wrap: anywhere;
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	form {
		display: contents;
	}
	.secondary {
		min-height: var(--target-min);
		min-width: var(--target-min);
		padding: 0 18px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		cursor: pointer;
	}
	.secondary[aria-disabled='true'] {
		cursor: progress;
	}
	@media (forced-colors: active) {
		.entry,
		.marker {
			border-color: CanvasText;
		}
	}
</style>
