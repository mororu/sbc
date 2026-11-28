<!--
	Impact dialog (EXPERIENCE "Impact dialog"; DESIGN impact-dialog, impact-mini-row; Story 3.3): a
	native <dialog> opened with showModal(), so focus is contained and the page behind is inert. Focus
	starts on "Abbrechen"; Esc or a tap on the scrim cancels; on close the caller returns focus.
	aria-labelledby is the title, aria-describedby the consequence line.
	Content: title, the "what" line, the mini row (who, heat-change line, consequence with the call
	marker, new notice), then the outcome line: on `stale` the new impact with "Die Auswirkung hat sich
	geändert …" (the caller moves focus to the title via `focusTitle`), on `past` "Hat schon begonnen."
	without a confirm button, on `failed` the inline error, focused. Confirm first, "Abbrechen" second:
	stacked on phones (bottom-anchored), side by side and right-aligned from 1024 px (centred, at most
	480 px). The panel scrolls within 90 dvh. The confirm is a POST form with the hidden `fields`,
	enhanced by the caller's `submit`. Delete booking, blocks (3.5) and the pre-heat window (3.7) use it.
	The pre-heat dialog has no mini row (`row` left out): its "what" line is then the consequence
	(`{id}-consequence`).
-->
<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import HeatChangeLine from './HeatChangeLine.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import type { ImpactRowView } from '#lib/server/impact-view.ts';

	let {
		id,
		title,
		what,
		row = null,
		confirm,
		cancel,
		destructive = false,
		action,
		fields,
		submit,
		busy = false,
		outcome = null,
		attempt = 0,
		onclose
	}: {
		/** Prefix for the element ids. */
		id: string;
		title: string;
		what: string;
		/** The mini row; without it the "what" line carries the consequence id. */
		row?: ImpactRowView | null;
		confirm: string;
		cancel: string;
		destructive?: boolean;
		/** The form action, e.g. "?/delete". */
		action: string;
		/** Hidden fields the confirm posts (the impact token). */
		fields: Record<string, string>;
		submit: SubmitFunction;
		busy?: boolean;
		/** The last refusal or failure, with its text. */
		outcome?: { kind: 'stale' | 'past' | 'failed'; text: string } | null;
		/** Counts failures, so a repeat failure is shown and focused anew. */
		attempt?: number;
		onclose?: () => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let heading: HTMLHeadingElement | undefined = $state();
	let cancelButton: HTMLButtonElement | undefined = $state();

	/** Opens the dialog modally with focus on "Abbrechen". */
	export function open() {
		if (!dialog || dialog.open) return;
		dialog.showModal();
		cancelButton?.focus();
	}

	/** Closes the dialog; ignored while the POST runs unless `force` (a programmatic close by the caller). */
	export function close(force = false) {
		if (busy && !force) return;
		if (dialog?.open) dialog.close();
	}

	/** After a stale refusal: focus on the title, never on the confirm button. */
	export function focusTitle() {
		heading?.focus();
	}

	let panel: HTMLDivElement | undefined = $state();
	let downOutside = false;

	/** True when the pointer is outside the panel's box (the scrim; not the dialog's own scrollbar). */
	const outsidePanel = (event: MouseEvent) => {
		if (!panel) return false;
		const r = panel.getBoundingClientRect();
		return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
	};

	function pointerDown(event: PointerEvent) {
		downOutside = event.target === dialog && outsidePanel(event);
	}

	/** A scrim tap: both the press and the click outside the panel, so a drag from inside never closes. */
	function scrimTap(event: MouseEvent) {
		const tap = downOutside && event.target === dialog && outsidePanel(event);
		downOutside = false;
		if (tap) close();
	}

	/** Esc: native, but not while the POST runs. */
	function cancelled(event: Event) {
		if (busy) event.preventDefault();
	}
</script>

<!-- Esc is native (held while busy); the pointer handlers are only the scrim tap. -->
<dialog
	bind:this={dialog}
	class="impact"
	aria-labelledby="{id}-title"
	aria-describedby="{id}-consequence"
	onpointerdown={pointerDown}
	onclick={scrimTap}
	oncancel={cancelled}
	{onclose}
>
	<div class="panel" bind:this={panel}>
		<h2 id="{id}-title" tabindex="-1" bind:this={heading}>{title}</h2>
		{#if outcome?.kind === 'stale'}<InlineMessage kind="info" text={outcome.text} />{/if}
		<p class="what tabular" id={row ? undefined : `${id}-consequence`}>{what}</p>
		{#if row}
			<div class="mini">
				{#if row.who}
					<p class="who tabular"><span>{row.who}</span> {#if row.line}<HeatChangeLine line={row.line} />{/if}</p>
				{/if}
				<p class="consequence" id="{id}-consequence">
					<span>{row.text}</span>
					{#if row.marker}<span class="marker" class:urgent={row.marker.urgent}>{row.marker.text}</span>{/if}
				</p>
				{#if row.notice}<p class="consequence tabular">{row.notice}</p>{/if}
			</div>
		{/if}
		{#if outcome?.kind === 'past'}<InlineMessage kind="info" text={outcome.text} focus />{/if}
		{#if outcome?.kind === 'failed'}
			{#key attempt}<InlineMessage text={outcome.text} focus />{/key}
		{/if}
		<div class="actions">
			{#if outcome?.kind !== 'past'}
				<form method="POST" {action} use:enhance={submit}>
					{#each Object.entries(fields) as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
					<button class="confirm" class:destructive type="submit" aria-disabled={busy ? 'true' : undefined}>{confirm}</button>
				</form>
			{/if}
			<!-- showModal() honours autofocus: initial focus on Abbrechen. -->
			<!-- svelte-ignore a11y_autofocus -->
			<button class="secondary" type="button" autofocus bind:this={cancelButton} onclick={() => close()}>{cancel}</button>
		</div>
	</div>
</dialog>

<style>
	.impact {
		/* Phones: bottom-anchored, full width. */
		width: 100%;
		max-width: 100%;
		max-height: 90dvh;
		margin: auto 0 0;
		padding: 0;
		overflow-y: auto;
		border: 1px solid var(--line);
		border-bottom: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--surface);
		color: var(--text);
	}
	.impact::backdrop {
		/* Light: text at 40 %; dark: the near-black scrim (tokens.css switches --scrim). */
		background: var(--scrim);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: var(--gutter);
	}
	h2 {
		font-size: var(--type-slot-time-size);
		font-weight: var(--type-slot-time-weight);
		line-height: 1.1;
	}
	.what {
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
	.mini {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		font-size: var(--type-name-size);
		font-weight: var(--type-name-weight);
		line-height: var(--type-name-leading);
	}
	.consequence {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
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
		white-space: nowrap;
	}
	.marker.urgent {
		border: 1.5px solid var(--error);
		color: var(--error);
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
	}
	form {
		display: contents;
	}
	button {
		width: 100%;
		min-height: var(--target-min);
		padding: 0 18px;
		border-radius: var(--radius);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		cursor: pointer;
	}
	.confirm {
		border: 1.5px solid transparent;
		background: var(--primary);
		color: var(--on-primary);
	}
	.confirm.destructive {
		background: var(--error);
		color: var(--on-error);
	}
	.confirm[aria-disabled='true'] {
		cursor: progress;
	}
	.secondary {
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text);
	}
	@media (min-width: 1024px) {
		.impact {
			max-width: var(--dialog-max);
			margin: auto;
			border-bottom: 1px solid var(--line);
			border-radius: var(--radius);
		}
		.actions {
			flex-direction: row;
			justify-content: flex-end;
		}
		button {
			width: auto;
		}
	}
	@media (forced-colors: active) {
		.marker,
		.mini {
			border-color: CanvasText;
		}
	}
</style>
