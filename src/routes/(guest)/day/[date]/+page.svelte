<script lang="ts">
	import DayView from '#lib/components/DayView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DayView view={data.page} />
