<!--
	Sign-in (UX-DR46; Story 3.1): its own 560 px column with the app header, one h1, a full POST form
	without `enhance`. A hidden `username` ("admin") lets password managers save the shared password;
	the one visible field is the password (paste allowed). After a wrong password the alert shows and
	the field gets `autofocus`; after too many tries the button stays disabled until the next try is
	allowed (re-enabled by a timer; without JavaScript a reload brings it back).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import InlineMessage from '#lib/components/InlineMessage.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import PrimaryButton from '#lib/components/PrimaryButton.svelte';
	import SkipLink from '#lib/components/SkipLink.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { SignInError } from './+page.server.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const messages: Record<SignInError, () => string> = {
		field_required: () => m.field_required(),
		password_wrong: () => m.admin_password_wrong(),
		rate_limited: () => m.admin_rate_limited(),
		action_failed: () => m.admin_action_failed()
	};

	const error = $derived(form?.error ?? null);
	const to = $derived(form?.values.to ?? data.to);
	/** Set once the wait after too many tries is over. */
	let waited = $state(false);
	const limited = $derived(error === 'rate_limited' && !waited);

	onMount(() => {
		if (form?.error !== 'rate_limited' || !form.retryInSeconds) return;
		const timer = setTimeout(() => (waited = true), form.retryInSeconds * 1000);
		return () => clearTimeout(timer);
	});
</script>

<PageTitle title={m.admin_login_title()} />

<SkipLink />
<div class="column">
	<AppHeader />
	<main id="main" tabindex="-1">
		<h1>{m.admin_login_title()}</h1>
		{#if error}
			<InlineMessage id="sign-in-error" text={messages[error]()} />
		{:else if data.expired}
			<InlineMessage kind="info" text={m.admin_session_ended()} />
		{/if}
		<form method="POST">
			<input type="hidden" name="to" value={to} />
			<input type="text" name="username" value="admin" autocomplete="username" readonly hidden />
			<TextField
				id="password"
				name="password"
				type="password"
				label={m.admin_password_label()}
				autocomplete="current-password"
				required
				autofocus={error === 'password_wrong' || error === 'field_required' ? true : undefined}
				aria-invalid={error === 'password_wrong' || error === 'field_required' ? 'true' : undefined}
				aria-describedby={error ? 'sign-in-error' : undefined}
			/>
			<PrimaryButton label={m.admin_sign_in()} busyLabel={m.admin_sign_in()} disabled={limited} />
		</form>
	</main>
</div>

<style>
	.column {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}
	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-6) var(--gutter);
	}
	main:focus {
		outline: none;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	@media (min-width: 600px) {
		.column {
			max-width: var(--content-max);
			margin-inline: auto;
		}
	}
</style>
