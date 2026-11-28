<!--
	Block form (EXPERIENCE "Block form"; UX-DR40, UX-DR56; Story 3.5), capped at --detail-max: the
	back link to Blocks, the h1 "Neuer Block", Datum, Von and Bis (native date and time inputs, the
	times in 5-minute steps), the reason as a segmented control (Reinigung · Wartung · Privat, native
	radios in a fieldset) and "Prüfen".
	"Prüfen" posts to `?/check`, the shared schema runs on the server (AD-16): invalid fields or a
	start already passed show their error inline, the values kept and focus on the first error
	(`autofocus` without JavaScript); an overlap or a block inside a changeover shows the refusal above
	the button, focused. Otherwise the save dialog "Block speichern?" opens (JavaScript only: without
	it "Prüfen" does nothing beyond validation, accepted as in 3.3). Its confirm posts the values and
	the impact token to `?/save`:
	- success: `/admin/blocks?saved` ("Gespeichert."), focus on its h1;
	- `stale`: the dialog shows the new impact with the stale line, focus on its title;
	- `past` or `conflict`: the dialog closes and the form shows the error or refusal, focused;
	- lock timeout or network error: the inline "Das hat nicht geklappt …" in the dialog, focused.
	The dialog posts the values "Prüfen" checked, not the live fields: a field changed while the check
	ran opens no dialog, and a field changed afterwards drops it (check again). The decisions come
	from `#lib/blocks-outcome.ts` (`checkStep`, `saveStep`, `dialogOutdated`).
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import Icon from '#lib/components/Icon.svelte';
	import ImpactDialog from '#lib/components/ImpactDialog.svelte';
	import InlineMessage from '#lib/components/InlineMessage.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { checkStep, dialogOutdated, saveStep, type BlockFormData, type FormProblem } from '#lib/blocks-outcome.ts';
	import { BLOCK_FIELDS, type BlockErrors, type BlockField, type BlockFormReason, type BlockValues } from '#lib/schemas/index.ts';
	import type { BlockDialogView } from '#lib/server/block-view.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const view = $derived(data.view);

	/** The result of a native POST (no JavaScript), else the fresh form. */
	function initial() {
		const result = (form ?? null) as BlockFormData | null;
		return {
			values: { ...data.view.defaults, ...(result?.values ?? {}) },
			errors: result?.errors ?? {},
			refusal: result?.refusal ?? null
		};
	}
	const start = initial();

	let date = $state(start.values.date);
	let from = $state(start.values.start);
	let to = $state(start.values.end);
	let reason = $state((start.values.reason || 'cleaning') as BlockFormReason);
	let errors: BlockErrors = $state(start.errors);
	let refusal: string | null = $state(start.refusal);
	/** Counts shown problems, so a repeat is focused and announced anew. */
	let attempt = $state(0);
	let checking = $state(false);
	/** A failed "Prüfen" (network): the inline failure above the button. */
	let checkFailed = $state(false);

	let dialog: ImpactDialog | undefined = $state();
	let dialogView: BlockDialogView | null = $state(null);
	/** The values "Prüfen" checked: the dialog describes and saves exactly these. */
	let checked: BlockValues | null = $state(null);
	let dialogOpen = $state(false);
	let checkButton: HTMLButtonElement | undefined = $state();
	let saving = $state(false);
	let outcome: 'stale' | 'failed' | null = $state(null);
	let saveAttempt = $state(0);
	let programmaticClose = false;

	const current = (): BlockValues => ({ date, start: from, end: to, reason });

	// A field changed after "Prüfen" (the dialog is closed): the dialog no longer fits, drop it.
	$effect(() => {
		if (!dialogOpen && dialogOutdated(checked, current())) {
			dialogView = null;
			checked = null;
		}
	});

	/** Without JavaScript the first invalid field gets `autofocus`. */
	const firstInvalid = $derived(BLOCK_FIELDS.find((f) => errors[f]));
	const errorText = (field: BlockField) => {
		const key = errors[field];
		return key ? view.errors[key] : null;
	};

	/** Shows errors or a refusal and moves focus to the first problem. */
	async function showProblem(problem: FormProblem) {
		errors = problem.errors;
		refusal = problem.refusal;
		checkFailed = false;
		attempt++;
		await tick();
		const first = BLOCK_FIELDS.find((f) => errors[f]);
		if (first === 'reason') document.querySelector<HTMLInputElement>('input[name="reason"]:checked, input[name="reason"]')?.focus();
		else if (first) document.getElementById(`block-${first}`)?.focus();
		// The refusal message focuses itself (InlineMessage `focus`).
	}

	const check: SubmitFunction = ({ cancel }) => {
		if (checking || saving) {
			cancel();
			return;
		}
		checking = true;
		const submitted = current();
		return async ({ result }) => {
			try {
				const step = checkStep(result, submitted, current());
				if (step.kind === 'dialog') {
					errors = {};
					refusal = null;
					checkFailed = false;
					checked = step.checked;
					dialogView = step.dialog;
					outcome = null;
					programmaticClose = false;
					await tick();
					dialogOpen = true;
					dialog?.open();
				} else if (step.kind === 'problem') {
					await showProblem(step.problem);
				} else if (step.kind === 'failed') {
					checkFailed = true;
					attempt++;
				}
				// `stale-input`: a field changed while checking; the admin checks again.
			} finally {
				checking = false;
			}
		};
	};

	const save: SubmitFunction = ({ cancel }) => {
		if (saving) {
			cancel();
			return;
		}
		saving = true;
		outcome = null;
		return async ({ result, update }) => {
			try {
				const step = saveStep(result);
				if (step.kind === 'redirect') {
					await update();
					await tick();
					document.querySelector<HTMLElement>('main h1')?.focus();
				} else if (step.kind === 'stale') {
					dialogView = step.dialog;
					outcome = 'stale';
					await tick();
					dialog?.focusTitle();
				} else if (step.kind === 'problem') {
					// Past or a conflict since "Prüfen": the dialog closes, the form shows why.
					programmaticClose = true;
					dialog?.close(true);
					await showProblem(step.problem);
				} else {
					outcome = 'failed';
					saveAttempt++;
				}
			} finally {
				saving = false;
			}
		};
	};

	function closed() {
		dialogOpen = false;
		outcome = null;
		if (programmaticClose) {
			programmaticClose = false;
			return;
		}
		checkButton?.focus();
	}
</script>

<PageTitle title={view.title} />

<article class="block-form">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin href from the server -->
	<a class="back" href={view.back.href}><Icon name="chevron-left" size="row" />{view.back.text}</a>
	<h1 tabindex="-1">{view.title}</h1>

	<form method="POST" action="?/check" novalidate use:enhance={check}>
		<TextField
			id="block-date"
			name="date"
			type="date"
			label={view.labels.date}
			required
			bind:value={date}
			error={errorText('date')}
			autofocus={firstInvalid === 'date'}
		/>
		<div class="times">
			<TextField
				id="block-start"
				name="start"
				type="time"
				step="300"
				label={view.labels.start}
				required
				bind:value={from}
				error={errorText('start')}
				autofocus={firstInvalid === 'start'}
			/>
			<TextField
				id="block-end"
				name="end"
				type="time"
				step="300"
				label={view.labels.end}
				required
				bind:value={to}
				error={errorText('end')}
				autofocus={firstInvalid === 'end'}
			/>
		</div>
		<SegmentedControl
			id="block-reason"
			legend={view.labels.reason}
			name="reason"
			options={view.reasons.map((r) => ({ value: r.value, text: r.text }))}
			bind:value={reason}
			describedby={errors.reason ? 'block-reason-error' : undefined}
		>
			{#snippet notes()}
				{#if errors.reason}<p class="error" id="block-reason-error">{errorText('reason')}</p>{/if}
			{/snippet}
		</SegmentedControl>

		{#key attempt}
			{#if refusal}
				<InlineMessage text={refusal} focus />
			{:else if checkFailed}
				<InlineMessage text={view.failed} focus />
			{/if}
		{/key}

		<button class="primary" type="submit" bind:this={checkButton} aria-disabled={checking ? 'true' : undefined}
			>{view.labels.check}</button
		>
	</form>

	{#if dialogView && checked}
		<ImpactDialog
			bind:this={dialog}
			id="save-block"
			title={dialogView.title}
			what={dialogView.what}
			row={dialogView.row}
			confirm={dialogView.confirm}
			cancel={dialogView.cancel}
			action="?/save"
			fields={{ date: checked.date, start: checked.start, end: checked.end, reason: checked.reason, impactToken: dialogView.token }}
			submit={save}
			busy={saving}
			outcome={outcome ? { kind: outcome, text: dialogView.messages[outcome] } : null}
			attempt={saveAttempt}
			onclose={closed}
		/>
	{/if}
</article>

<style>
	.block-form {
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
	h1 {
		margin-top: var(--space-2);
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		margin-top: var(--space-5);
	}
	.times {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}
	.error {
		margin-top: var(--space-2);
		color: var(--error);
		font-size: var(--type-field-error-size);
		font-weight: var(--type-field-error-weight);
		line-height: var(--type-field-error-leading);
	}
	.primary {
		width: 100%;
		min-height: var(--target-min);
		padding: 0 18px;
		border: 1.5px solid transparent;
		border-radius: var(--radius);
		background: var(--primary);
		color: var(--on-primary);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		cursor: pointer;
	}
	.primary[aria-disabled='true'] {
		cursor: progress;
	}
	@media (min-width: 1024px) {
		.primary {
			width: auto;
			align-self: flex-start;
		}
	}
</style>
