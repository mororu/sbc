// Story 3.3: server render of the impact dialog per outcome: none (title, what line, mini row,
// confirm then Abbrechen), stale (the stale line above the what line, confirm kept), past
// ("Hat schon begonnen.", no confirm form) and failed (the failure alert).
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { buildImpactRow } from '#lib/server/impact-view.ts';
import ImpactDialog from './ImpactDialog.svelte';

const row = buildImpactRow(
	{
		affected: { id: 2, start: '2027-01-12T16:15:00Z', durationMin: 60, changeoverMin: 15, createdAt: '2027-01-07T10:00:00Z' },
		told: { heat: 'hot', earliest: null, latest: null },
		current: { heat: 'cold', earliest: '2027-01-12T15:35:00Z', latest: '2027-01-12T15:45:00Z' },
		class: 'urgent',
		consequence: 'mail'
	},
	{ now: '2027-01-12T09:00:00Z', locale: 'de', firstName: 'Tom', date: '2027-01-12' }
);

const dialog = (outcome: { kind: 'stale' | 'past' | 'failed'; text: string } | null = null) =>
	render(ImpactDialog, {
		props: {
			id: 'd',
			title: 'Buchung löschen?',
			what: 'Anna Meier · Di 12. Januar, 16:00–17:00',
			row,
			confirm: 'Buchung löschen',
			cancel: 'Abbrechen',
			destructive: true,
			action: '?/delete',
			fields: { impactToken: 'T' },
			submit: () => {},
			outcome
		}
	}).body;

const buttons = (body: string) => [...body.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((b) => b[1]);

describe('ImpactDialog', () => {
	it('renders the title, the what line, the mini row with spaced text, confirm then Abbrechen', () => {
		const body = dialog();
		expect(body).toMatch(/<dialog[^>]*aria-labelledby="d-title"[^>]*aria-describedby="d-consequence"/);
		expect(body).toMatch(/<span>Tom, 17:15:<\/span> /);
		expect(body).toContain('<span class="visually-hidden"> wird zu </span>');
		expect(body).toMatch(/id="d-consequence"[^>]*>.*bekommt eine Mail\./s);
		expect(body).toMatch(/<input type="hidden" name="impactToken" value="T"/);
		expect(buttons(body)).toEqual(['Buchung löschen', 'Abbrechen']);
		expect(body).not.toContain('role="alert"');
	});

	it('stale: shows the stale line above the what line and keeps the confirm', () => {
		const body = dialog({ kind: 'stale', text: 'Die Auswirkung hat sich geändert. Bitte prüf sie nochmal.' });
		const stale = body.indexOf('Die Auswirkung hat sich geändert.');
		expect(stale).toBeGreaterThan(-1);
		expect(stale).toBeLessThan(body.indexOf('Anna Meier · Di 12. Januar'));
		expect(body).toContain('role="status"');
		expect(buttons(body)).toEqual(['Buchung löschen', 'Abbrechen']);
	});

	it('past: shows "Hat schon begonnen." and no confirm form', () => {
		const body = dialog({ kind: 'past', text: 'Hat schon begonnen.' });
		expect(body).toContain('Hat schon begonnen.');
		expect(body).not.toContain('<form');
		expect(buttons(body)).toEqual(['Abbrechen']);
	});

	it('failed: shows the failure alert, focusable, and keeps the confirm', () => {
		const body = dialog({ kind: 'failed', text: 'Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal.' });
		expect(body).toMatch(/role="alert"[^>]*tabindex="-1"[^>]*>.*Das hat nicht geklappt\. Nichts wurde geändert\./s);
		expect(buttons(body)).toEqual(['Buchung löschen', 'Abbrechen']);
	});

	it('without a row (the pre-heat dialog, Story 3.7): no mini row, the what line is the consequence', () => {
		const body = render(ImpactDialog, {
			props: {
				id: 'preheat',
				title: 'Vorheizzeit ändern?',
				what: '30–40 → 40–50 Minuten · 1 Buchung bekommt eine neue Ankunftszeit',
				confirm: 'Speichern',
				cancel: 'Abbrechen',
				action: '?/preheat',
				fields: { min: '40', max: '50', impactToken: 'T' },
				submit: () => {}
			}
		}).body;
		expect(body).toMatch(/<dialog[^>]*aria-describedby="preheat-consequence"/);
		expect(body).toMatch(/<p class="what tabular[^"]*" id="preheat-consequence">30–40 → 40–50 Minuten · 1 Buchung bekommt eine neue Ankunftszeit<\/p>/);
		expect(body).not.toContain('class="mini');
		expect(body.match(/id="preheat-consequence"/g)).toHaveLength(1);
		expect(body).toMatch(/<form method="POST" action="\?\/preheat"/);
		expect(body).toMatch(/<input type="hidden" name="min" value="40"/);
		expect(buttons(body)).toEqual(['Speichern', 'Abbrechen']);
		expect(body).not.toMatch(/class="confirm[^"]*destructive/);
	});
});
