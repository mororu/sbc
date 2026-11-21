<!--
	Booking detail (EXPERIENCE "Booking detail"; key-admin-delete-dialog mockup; Story 3.2), capped at
	--detail-max: the back link to the day (44 px, uppercased by CSS), the eyebrow date, the time range
	as h1, the flag and tags, the FR-16 list (email and mobile as text inside mailto:/tel: links), the
	notice now and the last-told notice side by side (one column on phones), and the refused emails.
	Read-only: deleting comes with Story 3.3.
-->
<script lang="ts">
	import ChangeTag from '#lib/components/ChangeTag.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import type { AdminNoticeItem } from '#lib/server/admin-day-view.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const view = $derived(data.view);
</script>

{#snippet notice(item: AdminNoticeItem)}
	<div class="notice">
		<p class="label">{item.term}</p>
		{#if item.notice}
			<span class="state {item.notice.heat}">
				<Icon name={item.notice.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />
				<span>{item.notice.label}</span>
			</span>
			<p class="text">{item.notice.text}</p>
		{:else}
			<p class="text">{item.missing}</p>
		{/if}
	</div>
{/snippet}

<PageTitle title={view.title} />

<article class="detail">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin day href from the server -->
	<a class="back" href={view.back.href}><Icon name="chevron-left" size="row" />{view.back.text}</a>
	<p class="eyebrow">{view.eyebrow}</p>
	<h1><time datetime={view.datetime}>{view.heading}</time></h1>
	{#if view.started}<p class="note">{view.started}</p>{/if}
	{#if view.flag}<p class="flag">{view.flag}</p>{/if}
	{#if view.changed || view.oldCode}
		<p class="tags">
			{#if view.changed}<ChangeTag text={view.changed} />{/if}
			{#if view.oldCode}<ChangeTag text={view.oldCode} />{/if}
		</p>
	{/if}

	<dl>
		{#each view.details as item (item.term)}
			<dt>{item.term}</dt>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mailto:/tel: links -->
			<dd>{#if item.href}<a href={item.href}>{item.value}</a>{:else}{item.value}{/if}</dd>
		{/each}
	</dl>

	<div class="notices">
		{@render notice(view.notices.now)}
		{@render notice(view.notices.lastTold)}
	</div>

	{#if view.refusals}
		<section class="refusals" aria-labelledby="refusals-heading">
			<h2 id="refusals-heading" class="label">{view.refusals.heading}</h2>
			<ul>
				{#each view.refusals.items as item, i (i)}<li>{item}</li>{/each}
			</ul>
		</section>
	{/if}
</article>

<style>
	.detail {
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
	.eyebrow {
		margin-top: 10px;
		color: var(--muted);
		font-size: var(--type-date-eyebrow-size);
		font-weight: var(--type-date-eyebrow-weight);
		letter-spacing: var(--type-date-eyebrow-tracking);
		text-transform: uppercase;
	}
	h1 {
		margin-top: var(--space-2);
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
	}
	.note,
	.flag {
		margin-top: var(--space-3);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.note {
		color: var(--muted);
	}
	.flag {
		padding-left: var(--space-3);
		border-left: 2px solid var(--text);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px 18px;
		align-items: baseline;
		margin: 22px 0 0;
	}
	dt {
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-weight);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	}
	dd a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	.notices {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		margin-top: 22px;
	}
	@media (min-width: 600px) {
		.notices {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.label {
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		text-transform: uppercase;
	}
	.hot {
		color: var(--hot);
	}
	.cold {
		color: var(--cold-start);
	}
	.text {
		color: var(--muted);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	.refusals {
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--line);
	}
	.refusals ul {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
	}
</style>
