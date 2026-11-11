<!--
	Theme switch (UX-DR10): first visit follows the device; a tap stores an explicit choice in
	localStorage.theme, which then always wins. The inline script in app.html applies it before paint.
	Which icon shows is decided by CSS from the same state, so server HTML never shows the wrong one.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from './Icon.svelte';

	let dark = $state(false);
	// Server HTML cannot know the effective theme, and without JavaScript the button cannot work:
	// it stays invisible (but keeps its space) and carries no aria-pressed until hydrated.
	let mounted = $state(false);

	function effectiveDark(): boolean {
		const stored = document.documentElement.dataset.theme;
		if (stored === 'dark' || stored === 'light') return stored === 'dark';
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	onMount(() => {
		dark = effectiveDark();
		mounted = true;
		// Until a choice is stored, follow device changes live.
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const follow = () => {
			if (!document.documentElement.dataset.theme) dark = media.matches;
		};
		// A choice made in another tab applies here too.
		const sync = (event: StorageEvent) => {
			if (event.key === 'theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
				document.documentElement.dataset.theme = event.newValue;
				dark = event.newValue === 'dark';
			}
		};
		media.addEventListener('change', follow);
		window.addEventListener('storage', sync);
		return () => {
			media.removeEventListener('change', follow);
			window.removeEventListener('storage', sync);
		};
	});

	function toggle() {
		dark = !effectiveDark();
		const theme = dark ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {
			// Storage blocked: the choice holds for this page only.
		}
	}
</script>

<button
	type="button"
	class="theme"
	class:pending={!mounted}
	aria-pressed={mounted ? dark : undefined}
	onclick={toggle}
>
	<span class="visually-hidden">{m.theme_switch_name()}</span>
	<span class="when-light"><Icon name="moon" /></span>
	<span class="when-dark"><Icon name="sun" /></span>
</button>

<style>
	.theme {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--target-min);
		height: var(--target-min);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		border-radius: var(--radius);
	}
	.pending {
		visibility: hidden;
	}
	@media (forced-colors: active) {
		.theme {
			border: 1px solid ButtonText;
		}
	}
	.when-dark {
		display: none;
	}
	:global(:root[data-theme='dark']) .when-light {
		display: none;
	}
	:global(:root[data-theme='dark']) .when-dark {
		display: inline-flex;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .when-light {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .when-dark {
			display: inline-flex;
		}
	}
</style>
