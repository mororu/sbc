<!-- Footer (UX-DR43): muted links, stacked on phones, each 44 px high. Story 1.9 adds the admin contact. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
</script>

<footer class="app-footer">
	<ul>
		<li><a href={resolve('/(guest)/info')}>{m.footer_info()}</a></li>
		<li><a href={resolve('/(guest)/privacy')}>{m.footer_privacy()}</a></li>
		<li><a href={resolve('/(guest)/imprint')}>{m.footer_imprint()}</a></li>
	</ul>
</footer>

<style>
	.app-footer {
		margin-top: var(--space-7);
		padding: var(--space-4) var(--gutter) var(--space-6);
		border-top: 1px solid var(--line);
	}
	ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	@media (min-width: 600px) {
		ul {
			flex-direction: row;
			flex-wrap: wrap;
			gap: var(--space-6);
		}
	}
</style>
