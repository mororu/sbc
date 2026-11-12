<!--
	The confirmation (FR-7, FR-10; DESIGN.md confirmation): eyebrow date, "Gebucht!", the large state
	badge carrying the notice at booking, the "changed" or "revisit" line, then below a hairline the
	keybox sentence and the details list (Wann, Personen, Absagen), and the links on.
	With JavaScript, the one-time flags `?new=1&changed=1` are dropped from the address after the
	first render (shallow, replacing the entry), so a reload counts as a revisit.
-->
<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import StateBadge from '#lib/components/StateBadge.svelte';
	import { withoutBookedFlags } from '#lib/day-nav.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const view = $derived(data.view);

	afterNavigate(() => {
		const clean = withoutBookedFlags(new URL((page.shallow?.url ?? page.url).href));
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current page, less its query
		if (clean) void goto(clean, { shallow: true, replace: true, state: {} });
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageTitle title={view.title} />

<section class="confirmation">
	<div class="head">
		<p class="eyebrow">{view.date}</p>
		<h1>{view.heading}</h1>
	</div>

	{#if view.badge}
		<div class="notice">
			<StateBadge heat={view.badge.heat} label={view.badge.text} large />
			{#if view.changed}
				<p class="line">{view.changed}</p>
			{/if}
			{#if view.revisit}
				<p class="line">{view.revisit}</p>
			{/if}
		</div>
	{:else if view.revisit}
		<p class="line">{view.revisit}</p>
	{/if}

	<div class="body">
		<p class="keybox">{view.keybox}</p>
		<dl class="details">
			<div>
				<dt>{view.details.when.term}</dt>
				<dd>
					{view.details.when.before}<time datetime={view.details.when.datetime}>{view.details.when.start}</time
					>{view.details.when.after}
				</dd>
			</div>
			<div>
				<dt>{view.details.people.term}</dt>
				<dd>{view.details.people.value}</dd>
			</div>
			{#if view.details.cancel}
				{@const cancel = view.details.cancel}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- a mailto: link, not a page of the app -->
				<div>
					<dt>{cancel.term}</dt>
					<dd>{cancel.before}<a href={cancel.href}>{cancel.address}</a>{cancel.after}</dd>
				</div>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</dl>
	</div>

	<ul class="links">
		<li><a href={view.another.href}>{view.another.text}</a></li>
		<li><a href={view.info.href}>{view.info.text}</a></li>
	</ul>
</section>

<style>
	.confirmation {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: 66px 4px 0;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.eyebrow {
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
		color: var(--muted);
	}
	h1 {
		font-size: var(--type-display-size);
		font-weight: var(--type-display-weight);
		line-height: var(--type-display-leading);
	}
	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}
	.line {
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
		line-height: var(--type-body-sm-leading);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-top: var(--space-6);
		border-top: 1px solid var(--line);
	}
	.keybox {
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
	.details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
		line-height: var(--type-body-sm-leading);
	}
	.details div {
		display: contents;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	}
	.links {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.links a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
</style>
