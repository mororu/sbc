<!--
	Change tag (UX-DR, EXPERIENCE "Change tag"; Story 3.2): a plain text tag in a 1 px box, read as
	part of its row: "Hinweis geändert", "Alter Code 4711", "Ausserhalb der Zeiten". Never colour
	alone: the text says it. Source text in sentence case; CSS uppercases it.
-->
<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<span class="tag">{text}</span>

<style>
	.tag {
		display: inline-block;
		padding: 2px 6px;
		border: 1px solid var(--text);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--type-strip-weekday-size);
		font-weight: var(--type-strip-weekday-weight);
		letter-spacing: var(--type-strip-weekday-tracking);
		line-height: 1.3;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}
	@media (forced-colors: active) {
		.tag {
			border-color: CanvasText;
		}
	}
</style>
