<!-- "DE | EN" (UX-DR9): plain links to /lang/{locale}, so switching works without JavaScript. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getLocale, locales } from '#lib/paraglide/runtime.js';
	import { htmlLang, returnQuery } from '#lib/i18n/locale-switch.ts';

	const names: Record<string, string> = { de: 'Deutsch', en: 'English' };
	const current = $derived(getLocale());
	// After a shallow URL update (the booking form's `?d=&p=`), carry that URL's query.
	const url = $derived(page.shallow?.url ?? page.url);
</script>

<div class="switch">
	{#each locales as locale, i (locale)}
		{#if i > 0}<span class="divider" aria-hidden="true">|</span>{/if}
		<a
			href={resolve(`/lang/[locale]${returnQuery(url.pathname, url.search)}`, { locale })}
			hreflang={htmlLang(locale)}
			lang={htmlLang(locale)}
			rel="nofollow"
			aria-label={names[locale]}
			aria-current={locale === current ? 'true' : undefined}
			data-sveltekit-reload
		>
			{locale.toUpperCase()}
		</a>
	{/each}
</div>

<style>
	.switch {
		display: flex;
		align-items: center;
	}
	a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--target-min);
		min-height: var(--target-min);
		color: var(--muted);
		font-size: var(--type-switch-size);
		font-weight: var(--type-switch-weight);
		letter-spacing: var(--type-switch-tracking);
		text-decoration: none;
	}
	a[aria-current='true'] {
		color: var(--text);
		font-weight: var(--type-switch-active-weight);
		text-decoration: underline;
		text-decoration-thickness: 1.5px;
		text-underline-offset: 6px;
	}
	.divider {
		color: var(--muted);
		font-size: var(--type-switch-size);
	}
</style>
