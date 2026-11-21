<!--
	Admin shell (UX-DR46; Story 3.1): skip link, app header, the admin nav and main, capped at
	--admin-max. The nav scrolls sideways on phones; on laptops Abmelden sits far right. The active
	tab is weight 600 with a 2 px text underline and aria-current="page", never the primary colour.
	Übersicht carries the call-list and reply-reminder badges: icon, count ("0" when empty) and a
	hidden singular/plural text. Abmelden is a POST form styled as the last tab.
-->
<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import SkipLink from '#lib/components/SkipLink.svelte';
	import { ADMIN_TABS, ADMIN_TAB_HREF, activeAdminTab, adminSkipTarget, type AdminTab } from '#lib/admin-nav.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const labels: Record<AdminTab, () => string> = {
		home: () => m.admin_nav_home(),
		day: () => m.admin_nav_day(),
		blocks: () => m.admin_nav_blocks(),
		settings: () => m.admin_nav_settings(),
		analytics: () => m.admin_nav_analytics()
	};

	const active = $derived(activeAdminTab(page.url.pathname));
	// The admin day view puts the bookings (#bookings) after the date strip; skip straight to them.
	const skip = $derived(adminSkipTarget(page.data));
</script>

<SkipLink target={skip} />
<div class="shell">
	<AppHeader />
	<nav class="admin-nav" aria-label={m.admin_nav_name()}>
		<ul>
			{#each ADMIN_TABS as tab (tab)}
				<li>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- root-relative admin hrefs (admin-nav.ts); later stories add the remaining routes -->
					<a class="tab" href={ADMIN_TAB_HREF[tab]} aria-current={active === tab ? 'page' : undefined}>
						{labels[tab]()}
						{#if tab === 'home'}
							<span class="badge">
								<Icon name="phone" />
								<span aria-hidden="true">{data.counts.calls}</span>
								<span class="visually-hidden">{` ${m.admin_badge_calls({ count: data.counts.calls })}`}</span>
							</span>
							<span class="badge">
								<Icon name="mail" />
								<span aria-hidden="true">{data.counts.replies}</span>
								<span class="visually-hidden">{` ${m.admin_badge_replies({ count: data.counts.replies })}`}</span>
							</span>
						{/if}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
			<li class="sign-out">
				<form method="POST" action="/admin/logout">
					<button class="tab" type="submit">{m.admin_nav_sign_out()}</button>
				</form>
			</li>
		</ul>
	</nav>
	<main id="main" tabindex="-1">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
		max-width: var(--admin-max);
		margin-inline: auto;
	}
	.admin-nav {
		margin-top: var(--space-2);
		padding-inline: var(--gutter);
		overflow-x: auto;
	}
	ul {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	li {
		display: flex;
		flex: none;
	}
	form {
		display: flex;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--target-min);
		padding: 0 var(--space-3);
		/* The 2 px underline of the active tab sits on the nav's 1 px baseline. */
		margin-bottom: -1px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: var(--type-note-size);
		font-weight: 400;
		text-decoration: none;
		cursor: pointer;
	}
	.tab[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		border-bottom-color: var(--text);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text);
	}
	main {
		flex: 1;
		padding: var(--space-6) var(--gutter);
	}
	main:focus {
		outline: none;
	}
	@media (min-width: 1024px) {
		li:first-child .tab {
			padding-inline-start: 0;
		}
		.sign-out {
			margin-inline-start: auto;
		}
		.sign-out .tab {
			padding-inline-end: 0;
		}
	}
	@media (forced-colors: active) {
		.tab[aria-current='page'] {
			border-bottom-color: CanvasText;
		}
	}
</style>
