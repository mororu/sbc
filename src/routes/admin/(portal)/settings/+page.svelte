<!--
	Settings (EXPERIENCE "Settings card"; mockup key-admin-settings; FR-15, FR-20; Stories 3.7, 3.8):
	the visually hidden h1 "Einstellungen", then one `SettingsCard` per group (Saison, Betriebszeiten,
	Wechselzeit, Buchungshorizont, Vorheizzeit, Schlüsselbox-Code, Anleitung DE / EN, Kontaktadresse,
	Passwort), a grid: one column with a 20 px gap on phones, two equal columns from
	1024 px (rows aligned to the top, 20 px gaps; the shell caps the page at --admin-max). A grid, not
	CSS columns, so a card never jumps column when a flag or an error appears. Each card is its own form with its own "Speichern" and its own result:
	- saved: "Gespeichert." in that card (a polite status), the page data reloads (the flags, the
	  season card's target after "Nächste Saison anlegen", the old-code list);
	- invalid: the errors under the fields, values kept, focus on the first error;
	- failure (a lock timeout, an error result, a network error): the inline "Das hat nicht geklappt …"
	  in that card, focused. Other cards keep what they show.
	The pre-heat card's "Speichern" checks first (`?/preheatCheck`): an unchanged window is saved at
	once; otherwise the impact dialog "Vorheizzeit ändern?" opens with "30–40 → 40–50 Minuten · {n}
	Buchungen bekommen …". Its "Speichern" posts the checked window and the token to `?/preheat`:
	saved closes it ("Gespeichert." in the card, focus back on the card's button); `stale` shows the
	new count with the stale line, focus on the title; a failure shows the inline error in the dialog.
	Without JavaScript the cards still save (the result comes back as `form`, first error autofocused);
	the pre-heat window needs the dialog, so without it the check only validates (as in 3.3 and 3.5).
	The decisions come from `#lib/settings-outcome.ts`.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { applyAction, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ImpactDialog from '#lib/components/ImpactDialog.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import SettingsCard from '#lib/components/SettingsCard.svelte';
	import { cardOutcome, cardStep, firstErrorField, preheatSaveStep, type SettingsActionResult } from '#lib/settings-outcome.ts';
	import type { SettingsCard as Card, SettingsErrors } from '#lib/schemas/index.ts';
	import type { PreheatDialogView, SettingsCardView } from '#lib/server/settings-view.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const view = $derived(data.view);

	type CardState = {
		values: Record<string, string>;
		errors: SettingsErrors;
		status: 'saved' | 'failed' | null;
		attempt: number;
		busy: boolean;
	};

	const prefill = (card: SettingsCardView) => Object.fromEntries(card.fields.map((f) => [f.name, f.value]));

	/** Each card's state: the prefill, or the result of a native POST (no JavaScript) for its card. */
	function initial() {
		const states = {} as Record<Card, CardState>;
		let focus: { card: Card; field: string } | null = null;
		for (const card of data.view.cards) {
			const outcome = cardOutcome(form, card.card);
			states[card.card] = {
				values: { ...prefill(card), ...(outcome?.values ?? {}) },
				errors: outcome?.errors ?? {},
				status: outcome?.status ?? null,
				attempt: 0,
				busy: false
			};
			const field = outcome ? firstErrorField(card.fields.map((f) => f.name), outcome.errors) : undefined;
			if (field) focus = { card: card.card, field };
		}
		return { states, focus };
	}
	const start = initial();
	let cards = $state(start.states);
	/** The first invalid field after a native POST: `autofocus`. */
	const nativeFocus = start.focus;

	let cardRefs: Partial<Record<Card, SettingsCard>> = $state({});

	let dialog: ImpactDialog | undefined = $state();
	let dialogView: PreheatDialogView | null = $state(null);
	let saving = $state(false);
	let outcome: 'stale' | 'failed' | null = $state(null);
	let saveAttempt = $state(0);
	let programmaticClose = false;

	/**
	 * "Gespeichert." in the card, then fresh page data; the card's fields take the stored values. The
	 * save stands even if the reload fails: the card keeps "Gespeichert." and the typed values (the
	 * password field is emptied either way).
	 */
	async function showSaved(card: Card) {
		const state = cards[card];
		state.errors = {};
		state.status = 'saved';
		state.attempt++;
		try {
			await invalidateAll();
		} catch {
			if (card === 'password') state.values = { password: '' };
			return;
		}
		const fresh = view.cards.find((c) => c.card === card);
		if (fresh) state.values = prefill(fresh);
	}

	/** The errors under the fields, values kept, focus on the first error. */
	async function showErrors(card: Card, errors: SettingsErrors) {
		const state = cards[card];
		state.errors = errors;
		state.status = null;
		state.attempt++;
		await tick();
		const fields = view.cards.find((c) => c.card === card)?.fields.map((f) => f.name) ?? [];
		const first = firstErrorField(fields, errors);
		if (first) document.getElementById(`settings-${card}-${first}`)?.focus();
	}

	/** The inline failure in the card; it focuses itself. */
	function showFailed(card: Card) {
		const state = cards[card];
		state.status = 'failed';
		state.attempt++;
	}

	async function openDialog(next: PreheatDialogView) {
		const state = cards.preheat;
		state.errors = {};
		state.status = null;
		dialogView = next;
		outcome = null;
		programmaticClose = false;
		await tick();
		dialog?.open();
	}

	function submitFor(card: Card): SubmitFunction {
		return ({ cancel }) => {
			const state = cards[card];
			if (state.busy || (card === 'preheat' && saving)) {
				cancel();
				return;
			}
			state.busy = true;
			return async ({ result }) => {
				try {
					const step = cardStep(result as SettingsActionResult, card);
					if (step.kind === 'redirect') await applyAction(result);
					else if (step.kind === 'saved') await showSaved(card);
					else if (step.kind === 'errors') await showErrors(card, step.errors);
					else if (step.kind === 'dialog') await openDialog(step.dialog);
					else showFailed(card);
				} finally {
					state.busy = false;
				}
			};
		};
	}

	function closeProgrammatically() {
		programmaticClose = true;
		dialog?.close(true);
	}

	const savePreheat: SubmitFunction = ({ cancel }) => {
		if (saving) {
			cancel();
			return;
		}
		saving = true;
		outcome = null;
		return async ({ result }) => {
			try {
				const step = preheatSaveStep(result as SettingsActionResult);
				if (step.kind === 'redirect') {
					closeProgrammatically();
					await applyAction(result);
				} else if (step.kind === 'saved') {
					closeProgrammatically();
					cardRefs.preheat?.focusButton();
					await showSaved('preheat');
				} else if (step.kind === 'stale') {
					dialogView = step.dialog;
					outcome = 'stale';
					await tick();
					dialog?.focusTitle();
				} else if (step.kind === 'errors') {
					closeProgrammatically();
					await showErrors('preheat', step.errors);
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
		outcome = null;
		dialogView = null;
		if (programmaticClose) {
			programmaticClose = false;
			return;
		}
		cardRefs.preheat?.focusButton();
	}
</script>

<PageTitle title={view.title} />

<h1 class="visually-hidden" tabindex="-1">{view.title}</h1>

<div class="cards">
	{#each view.cards as card (card.card)}
		<SettingsCard
			bind:this={cardRefs[card.card]}
			view={card}
			bind:values={cards[card.card].values}
			errors={cards[card.card].errors}
			errorTexts={view.errors}
			status={cards[card.card].status}
			attempt={cards[card.card].attempt}
			busy={cards[card.card].busy}
			save={view.save}
			saved={view.saved}
			failed={view.failed}
			autofocusField={nativeFocus?.card === card.card ? nativeFocus.field : undefined}
			submit={submitFor(card.card)}
		/>
	{/each}
</div>

{#if dialogView}
	<ImpactDialog
		bind:this={dialog}
		id="preheat"
		title={dialogView.title}
		what={dialogView.what}
		confirm={dialogView.confirm}
		cancel={dialogView.cancel}
		action="?/preheat"
		fields={{ min: dialogView.values.min, max: dialogView.values.max, impactToken: dialogView.token }}
		submit={savePreheat}
		busy={saving}
		outcome={outcome ? { kind: outcome, text: dialogView.messages[outcome] } : null}
		attempt={saveAttempt}
		onclose={closed}
	/>
{/if}

<style>
	.cards {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--section-gap);
		max-width: var(--admin-max);
	}
	@media (min-width: 1024px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}
	}
</style>
