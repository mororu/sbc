<!-- Unique <title> per route, always ending in "· Sauna Luegisee" (UX-DR45, UX-DR71). -->
<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { title }: { title: string } = $props();
</script>

<svelte:head>
	<title>{title} · {m.title_suffix()}</title>
</svelte:head>
