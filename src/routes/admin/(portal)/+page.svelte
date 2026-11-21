<!--
	Admin home (UX-DR46; Stories 3.1, 3.2): the h1 "Übersicht" (visually hidden, as in the
	key-admin-home mockup: the active tab already says it), the worker warning at the top, the flags
	(bookings outside the current times, refused emails; each with links to the bookings), and the
	grid: one column on phones, two equal columns from 1024 px (left: the call list, Story 3.6, and
	"Antworten", the reply reminders with their count badge, always shown, Story 3.4; right: "Nächste
	Buchungen" with an h3 per day, rows or the empty line).
-->
<script lang="ts">
	import AdminBookingRow from '#lib/components/AdminBookingRow.svelte';
	import InlineMessage from '#lib/components/InlineMessage.svelte';
	import PageTitle from '#lib/components/PageTitle.svelte';
	import ReplyReminders from '#lib/components/ReplyReminders.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const home = $derived(data.home);
</script>

<PageTitle title={m.admin_home_title()} />

<!-- tabindex -1: focus lands here should a reply reminder leave nothing else to focus. -->
<h1 class="visually-hidden" tabindex="-1">{m.admin_home_title()}</h1>
{#if home.warning}
	<InlineMessage text={home.warning} />
{/if}
{#if home.flags.length > 0}
	<div class="flags">
		{#each home.flags as flag (flag.kind)}
			<div class="flag">
				<p>{flag.text}</p>
				<ul>
					{#each flag.links as link (link.href)}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an admin booking href from the server -->
						<li><a href={link.href}>{link.text}</a></li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
{/if}
<div class="home-grid">
	<div class="column">
		<ReplyReminders replies={home.replies} variant="home" {form} />
	</div>
	<div class="column">
		<section aria-labelledby="next-heading">
			<h2 id="next-heading" class="section-label">{home.next.heading}</h2>
			{#each home.next.groups as group (group.label)}
				<h3 class="group">{group.label}</h3>
				{#if group.empty}
					<p class="empty">{group.empty}</p>
				{:else}
					<ul class="rows">
						{#each group.rows as row (row.id)}<li><AdminBookingRow {row} /></li>{/each}
					</ul>
				{/if}
			{/each}
		</section>
	</div>
</div>

<style>
	.flags {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-top: var(--space-5);
	}
	.flag {
		padding-left: var(--space-3);
		border-left: 2px solid var(--text);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
	.flag ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.flag a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	.home-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-6);
		margin-top: var(--space-5);
	}
	@media (min-width: 1024px) {
		.home-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.section-label,
	.group {
		color: var(--muted);
		font-size: var(--type-section-label-size);
		font-weight: var(--type-section-label-weight);
		letter-spacing: var(--type-section-label-tracking);
		text-transform: uppercase;
	}
	.section-label {
		margin-bottom: 14px;
	}
	.group {
		margin-top: 18px;
	}
	.group:first-of-type {
		margin-top: 0;
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.empty {
		margin-top: var(--space-2);
		color: var(--muted);
		font-size: var(--type-body-sm-size);
		font-weight: var(--type-body-sm-weight);
	}
</style>
