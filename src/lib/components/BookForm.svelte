<!--
	The booking form (FR-5, FR-9; UX booking form). A plain POST form that works without JavaScript:
	the server validates with the shared schema and answers with a redirect, or the page again with
	error keys and the typed values. With JavaScript (`use:enhance`):
	- the same schema validates on submit, and on blur for fields with content;
	- one tap submits: the button reads "Wird gebucht …" with aria-disabled, further taps are ignored,
	  a polite status says the same, and after 15 s the "dauert gerade länger" line;
	- a network or server failure shows the error at the top, focused, with "Fehler: " in the title;
	- name, email and mobile are kept in sessionStorage (never in a URL or cookie), so a conflict
	  does not re-ask; they are removed once a booking succeeds, so a shared device does not prefill
	  the next guest's form;
	- the submit token it sends is kept in sessionStorage with the form's path (pending). A reload of
	  this form reuses it, and after a lost response the day page looks it up and goes on to the
	  confirmation (see day-nav.ts). Cleared once the server answers the submit with a redirect;
	- duration and party size are mirrored into `?d=&p=` (shallow, replacing the entry), so the
	  language switch keeps them.
-->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import {
		afterFormRedirect,
		CONTACT_KEY,
		formToken,
		readPending,
		sessionStore,
		writePending,
		type Pending
	} from '#lib/day-nav.ts';
	import {
		BOOKING_FIELDS,
		CONTACT_FIELDS,
		EMAIL_MAX,
		MOBILE_MAX,
		NAME_MAX,
		errorFields,
		parseBooking,
		validateContactField,
		type BookingErrorKey,
		type BookingErrors,
		type ContactField
	} from '#lib/schemas/index.ts';
	import type { BookView } from '#lib/server/book-view.ts';
	import BookingSummary from './BookingSummary.svelte';
	import InlineMessage from './InlineMessage.svelte';
	import PageTitle from './PageTitle.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	import TextField from './TextField.svelte';

	type Failure = {
		errors: BookingErrors;
		values: { name: string; email: string; mobile: string; duration: string; partySize: string };
	};

	let { view, failure }: { view: BookView; failure: Failure | null } = $props();

	const SLOW_MS = 15_000;

	const messages: Record<BookingErrorKey, () => string> = {
		field_required: () => m.field_required(),
		name_too_long: () => m.name_too_long(),
		name_invalid: () => m.name_invalid(),
		email_invalid: () => m.email_invalid(),
		mobile_invalid: () => m.mobile_invalid(),
		form_invalid: () => m.submit_failed()
	};

	/** The values a server failure sent back (no JavaScript), else the view's preselection. */
	function initial() {
		const v = failure?.values;
		const enabled = view.durations.filter((d) => d.enabled).map((d) => d.value as number);
		const duration = Number(v?.duration);
		const partySize = Number(v?.partySize);
		return {
			contact: { name: v?.name ?? '', email: v?.email ?? '', mobile: v?.mobile ?? '' },
			duration: enabled.includes(duration) ? duration : view.duration,
			partySize: view.partySizes.includes(partySize) ? partySize : view.partySize,
			errors: failure?.errors ?? {}
		};
	}
	const start = initial();

	let contact = $state(start.contact);
	let duration = $state(start.duration);
	let partySize = $state(start.partySize);
	let errors: BookingErrors = $state(start.errors);
	/** Set by a submit with errors; the summary counts the contact fields. */
	let summary = $state(Object.keys(start.errors).length > 0);
	/** The pending submit read on mount: its token replaces the fresh one on the same form path. */
	let pending = $state<Pending | null>(null);
	// Only in the browser (pending is set on mount): the server render keeps the fresh token.
	const submitToken = $derived(pending ? formToken(pending, page.url.pathname, view.submitToken) : view.submitToken);
	let busy = $state(false);
	let slow = $state(false);
	let failed = $state(false);
	/** Counts shown failures: keyed into the messages, so a repeat is shown, focused and announced anew. */
	let attempt = $state(0);

	const invalidContact = $derived(CONTACT_FIELDS.filter((f) => errors[f]));
	/** A form-level problem (a crafted or stale field, or the command said invalid). */
	const formInvalid = $derived(
		summary && invalidContact.length === 0 && errorFields(errors).length > 0
	);
	const hasError = $derived(failed || formInvalid || (summary && invalidContact.length > 0));
	/** Without JavaScript the first invalid field gets `autofocus`. */
	const firstInvalid = $derived(summary ? invalidContact[0] : undefined);
	const durationNote = $derived(view.durations.find((d) => d.value === duration)?.note ?? '');
	const status = $derived(busy ? (slow ? m.submit_slow() : m.submit_busy()) : '');

	function errorText(field: ContactField): string | null {
		const key = errors[field];
		return key ? messages[key]() : null;
	}

	function save() {
		try {
			sessionStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
		} catch {
			// Storage can be off (private mode, quota): the form still works.
		}
	}

	onMount(() => {
		pending = readPending(sessionStore());
		try {
			const stored = JSON.parse(sessionStorage.getItem(CONTACT_KEY) ?? 'null') as Record<string, unknown> | null;
			if (!stored) return;
			for (const field of CONTACT_FIELDS) {
				const value = stored[field];
				if (!contact[field] && typeof value === 'string') contact[field] = value;
			}
		} catch {
			// Nothing stored, or not readable.
		}
	});

	// Pressing the button blurs the field first. An error line appearing then would move the button
	// away under the pointer and swallow the click, so blur skips validation while the button is
	// pressed: the submit validates everything anyway.
	let pressing = false;

	function onblur(field: ContactField) {
		if (pressing || contact[field].trim() === '') return;
		const key = validateContactField(field, contact[field]);
		if (key) errors[field] = key;
		else delete errors[field];
	}

	function oninput(field: ContactField) {
		save();
		// Clear an error as soon as the field is right; a new error waits for blur.
		if (errors[field] && validateContactField(field, contact[field]) === null) delete errors[field];
	}

	/** Mirrors the choice into `?d=&p=`, read from the changed radio itself so it never lags behind. */
	function syncQuery(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const d = input.name === 'duration' ? input.value : String(duration);
		const p = input.name === 'partySize' ? input.value : String(partySize);
		const url = new URL((page.shallow?.url ?? page.url).href);
		url.searchParams.set('d', d);
		url.searchParams.set('p', p);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current page, new query
		void goto(url, { shallow: true, replace: true, state: {} });
	}

	async function showErrors(next: BookingErrors) {
		errors = next;
		summary = true;
		failed = false;
		attempt++;
		await tick();
		const first = CONTACT_FIELDS.find((f) => next[f]);
		if (first) document.getElementById(`book-${first}`)?.focus();
	}

	let slowTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(slowTimer));

	const submit: SubmitFunction = ({ cancel, formData }) => {
		if (busy) {
			cancel();
			return;
		}
		save();
		const parsed = parseBooking(Object.fromEntries(BOOKING_FIELDS.map((f) => [f, formData.get(f) ?? ''])));
		if (!parsed.ok) {
			cancel();
			void showErrors(parsed.errors);
			return;
		}
		const path = page.url.pathname;
		writePending(sessionStore(), path, parsed.value.submitToken);
		pending = { path, token: parsed.value.submitToken };
		busy = true;
		slow = false;
		failed = false;
		summary = false;
		slowTimer = setTimeout(() => (slow = true), SLOW_MS);

		return async ({ result, update }) => {
			clearTimeout(slowTimer);
			if (result.type === 'failure') {
				busy = false;
				await showErrors((result.data as Failure | undefined)?.errors ?? { submitToken: 'form_invalid' });
				return;
			}
			if (result.type === 'error') {
				// Nothing is known to be booked: say so, keep everything, allow another try with the
				// same submit token, so a booking that did go through is not made twice.
				busy = false;
				failed = true;
				attempt++;
				return;
			}
			// A redirect: to the confirmation, or to the day with the conflict message.
			// The server answered this token: nothing is pending any more. Booked: the contact details go too.
			if (result.type === 'redirect') afterFormRedirect(sessionStore(), result.location);
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<PageTitle title={hasError ? m.title_error({ title: view.title }) : view.title} />

<h1 class="visually-hidden">{view.title}</h1>

<BookingSummary
	back={view.back}
	time={view.time}
	datetime={view.datetime}
	heat={view.heat}
	label={view.label}
	notice={view.notice}
/>

<form method="POST" class="book" novalidate use:enhance={submit}>
	{#key attempt}
		{#if failed || formInvalid}
			<InlineMessage text={m.submit_failed()} focus />
		{:else if summary && invalidContact.length > 0}
			<InlineMessage text={m.error_summary({ count: invalidContact.length })} />
		{/if}
	{/key}

	<input type="hidden" name="submitToken" value={submitToken} />
	<input type="hidden" name="notice" value={view.noticeToken} />

	<SegmentedControl
		id="book-duration"
		legend={m.section_duration()}
		name="duration"
		options={view.durations.map((d) => ({ value: d.value, text: String(d.value), name: d.name, enabled: d.enabled }))}
		bind:value={duration}
		describedby={view.unavailable ? 'book-duration-note book-duration-unavailable' : 'book-duration-note'}
		onchange={syncQuery}
	>
		{#snippet notes()}
			<p class="note" id="book-duration-note">{durationNote}</p>
			{#if view.unavailable}
				<p class="note" id="book-duration-unavailable">{view.unavailable}</p>
			{/if}
		{/snippet}
	</SegmentedControl>

	<SegmentedControl
		id="book-people"
		legend={m.section_people()}
		name="partySize"
		options={view.partySizes.map((n) => ({ value: n, text: String(n) }))}
		bind:value={partySize}
		onchange={syncQuery}
	/>

	<fieldset class="contact">
		<legend>{m.section_contact()}</legend>
		<TextField
			id="book-name"
			name="name"
			label={m.field_name()}
			purpose={m.field_name_purpose()}
			error={errorText('name')}
			bind:value={contact.name}
			autocomplete="name"
			maxlength={NAME_MAX}
			autofocus={firstInvalid === 'name'}
			onblur={() => onblur('name')}
			oninput={() => oninput('name')}
		/>
		<TextField
			id="book-email"
			name="email"
			type="email"
			label={m.field_email()}
			purpose={m.field_email_purpose()}
			error={errorText('email')}
			bind:value={contact.email}
			autocomplete="email"
			maxlength={EMAIL_MAX}
			autocapitalize="off"
			spellcheck={false}
			autofocus={firstInvalid === 'email'}
			onblur={() => onblur('email')}
			oninput={() => oninput('email')}
		/>
		<TextField
			id="book-mobile"
			name="mobile"
			type="tel"
			label={m.field_mobile()}
			purpose={m.field_mobile_purpose()}
			error={errorText('mobile')}
			bind:value={contact.mobile}
			autocomplete="tel"
			maxlength={MOBILE_MAX}
			autofocus={firstInvalid === 'mobile'}
			onblur={() => onblur('mobile')}
			oninput={() => oninput('mobile')}
		/>
		<p class="privacy"><a href={resolve('/(guest)/privacy')}>{m.privacy_more()}</a></p>
	</fieldset>

	<p class="status" role="status" aria-live="polite">{status}</p>

	<PrimaryButton
		label={view.title}
		{busy}
		busyLabel={m.submit_busy()}
		onpointerdown={() => (pressing = true)}
		onpointerup={() => setTimeout(() => (pressing = false))}
		onpointercancel={() => (pressing = false)}
		onpointerleave={() => (pressing = false)}
	/>
</form>

<style>
	.book {
		display: flex;
		flex-direction: column;
		gap: var(--section-gap);
		margin: var(--section-gap) 0 var(--space-6);
	}
	.note {
		margin-top: var(--space-2);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	.contact {
		display: flex;
		flex-direction: column;
		gap: var(--section-gap);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.contact legend {
		/* A legend cannot take part in the flex gap: its own margin spaces it. */
		margin-bottom: var(--space-3);
		padding: 0;
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.privacy a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		color: var(--muted);
	}
	.status {
		min-height: calc(var(--type-note-size) * var(--type-note-leading));
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
		color: var(--muted);
	}
	.status:empty {
		min-height: 0;
	}
</style>
