<!-- Skip link (UX-DR11): first focusable element; off-screen until focused. On a day view it skips
     past the date strip to the start-time list (#times, "Zu den Zeiten"); on the admin day view to
     the bookings (#bookings, "Zu den Buchungen"); elsewhere it goes to #main ("Zum Inhalt"). -->
<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { target = 'main' }: { target?: 'main' | 'times' | 'bookings' } = $props();

	const text = $derived(
		target === 'times' ? m.skip_to_times() : target === 'bookings' ? m.skip_to_bookings() : m.skip_to_content()
	);
</script>

<a class="skip-link" href={`#${target}`}>
	{text}
</a>

<style>
	.skip-link {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 10;
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		color: var(--text);
		border: var(--border-control);
		border-radius: var(--radius);
		font-size: var(--type-button-size);
		font-weight: var(--type-button-weight);
		letter-spacing: var(--type-button-tracking);
		text-decoration: none;
		transform: translateY(-200%);
	}
	.skip-link:focus {
		transform: none;
	}
</style>
