// Server render of `/admin/settings` (Story 3.7): the title and hidden h1, one section per card with
// its section-label h2, labels, notes, prefilled values (no password value), the secondary
// "Speichern" per card, the hours flag with its link, errors with aria-invalid and autofocus after a
// native POST (values kept, other cards unchanged), "Gespeichert." as a status and the failure alert
// in that card only.
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './(portal)/settings/+page.svelte';
import { buildSettingsView, type SettingsInputs } from '#lib/server/settings-view.ts';

vi.mock('$app/state', () => ({ page: { data: {}, status: 200, url: new URL('http://localhost/admin/settings') }, navigating: { to: null } }));
vi.mock('$app/navigation', () => ({ afterNavigate: () => {}, invalidateAll: async () => {}, replaceState: () => {} }));

const inputs: SettingsInputs = {
	settings: { changeoverMin: 15, openMinute: 600, closeMinute: 1320, horizonDays: 14, preheatMinMin: 30, preheatMaxMin: 40 },
	instructions: { de: 'Box links.', en: 'Box left.' },
	contact: 'sauna@example.ch',
	outside: null
};

const page = (form: unknown = null, over: Partial<SettingsInputs> = {}, locale: 'de' | 'en' = 'de') =>
	render(SettingsPage, { props: { data: { view: buildSettingsView({ ...inputs, ...over }, locale) }, form } as never });

/** The markup of one card's section. */
const section = (body: string, card: string) =>
	body.match(new RegExp(`<section[^>]*aria-labelledby="settings-${card}-title"[^>]*>.*?</section>`, 's'))?.[0] ?? '';
const input = (body: string, id: string) => body.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

describe('settings page', () => {
	it('has the title, a hidden h1 and one card per group in order, each with its h2 and "Speichern"', () => {
		const { head, body } = page();
		expect(head).toContain('<title>Einstellungen · Sauna Luegisee</title>');
		expect(body).toMatch(/<h1 class="visually-hidden"[^>]*>Einstellungen<\/h1>/);
		expect([...body.matchAll(/<h2 id="settings-([a-z]+)-title"[^>]*>(.*?)<\/h2>/g)].map((h) => [h[1], h[2]])).toEqual([
			['hours', 'Betriebszeiten'],
			['changeover', 'Wechselzeit'],
			['horizon', 'Buchungshorizont'],
			['preheat', 'Vorheizzeit'],
			['instructions', 'Anleitung DE / EN'],
			['contact', 'Kontaktadresse'],
			['password', 'Passwort']
		]);
		expect(body.match(/<button class="secondary[^"]*" type="submit"[^>]*>Speichern<\/button>/g)).toHaveLength(7);
		expect(body).not.toContain('role="alert"');
		expect(body).not.toContain('<dialog');
	});

	it('posts each card to its action; the pre-heat card to its check', () => {
		const { body } = page();
		expect([...body.matchAll(/<form method="POST" action="([^"]+)"/g)].map((f) => f[1])).toEqual([
			'?/hours',
			'?/changeover',
			'?/horizon',
			'?/preheatCheck',
			'?/instructions',
			'?/contact',
			'?/password'
		]);
	});

	it('labels and prefills the fields; the password stays empty', () => {
		const { body } = page();
		expect(body).toMatch(/<label for="settings-hours-open"[^>]*>Von<\/label>/);
		expect(body).toMatch(/<label for="settings-hours-close"[^>]*>Bis<\/label>/);
		expect(input(body, 'settings-hours-open')).toMatch(/type="time"/);
		expect(input(body, 'settings-hours-open')).toMatch(/step="300"/);
		expect(input(body, 'settings-hours-open')).toMatch(/value="10:00"/);
		expect(input(body, 'settings-hours-close')).toMatch(/value="22:00"/);
		expect(body).toMatch(/<label for="settings-changeover-minutes"[^>]*>Minuten<\/label>/);
		expect(input(body, 'settings-changeover-minutes')).toMatch(/type="number"/);
		expect(input(body, 'settings-changeover-minutes')).toMatch(/inputmode="numeric"/);
		expect(input(body, 'settings-changeover-minutes')).toMatch(/value="15"/);
		expect(input(body, 'settings-horizon-days')).toMatch(/value="14"/);
		expect(body).toMatch(/<label for="settings-preheat-min"[^>]*>Kürzeste Zeit \(Minuten\)<\/label>/);
		expect(body).toMatch(/<label for="settings-preheat-max"[^>]*>Längste Zeit \(Minuten\)<\/label>/);
		expect(input(body, 'settings-preheat-min')).toMatch(/value="30"/);
		expect(input(body, 'settings-preheat-max')).toMatch(/value="40"/);
		expect(body).toMatch(/<label for="settings-instructions-de"[^>]*>Deutsch<\/label>/);
		expect(body).toMatch(/<textarea[^>]*id="settings-instructions-de"[^>]*lang="de"[^>]*>Box links\.<\/textarea>/);
		expect(body).toMatch(/<textarea[^>]*id="settings-instructions-en"[^>]*lang="en"[^>]*>Box left\.<\/textarea>/);
		expect(input(body, 'settings-contact-email')).toMatch(/type="email"/);
		expect(input(body, 'settings-contact-email')).toMatch(/value="sauna@example.ch"/);
		const password = input(body, 'settings-password-password');
		expect(password).toMatch(/type="password"/);
		expect(password).toMatch(/autocomplete="new-password"/);
		expect(password).not.toMatch(/value="[^"]/);
		expect(body).toMatch(/<label for="settings-password-password"[^>]*>Neues Passwort<\/label>/);
	});

	it('shows the notes under Wechselzeit and Passwort only', () => {
		const { body } = page();
		expect(section(body, 'changeover')).toContain('<p class="note');
		expect(section(body, 'changeover')).toContain('Gilt nur für neue Buchungen.');
		expect(section(body, 'password')).toContain('Alle anderen Admins werden abgemeldet.');
		expect(body.match(/<p class="note/g)).toHaveLength(2);
	});

	it('shows the hours flag with a link to each booking', () => {
		const { body } = page(null, {
			outside: {
				kind: 'outside',
				text: '1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.',
				links: [{ href: '/admin/booking/7' as never, text: 'Di 12. Januar, 20:30 · Tom Brunner' }]
			}
		});
		const hours = section(body, 'hours');
		expect(hours).toContain('1 Buchung liegt ausserhalb der neuen Zeiten. Sie bleibt gültig.');
		expect(hours).toMatch(/<a href="\/admin\/booking\/7"[^>]*>Di 12\. Januar, 20:30 · Tom Brunner<\/a>/);
	});

	it('after an invalid native POST: errors in that card, values kept, first error autofocused, other cards unchanged', () => {
		const { body } = page({ card: 'preheat', errors: { min: 'settings_preheat_swapped' }, values: { min: '45', max: '40' } });
		const min = input(body, 'settings-preheat-min');
		expect(min).toMatch(/value="45"/);
		expect(min).toMatch(/aria-invalid="true"/);
		expect(min).toMatch(/aria-describedby="settings-preheat-min-error"/);
		expect(min).toMatch(/autofocus/);
		expect(body).toMatch(/id="settings-preheat-min-error"[^>]*>.*Die kürzeste Zeit darf nicht länger sein als die längste\./s);
		expect(input(body, 'settings-preheat-max')).not.toMatch(/aria-invalid/);
		expect(input(body, 'settings-changeover-minutes')).toMatch(/value="15"/);
		expect(body.match(/aria-invalid="true"/g)).toHaveLength(1);
		expect(body.match(/autofocus/g)?.length).toBe(1);
	});

	it('an invalid textarea is marked too', () => {
		const { body } = page({ card: 'instructions', errors: { en: 'field_required' }, values: { de: 'Box links.', en: '' } });
		expect(body).toMatch(/<textarea[^>]*id="settings-instructions-en"[^>]*aria-invalid="true"[^>]*aria-describedby="settings-instructions-en-error"[^>]*autofocus/);
		expect(body).toMatch(/id="settings-instructions-en-error"[^>]*>.*Bitte ausfüllen\./s);
	});

	it('never puts a posted password back in the field', () => {
		const { body } = page({ card: 'password', errors: { password: 'admin_password_too_short' }, values: { password: 'short pass' } });
		expect(body).not.toContain('short pass');
		expect(body).toContain('Das Passwort braucht mindestens 12 Zeichen.');
	});

	it('shows "Gespeichert." as a status in that card only, and the failure alert in its card', () => {
		const saved = page({ card: 'contact', saved: true }).body;
		expect(section(saved, 'contact')).toMatch(/role="status"[^>]*>.*Gespeichert\./s);
		expect(saved.match(/Gespeichert\./g)).toHaveLength(1);
		const failed = page({ card: 'horizon', code: 'failed' }).body;
		expect(section(failed, 'horizon')).toMatch(/role="alert"[^>]*tabindex="-1"[^>]*>.*Das hat nicht geklappt\./s);
		expect(failed.match(/role="alert"/g)).toHaveLength(1);
	});

	it('renders in English', () => {
		const { body } = page(null, {}, 'en');
		expect(body).toContain('Operating hours');
		expect(body).toMatch(/<label for="settings-preheat-min"[^>]*>Shortest time \(minutes\)<\/label>/);
		expect(body.match(/>Save<\/button>/g)).toHaveLength(7);
	});
});
