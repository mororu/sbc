// The content pages: slot structure, the catalogue entries behind every slot, the placeholder
// marker, paragraphs, the empty-English fallback and the readiness list for Story 5.5.
// Assertions on the live catalogues check structure only, so they keep passing once the operators
// replace the placeholders with real text; behaviour is tested on fixture pages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildSlot,
	contentPage,
	PAGES,
	paragraphs,
	PLACEHOLDER_MARKER,
	placeholderSlots,
	type PageId
} from './pages.ts';

const catalogue = (locale: string): Record<string, unknown> =>
	JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'));
const de = catalogue('de');
const en = catalogue('en');

const allSlots = Object.values(PAGES).flatMap((page) => page.slots);
const headingKeys = allSlots.map((slot) => `${slot.key}_heading`);
const bodyKeys = allSlots.map((slot) => `${slot.key}_body`);
const messageKeys = [...headingKeys, ...bodyKeys];

/** A fake message: German and English text. */
const text = (deText: string, enText: string) => (_?: unknown, o?: { locale?: string }) =>
	o?.locale === 'en' ? enText : deText;

describe('the message catalogues', () => {
	it.each(messageKeys)('%s has a DE and an EN entry, German never empty', (key) => {
		expect(typeof de[key]).toBe('string');
		expect(typeof en[key]).toBe('string');
		expect(de[key]).not.toBe('');
	});

	it.each(headingKeys)('%s has a non-empty English heading', (key) => {
		expect(en[key]).not.toBe('');
	});

	it('wires each slot to its own messages', () => {
		for (const slot of allSlots) {
			expect(slot.heading({}, { locale: 'de' })).toBe(de[`${slot.key}_heading`]);
			expect(slot.heading({}, { locale: 'en' })).toBe(en[`${slot.key}_heading`]);
			expect(slot.body({}, { locale: 'de' })).toBe(de[`${slot.key}_body`]);
			expect(slot.body({}, { locale: 'en' })).toBe(en[`${slot.key}_body`]);
		}
	});

	it('has unique slot keys', () => {
		expect(new Set(allSlots.map((s) => s.key)).size).toBe(allSlots.length);
	});

	it('puts the placeholder marker, if any, exactly at the start', () => {
		for (const key of messageKeys) {
			for (const value of [de[key], en[key]] as string[]) {
				if (/PLATZHALTER/i.test(value)) expect(value.startsWith(`${PLACEHOLDER_MARKER} `)).toBe(true);
			}
		}
	});

	it.each(messageKeys)('%s is a placeholder in both languages or in neither (an empty EN counts as German)', (key) => {
		const deMarked = (de[key] as string).startsWith(PLACEHOLDER_MARKER);
		if (en[key] !== '') expect((en[key] as string).startsWith(PLACEHOLDER_MARKER)).toBe(deMarked);
	});

	it('no longer has the Story 1.2 stub text', () => {
		expect(de).not.toHaveProperty('stub_body');
		expect(en).not.toHaveProperty('stub_body');
	});
});

describe('contentPage', () => {
	it('builds /info in German: title and five slots in order, each with heading and text', () => {
		const page = contentPage('info', 'de');
		expect(page.title).toBe("So funktioniert's");
		expect(page.slots.map((s) => s.key)).toEqual([
			'info_location',
			'info_heating',
			'info_keybox',
			'info_cancelling',
			'info_contact'
		]);
		for (const slot of page.slots) {
			expect(slot.heading).not.toBe('');
			expect(slot.text).not.toBe('');
			expect(slot.lang).toBeNull();
		}
	});

	it('builds /privacy in English with six slots', () => {
		const page = contentPage('privacy', 'en');
		expect(page.title).toBe('Privacy');
		expect(page.slots.map((s) => s.key)).toEqual([
			'privacy_operator',
			'privacy_contact',
			'privacy_purposes',
			'privacy_retention',
			'privacy_backups',
			'privacy_tracking'
		]);
		const retention = page.slots.find((s) => s.key === 'privacy_retention');
		expect(retention?.heading).toBe(en.privacy_retention_heading);
		expect(retention?.text).toBe(en.privacy_retention_body || de.privacy_retention_body);
	});

	it.each([
		['info', 5],
		['privacy', 6],
		['imprint', 4]
	] as [PageId, number][])('%s has %i slots in both languages', (id, count) => {
		expect(contentPage(id, 'de').slots).toHaveLength(count);
		expect(contentPage(id, 'en').slots).toHaveLength(count);
	});

	it('has the imprint title in both languages', () => {
		expect(contentPage('imprint', 'de').title).toBe('Impressum');
		expect(contentPage('imprint', 'en').title).toBe('Imprint');
	});

	it('builds an injected page', () => {
		const pages = {
			info: { title: text('Info', 'Info'), slots: [{ key: 'a', heading: text('Titel', 'Heading'), body: text('Text', 'Text EN') }] },
			privacy: { title: text('D', 'P'), slots: [] },
			imprint: { title: text('I', 'I'), slots: [] }
		};
		expect(contentPage('info', 'en', pages)).toEqual({
			title: 'Info',
			slots: [{ key: 'a', heading: 'Heading', text: 'Text EN', lang: null }]
		});
	});
});

describe('buildSlot: untranslated text', () => {
	const slot = { key: 'x', heading: text('Titel', 'Heading'), body: text('Deutscher Text', '') };

	it('shows the German text marked lang="de" when the English one is empty', () => {
		expect(buildSlot(slot, 'en')).toEqual({ key: 'x', heading: 'Heading', text: 'Deutscher Text', lang: 'de' });
	});

	it('shows German as is in German mode', () => {
		expect(buildSlot(slot, 'de')).toEqual({ key: 'x', heading: 'Titel', text: 'Deutscher Text', lang: null });
	});
});

describe('paragraphs', () => {
	it('keeps the lines of an address in one paragraph', () => {
		expect(paragraphs('Verein Sauna Luegisee\nSeestrasse 1\n6000 Luzern')).toEqual([
			'Verein Sauna Luegisee\nSeestrasse 1\n6000 Luzern'
		]);
	});

	it('splits at blank lines, trims, and drops empty paragraphs from blank-line runs', () => {
		expect(paragraphs('\n  Erster Absatz.\n\n\n \n\nZweiter\nAbsatz.  \n\n')).toEqual([
			'Erster Absatz.',
			'Zweiter\nAbsatz.'
		]);
	});

	it('gives no paragraphs for blank text', () => {
		expect(paragraphs('  \n\n ')).toEqual([]);
	});
});

describe('placeholderSlots', () => {
	it('lists only slot keys of the live catalogues', () => {
		const keys = allSlots.map((s) => s.key);
		for (const key of placeholderSlots()) expect(keys).toContain(key);
	});

	it('lists a slot that still has the marker or a bracketed gap in DE or EN, and skips filled ones', () => {
		const heading = text('Titel', 'Heading');
		const pages = {
			info: {
				title: text('Info', 'Info'),
				slots: [
					{ key: 'filled', heading, body: text('Echt', 'Real') },
					{ key: 'de_only', heading, body: text('[PLATZHALTER] x', 'Real') },
					{ key: 'en_only', heading, body: text('Echt', '[PLATZHALTER] x') },
					{ key: 'en_empty', heading, body: text('Echt', '') },
					{ key: 'gap_de', heading, body: text('Bis zu [Frist] gespeichert.', 'Kept for up to 30 days.') },
					{ key: 'gap_en', heading, body: text('Bis zu 30 Tage.', 'Kept for up to [period].') },
					{ key: 'heading', heading: text('[PLATZHALTER] Titel', 'Heading'), body: text('Echt', 'Real') }
				]
			},
			privacy: { title: text('D', 'P'), slots: [] },
			imprint: { title: text('I', 'I'), slots: [] }
		};
		expect(placeholderSlots(pages)).toEqual(['de_only', 'en_only', 'gap_de', 'gap_en', 'heading']);
	});
});
