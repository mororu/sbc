<!--
	Settings card (EXPERIENCE "Settings card"; DESIGN settings forms; Story 3.7): a `surface` block with
	a 1 px line, the section-label `h2`, the card's own form with its fields (paired fields in two
	columns; textareas at least 132 px, resizable vertically), the note, the hours card's flag (the
	bookings outside the current times, each linked), the inline message and the secondary
	"Speichern" (`aria-disabled` while its request runs).
	Errors sit under their field (`aria-invalid`, `aria-describedby`), values kept; the caller moves
	focus to the first error (`autofocus` without JavaScript via `autofocusField`). "Gespeichert." is
	a `role="status"` line in this card; a failure is the inline "Das hat nicht geklappt …", focused.
	The caller owns the values, the result and the busy state; other cards are never touched.
-->
<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { enhance } from '$app/forms';
	import Icon from './Icon.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import TextField from './TextField.svelte';
	import type { SettingsErrorKey, SettingsErrors } from '#lib/schemas/index.ts';
	import type { SettingsCardView } from '#lib/server/settings-view.ts';

	let {
		view,
		values = $bindable(),
		errors,
		errorTexts,
		status = null,
		attempt = 0,
		busy = false,
		save,
		saved,
		failed,
		autofocusField,
		submit
	}: {
		view: SettingsCardView;
		/** The field values by name. */
		values: Record<string, string>;
		errors: SettingsErrors;
		errorTexts: Record<SettingsErrorKey, string>;
		status?: 'saved' | 'failed' | null;
		/** Counts results, so a repeat status is announced and focused anew. */
		attempt?: number;
		busy?: boolean;
		/** "Speichern" */
		save: string;
		/** "Gespeichert." */
		saved: string;
		/** "Das hat nicht geklappt …" */
		failed: string;
		/** The first invalid field after a native POST: it gets `autofocus`. */
		autofocusField?: string;
		submit: SubmitFunction;
	} = $props();

	let button: HTMLButtonElement | undefined = $state();

	/** Focus on "Speichern" (after the pre-heat dialog closes). */
	export function focusButton() {
		button?.focus();
	}

	const fieldId = (name: string) => `settings-${view.card}-${name}`;
	const errorText = (name: string) => {
		const key = errors[name];
		return key ? errorTexts[key] : null;
	};
</script>

<section class="card" aria-labelledby="settings-{view.card}-title">
	<h2 id="settings-{view.card}-title">{view.title}</h2>
	<form method="POST" action={view.action} novalidate use:enhance={submit}>
		<div class="fields" class:pair={view.paired}>
			{#each view.fields as field (field.name)}
				{#if field.kind === 'textarea'}
					{@const error = errorText(field.name)}
					<div class="field" class:invalid={!!error}>
						<label for={fieldId(field.name)}>{field.label}</label>
						<!-- `maxlength` counts UTF-16 code units with line breaks as one, as the schema does. -->
						<!-- svelte-ignore a11y_autofocus -->
						<textarea
							id={fieldId(field.name)}
							name={field.name}
							lang={field.lang}
							maxlength={field.maxlength}
							required
							bind:value={values[field.name]}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={error ? `${fieldId(field.name)}-error` : undefined}
							autofocus={autofocusField === field.name}
						></textarea>
						{#if error}
							<p class="error" id="{fieldId(field.name)}-error"><Icon name="error" /><span>{error}</span></p>
						{/if}
					</div>
				{:else}
					<TextField
						id={fieldId(field.name)}
						name={field.name}
						type={field.kind}
						label={field.label}
						min={field.min}
						max={field.max}
						step={field.step}
						inputmode={field.kind === 'number' ? 'numeric' : undefined}
						autocomplete={field.autocomplete as never}
						autocapitalize={field.kind === 'email' ? 'off' : undefined}
						spellcheck={field.kind === 'email' || field.kind === 'password' ? false : undefined}
						required
						bind:value={values[field.name]}
						error={errorText(field.name)}
						autofocus={autofocusField === field.name}
					/>
				{/if}
			{/each}
		</div>
		{#if view.note}<p class="note">{view.note}</p>{/if}
		{#if view.flag}
			<div class="flag">
				<p>{view.flag.text}</p>
				<ul>
					{#each view.flag.links as link (link.href)}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin booking href from the server -->
						<li><a href={link.href}>{link.text}</a></li>
					{/each}
				</ul>
			</div>
		{/if}
		{#key attempt}
			{#if status === 'saved'}
				<InlineMessage kind="info" text={saved} />
			{:else if status === 'failed'}
				<InlineMessage text={failed} focus />
			{/if}
		{/key}
		<button class="secondary" type="submit" bind:this={button} aria-disabled={busy ? 'true' : undefined}>{save}</button>
	</form>
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: var(--space-5);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	h2 {
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		line-height: 1.4;
		text-transform: uppercase;
	}
	form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		width: 100%;
	}
	.fields.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}
	.field {
		display: flex;
		flex-direction: column;
	}
	label {
		margin-bottom: var(--space-2);
		font-size: var(--type-field-label-size);
		font-weight: var(--type-field-label-weight);
		line-height: var(--type-field-label-leading);
		color: var(--muted);
	}
	textarea {
		min-height: 132px;
		padding: var(--space-2) 0;
		border: 0;
		border-bottom: 1px solid var(--line-strong);
		border-radius: var(--radius-none);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--type-field-size);
		font-weight: var(--type-field-weight);
		line-height: 1.5;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-bottom: var(--border-field-focus);
		margin-bottom: -1px;
	}
	.invalid textarea {
		border-bottom: 2px solid var(--error);
		margin-bottom: -1px;
	}
	.invalid textarea:focus {
		border-bottom: var(--border-field-focus);
	}
	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-2);
		font-size: var(--type-field-error-size);
		font-weight: var(--type-field-error-weight);
		line-height: var(--type-field-error-leading);
		color: var(--error);
	}
	.note {
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	.flag {
		padding-left: var(--space-3);
		border-left: 2px solid var(--text);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.flag ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.flag a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	.card :global(.inline-message) {
		width: 100%;
	}
	.secondary {
		min-height: var(--target-min);
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
		textarea:focus {
			outline: 2px solid Highlight;
		}
	}
</style>
