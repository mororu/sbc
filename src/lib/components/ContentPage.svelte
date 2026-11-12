<!--
	A content page (/info, /privacy, /imprint): the unique title, one h1 and an h2 with its text per
	slot, built from the message catalogues by `contentPage` (src/lib/content/pages.ts). A slot whose
	English text is still empty shows the German text, marked lang="de". Blank lines split paragraphs;
	a single newline is a line break (a postal address keeps its lines).
-->
<script lang="ts">
	import PageTitle from './PageTitle.svelte';
	import { contentPage, paragraphs, type PageId } from '#lib/content/pages.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';

	let { id }: { id: PageId } = $props();

	const page = $derived(contentPage(id, getLocale()));
</script>

<PageTitle title={page.title} />

<h1>{page.title}</h1>

{#each page.slots as slot (slot.key)}
	<section aria-labelledby={slot.key}>
		<h2 id={slot.key}>{slot.heading}</h2>
		<div class="text" lang={slot.lang ?? undefined}>
			{#each paragraphs(slot.text) as paragraph, i (i)}
				<p>{paragraph}</p>
			{/each}
		</div>
	</section>
{/each}

<style>
	h1 {
		font-size: var(--type-date-heading-size);
		font-weight: var(--type-date-heading-weight);
		line-height: var(--type-date-heading-leading);
		letter-spacing: var(--type-date-heading-tracking);
		margin-bottom: var(--space-4);
		overflow-wrap: break-word;
	}
	section {
		margin-top: var(--space-6);
	}
	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
		overflow-wrap: break-word;
	}
	.text {
		font-size: var(--type-body-size);
		font-weight: var(--type-body-weight);
		line-height: var(--type-body-leading);
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		white-space: pre-line;
	}
	p + p {
		margin-top: var(--space-3);
	}
</style>
