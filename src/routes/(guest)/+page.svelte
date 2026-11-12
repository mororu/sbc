<script lang="ts">
	import DayView from '#lib/components/DayView.svelte';
	import SeasonNotice from '#lib/components/SeasonNotice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.page.kind === 'day'}
	<DayView view={data.page} />
{:else}
	<SeasonNotice notice={data.page} />
{/if}
