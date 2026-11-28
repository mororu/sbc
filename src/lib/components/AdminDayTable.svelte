<!--
	Admin day table (EXPERIENCE "Admin day table"; Story 3.2), from 1024 px: the same data as the admin
	booking rows with `<th scope="col">` headers: time · name · party · email · mobile · notice now ·
	last told · keybox code sent. The time is the row header (`<th scope="row">`), and the whole row
	links to the booking detail through one stretched link on it (`::after`, inset 0), so no
	interactive content is nested. The notice columns show the heat state and the notice text; a
	missing notice is a dash with hidden "nicht gespeichert". Email and mobile are text here; the
	detail has the links. A block (Story 3.5) is a row of its own in start order: its time range as the
	row header and "Block · Reinigung" across the other columns, not a link.
-->
<script lang="ts">
	import ChangeTag from './ChangeTag.svelte';
	import Icon from './Icon.svelte';
	import type { AdminDayView, AdminNotice } from '#lib/server/admin-day-view.ts';

	let { entries, labels }: { entries: AdminDayView['entries']; labels: AdminDayView['labels'] } = $props();

	/** A block's text spans every column after the time. */
	const blockSpan = $derived(Object.keys(labels.columns).length - 1);
</script>

{#snippet state(notice: AdminNotice | null)}
	{#if notice}
		<span class="state {notice.heat}">
			<Icon name={notice.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />
			<span>{notice.label}</span>
		</span>
		<span class="text">{notice.text}</span>
	{:else}
		<span aria-hidden="true">–</span><span class="visually-hidden">{labels.noNotice}</span>
	{/if}
{/snippet}

<table class="admin-table">
	<caption class="visually-hidden">{labels.caption}</caption>
	<thead>
		<tr>
			<th scope="col">{labels.columns.time}</th>
			<th scope="col">{labels.columns.name}</th>
			<th scope="col">{labels.columns.party}</th>
			<th scope="col">{labels.columns.email}</th>
			<th scope="col">{labels.columns.mobile}</th>
			<th scope="col">{labels.columns.notice}</th>
			<th scope="col">{labels.columns.lastTold}</th>
			<th scope="col">{labels.columns.code}</th>
		</tr>
	</thead>
	<tbody>
		{#each entries as entry (entry.kind === 'block' ? `block-${entry.block.id}` : `booking-${entry.row.id}`)}
			{#if entry.kind === 'block'}
				<tr class="block">
					<th class="time" scope="row"><time datetime={entry.block.datetime}>{entry.block.time}</time></th>
					<td colspan={blockSpan}>{entry.block.text}</td>
				</tr>
			{:else}
			{@const row = entry.row}
			<tr>
				<th class="time" scope="row"><a class="stretch" href={row.href}><time datetime={row.datetime}>{row.time}</time></a></th>
				<td>{row.name}</td>
				<td class="num">{row.partySize}</td>
				<td class="contact">{row.email ?? '–'}</td>
				<td class="contact num">{row.mobile ?? '–'}</td>
				<td>
					<span class="cell">
						{@render state(row.notice)}
						{#if row.changed}<ChangeTag text={row.changed} />{/if}
						{#if row.flag}<ChangeTag text={row.flag} />{/if}
					</span>
				</td>
				<td><span class="cell">{@render state(row.lastTold)}</span></td>
				<td class="num">
					{#if row.oldCode}<ChangeTag text={row.oldCode} />{:else}{row.sentCode ?? '–'}{/if}
				</td>
			</tr>
			{/if}
		{/each}
	</tbody>
</table>

<style>
	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
		line-height: var(--type-body-sm-leading);
	}
	thead th {
		padding: 0 var(--space-3) var(--space-2) 0;
		border-bottom: 1px solid var(--line-strong);
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-align: start;
		text-transform: uppercase;
		vertical-align: bottom;
		white-space: nowrap;
	}
	tr {
		position: relative;
	}
	tbody tr:not(.block):hover {
		background: var(--line-subtle);
	}
	.block td {
		color: var(--muted);
	}
	td,
	tbody th {
		padding: 14px var(--space-3) 14px 0;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	.time {
		text-align: start;
		white-space: nowrap;
		font-size: var(--type-strip-day-size);
		font-weight: var(--type-strip-day-weight);
	}
	.stretch {
		color: inherit;
		text-decoration: none;
	}
	/* The whole row is the time link's hit area. */
	.stretch::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.stretch:focus-visible {
		outline: none;
	}
	.stretch:focus-visible::after {
		outline: var(--focus-ring-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-ring-width));
	}
	.text {
		flex-basis: 100%;
		color: var(--muted);
		font-size: var(--type-note-size);
		font-weight: var(--type-note-weight);
		line-height: var(--type-note-leading);
	}
	/* Contact data stays readable at 1024 px: an email breaks only at its @ or dots when it must,
	   a mobile number never breaks; the notice columns give way instead. */
	.contact {
		min-width: 16ch;
		overflow-wrap: break-word;
	}
	.contact.num {
		min-width: 0;
		white-space: nowrap;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.cell {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--type-state-label-size);
		font-weight: var(--type-state-label-weight);
		letter-spacing: var(--type-state-label-tracking);
		text-transform: uppercase;
		white-space: nowrap;
	}
	.hot {
		color: var(--hot);
	}
	.cold {
		color: var(--cold-start);
	}
</style>
