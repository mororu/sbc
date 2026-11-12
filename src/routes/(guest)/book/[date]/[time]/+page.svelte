<script lang="ts">
	import BookForm from '#lib/components/BookForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<!-- A new form (another start time, or a fresh load) starts from its own view model. -->
{#key data.page.submitToken}
	<BookForm view={data.page} failure={form ?? null} />
{/key}
