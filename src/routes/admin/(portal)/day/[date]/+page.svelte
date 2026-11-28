<script lang="ts">
	import AdminDayView from '#lib/components/AdminDayView.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<AdminDayView view={data.view} {form} />
