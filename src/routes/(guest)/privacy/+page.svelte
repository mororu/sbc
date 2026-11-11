<script lang="ts">
	import PageTitle from '#lib/components/PageTitle.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<PageTitle title={m.privacy_title()} />

<h1>{m.privacy_title()}</h1>
<p>{m.stub_body()}</p>

<style>
	h1 {
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
		margin-bottom: var(--space-4);
	}
</style>
