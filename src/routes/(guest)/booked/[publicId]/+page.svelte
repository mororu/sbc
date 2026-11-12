<!--
	The minimal confirmation (Story 1.7, DESIGN.md confirmation): eyebrow date, "Gebucht!", then the
	start time, duration and party size. The notice badge, keybox sentence and details list follow in
	Story 1.8.
-->
<script lang="ts">
	import PageTitle from '#lib/components/PageTitle.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const view = $derived(data.view);
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
	<p class="details">
		<time datetime={view.datetime}>{view.time}</time>
		<span aria-hidden="true"> · </span><span class="visually-hidden">, </span>
		<span>{view.duration}</span>
		<span aria-hidden="true"> · </span><span class="visually-hidden">, </span>
		<span>{view.people}</span>
	</p>
	<a class="another" href={view.another.href}>{view.another.text}</a>
</section>

<style>
	.confirmation {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
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
	.details {
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
	}
	.details time {
		font-weight: var(--type-button-weight);
	}
	.another {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
</style>
