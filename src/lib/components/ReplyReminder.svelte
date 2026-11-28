<!--
	Reply reminder (DESIGN.md reply-reminder; EXPERIENCE "Reply reminder"; Story 3.4): a dashed
	line-strong box with the guest's name (h3, tabindex -1: focus lands here when the reminder before
	it is done), the muted "Di 12. Januar, 16:00–17:00 · gelöscht", the address as text inside a
	`mailto:` link with the mail icon (subject and body prefilled in the booking's language), and the
	secondary buttons "Text kopieren" and "Erledigt".
	- "Text kopieren": `navigator.clipboard.writeText`, then `announce("Kopiert.")`; when the clipboard
	  is missing or refuses, a readonly textarea with the text appears, focused and selected, with the hint.
	- "Erledigt" posts the booking id to `?/replyDone` (`use:enhance`; `aria-disabled` while it runs,
	  further taps are ignored). The result is mapped by `replyOutcome`: done or already done calls
	  `onresolved` (the list refreshes, moves focus and announces; a failing refresh never turns a
	  written result into an error); a redirect (an ended session) is applied; a failed command (503,
	  an error result or a network error): the inline "Das hat nicht geklappt …" at the reminder,
	  focused; the reminder stays.
	- `failed` (without JavaScript): the page's `form` says the last native POST for this reminder
	  failed; the same inline line shows, autofocused.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { applyAction, enhance, type SubmitFunction } from '$app/forms';
	import Icon from './Icon.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { replyOutcome } from '#lib/reply-outcome.ts';
	import type { ReplyReminderView } from '#lib/server/reply-view.ts';

	let {
		reminder,
		failed = false,
		onresolved,
		announce
	}: {
		reminder: ReplyReminderView;
		/** A native POST (no JavaScript) for this reminder failed: the page's `form`. */
		failed?: boolean;
		/** Called after the command answered done or already done; refreshes the list. Must not throw. */
		onresolved: (id: number, outcome: 'done' | 'already_done') => Promise<void>;
		/** Puts a line in the list's polite status region. */
		announce: (text: string) => void;
	} = $props();

	let running = $state(false);
	/** Counts failures, so a repeated failure mounts (and focuses) the message again. */
	let failures = $state(0);
	let fallback = $state(false);
	let textarea: HTMLTextAreaElement | undefined = $state();

	async function copy() {
		try {
			if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
			await navigator.clipboard.writeText(reminder.copyText);
			fallback = false;
			announce(m.admin_reply_copied());
		} catch {
			fallback = true;
			await tick();
			textarea?.focus();
			textarea?.select();
		}
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (running) {
			cancel();
			return;
		}
		running = true;
		return async ({ result }) => {
			try {
				const outcome = replyOutcome(result);
				if (outcome === 'redirect') await applyAction(result).catch(() => failures++);
				else if (outcome === 'failed') failures++;
				// Written (or nothing left): the refresh and focus are the list's and never show the failure.
				else await onresolved(reminder.id, outcome);
			} finally {
				running = false;
			}
		};
	};
</script>

<article class="reminder">
	<h3 id="reply-{reminder.id}" class="name" tabindex="-1">{reminder.name}</h3>
	<p class="when">{reminder.when}</p>
	{#if failures > 0 || failed}
		{#key failures}
			<div class="message"><InlineMessage text={m.admin_action_failed()} focus /></div>
		{/key}
	{/if}
	<div class="actions">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a mailto: link -->
		<a class="mail" href={reminder.href}><Icon name="mail" /><span>{reminder.email}</span></a>
		<div class="buttons">
			<button class="secondary" type="button" onclick={copy}>{m.admin_reply_copy()}</button>
			<form method="POST" action="?/replyDone" use:enhance={submit}>
				<input type="hidden" name="bookingId" value={reminder.id} />
				<button class="secondary" type="submit" aria-disabled={running ? 'true' : undefined}>{m.admin_reply_done()}</button>
			</form>
		</div>
	</div>
	{#if fallback}
		<div class="fallback">
			<label for="reply-text-{reminder.id}">{m.admin_reply_copy_hint()}</label>
			<textarea id="reply-text-{reminder.id}" readonly rows="9" bind:this={textarea}>{reminder.copyText}</textarea>
		</div>
	{/if}
</article>

<style>
	.reminder {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px 14px;
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius);
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
	.when {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
		line-height: var(--type-body-sm-leading);
		font-variant-numeric: tabular-nums;
	}
	.message {
		margin-top: var(--space-1);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
	}
	.mail {
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
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
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
	.fallback {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.fallback label {
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	textarea {
		width: 100%;
		padding: 10px;
		border: var(--border-control);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--type-body-sm-size);
		line-height: var(--type-body-sm-leading);
		resize: vertical;
	}
	@media (forced-colors: active) {
		.reminder {
			border-color: CanvasText;
		}
	}
</style>
