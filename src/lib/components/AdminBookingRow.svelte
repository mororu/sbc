<!--
	Admin booking row (EXPERIENCE "Admin booking row"; key-admin-home mockup; Story 3.2): one link to
	the booking detail, a grid `1fr auto 20px` over a hairline. Line 1: the time range and the heat
	state (icon + label); line 2: "Tom Brunner · 2 Personen" with the tags ("Hinweis geändert",
	"Alter Code 4711", "Ausserhalb der Zeiten") or the muted "Code 4711"; the chevron spans both lines.
	Used by the admin day view below 1024 px and by the admin home.
-->
<script lang="ts">
	import ChangeTag from './ChangeTag.svelte';
	import Icon from './Icon.svelte';
	import type { AdminRow } from '#lib/server/admin-day-view.ts';

	let { row }: { row: AdminRow } = $props();
</script>

<a class="admin-row" href={row.href}>
	<time class="time" datetime={row.datetime}>{row.time}</time>
	{#if row.notice}
		<span class="state {row.notice.heat}">
			<Icon name={row.notice.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />
			<span>{row.notice.label}</span>
		</span>
	{/if}
	<span class="who">
		<span>{row.name} · {row.party}</span>
		{#if row.changed}<ChangeTag text={row.changed} />{/if}
		{#if row.oldCode}<ChangeTag text={row.oldCode} />{/if}
		{#if row.flag}<ChangeTag text={row.flag} />{/if}
		{#if row.code}<span class="code">{row.code}</span>{/if}
	</span>
	<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size="row" /></span>
</a>

<style>
	.admin-row {
		display: grid;
		grid-template-columns: 1fr auto 20px;
		grid-template-areas:
			'time state chevron'
			'who who chevron';
		align-items: center;
		gap: var(--space-1) 10px;
		min-height: var(--target-min);
		padding: 14px 0;
		border-bottom: 1px solid var(--line);
		color: inherit;
		text-decoration: none;
	}
	.time {
		grid-area: time;
		min-width: 0;
		font-size: var(--type-strip-day-size);
		font-weight: var(--type-strip-day-weight);
		line-height: var(--type-strip-day-leading);
	}
	.state {
		grid-area: state;
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
	.who {
		grid-area: who;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		min-width: 0;
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-sm-leading);
	}
	.code {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.chevron {
		grid-area: chevron;
		display: inline-flex;
		color: var(--muted);
	}
	/* Large text on a small phone: time, state and the name stack. */
	@media (max-width: 359px) {
		.admin-row {
			grid-template-columns: minmax(0, 1fr) 20px;
			grid-template-areas:
				'time chevron'
				'state chevron'
				'who chevron';
		}
	}
</style>
