// Server render of the guest shell and the three content pages: the layout puts the admin contact
// in the footer, and each content page has its own <title>.
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';
import ImprintPage from './imprint/+page.svelte';
import InfoPage from './info/+page.svelte';
import PrivacyPage from './privacy/+page.svelte';

vi.mock('$app/state', () => ({ page: { data: {}, url: new URL('http://localhost/info') } }));

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/paraglide/runtime.js')>()),
	getLocale: () => 'de'
}));

const children = createRawSnippet(() => ({ render: () => '<p>Inhalt</p>' }));

describe('guest layout (server render)', () => {
	it('renders the footer with the admin contact as the last item', () => {
		const adminContact = { address: 'sauna@example.ch', href: 'mailto:sauna@example.ch' };
		const { body } = render(Layout, { props: { data: { adminContact }, children } as never });
		expect(body).toContain('<p>Inhalt</p>');
		const footer = body.match(/<footer.*?<\/footer>/s)?.[0] ?? '';
		const items = footer.match(/<li>.*?<\/li>/gs) ?? [];
		expect(items).toHaveLength(4);
		expect(items[3]).toMatch(/<a[^>]*href="mailto:sauna@example.ch"[^>]*>.*sauna@example.ch<\/a>/s);
	});

	it('renders without a contact link when none is set', () => {
		const { body } = render(Layout, { props: { data: { adminContact: null }, children } as never });
		expect(body).not.toContain('mailto:');
	});
});

describe('content pages (server render)', () => {
	it.each([
		['info', InfoPage, "So funktioniert's · Sauna Luegisee"],
		['privacy', PrivacyPage, 'Datenschutz · Sauna Luegisee'],
		['imprint', ImprintPage, 'Impressum · Sauna Luegisee']
	] as const)('/%s has its own title', (_, Page, title) => {
		expect(render(Page).head).toContain(`<title>${title}</title>`);
	});
});
