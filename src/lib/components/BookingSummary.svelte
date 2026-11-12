<!--
	Booking summary (DESIGN.md booking-summary, UX-DR booking form): the back link with the short
	date, then the chosen start time at left and the state badge at right, the notice below, over a
	hairline. The back link's name is the full date ("Zurück zu Dienstag, 12. Januar"); "‹" is hidden.
-->
<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Icon from './Icon.svelte';
	import StateBadge from './StateBadge.svelte';

	let {
		back,
		time,
		datetime,
		heat,
		label,
		notice
	}: {
		back: { href: ResolvedPathname; text: string; name: string };
		time: string;
		datetime: string;
		heat: 'hot' | 'cold';
		label: string;
		notice: string;
	} = $props();
</script>

<div class="summary">
	<a class="back" href={back.href} aria-label={back.name}>
		<Icon name="chevron-left" />
		<span>{back.text}</span>
	</a>
	<div class="line">
		<time class="time" {datetime}>{time}</time>
		<StateBadge {heat} {label} />
	</div>
	<p class="notice">{notice}</p>
</div>

<style>
	.summary {
		padding: var(--space-2) 0 18px;
		border-bottom: 1px solid var(--line);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		margin-inline-start: calc(-1 * var(--space-1));
		padding-inline-end: var(--space-2);
		color: var(--text);
		font-size: var(--type-brand-size);
		font-weight: var(--type-brand-weight);
		letter-spacing: var(--type-brand-tracking);
		text-transform: uppercase;
		text-decoration: none;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.time {
		font-size: var(--type-summary-time-size);
		font-weight: var(--type-summary-time-weight);
		line-height: var(--type-summary-time-leading);
	}
	.notice {
		margin-top: var(--space-3);
		font-size: var(--type-notice-size);
		font-weight: var(--type-notice-weight);
		line-height: var(--type-notice-leading);
		color: var(--muted);
	}
</style>
