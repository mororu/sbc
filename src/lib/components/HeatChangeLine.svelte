<!--
	Heat-change line (EXPERIENCE "Heat-change line"; Story 3.3): from-state → to-state, measured
	against the last-told notice ("heiss → Kaltstart"). Each side has its state icon and label; the
	arrow is aria-hidden with the hidden word "wird zu" / "becomes". Used by the impact mini row and
	the call-list entry (Story 3.6).
-->
<script lang="ts">
	import Icon from './Icon.svelte';
	import type { HeatChangeLineView } from '#lib/server/impact-view.ts';

	let { line }: { line: HeatChangeLineView } = $props();
</script>

<span class="line">
	<span class="state {line.from.heat}"><Icon name={line.from.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />{line.from.label}</span>
	<span aria-hidden="true">→</span><span class="visually-hidden">{` ${line.becomes} `}</span>
	<span class="state {line.to.heat}"><Icon name={line.to.heat === 'hot' ? 'flame' : 'snowflake'} size="row" />{line.to.label}</span>
</span>

<style>
	.line {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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
</style>
