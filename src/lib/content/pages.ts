// The structure of the content pages `/info`, `/privacy` and `/imprint` (FR-29, UX-DR47–49): an
// ordered list of slots per page, each a heading and a body message in `messages/{de,en}.json`.
// Until the operators supply the text, every body starts with `PLACEHOLDER_MARKER`, so the launch
// readiness check (Story 5.5) can find it with `placeholderSlots()`. Client-safe: messages only.
import { m } from '#lib/paraglide/messages.js';
import { baseLocale, locales, type Locale } from '#lib/paraglide/runtime.js';

/** The fixed marker every placeholder starts with, in both languages. */
export const PLACEHOLDER_MARKER = '[PLATZHALTER]';

/** Any bracketed token: the marker, or a gap left in drafted text such as `[Frist]` / `[period]`. */
const OPEN_TOKEN = /\[[^[\]\n]+\]/;

type Message = (inputs?: Record<string, never>, options?: { locale?: Locale }) => string;

type SlotDef = { key: string; heading: Message; body: Message };

export type PageId = 'info' | 'privacy' | 'imprint';

type PageDef = { title: Message; slots: SlotDef[] };

/** The one source of the page structure. A slot `key` names its messages `{key}_heading` and `{key}_body`. */
export const PAGES: Record<PageId, PageDef> = {
	info: {
		title: m.info_title,
		slots: [
			{ key: 'info_location', heading: m.info_location_heading, body: m.info_location_body },
			{ key: 'info_heating', heading: m.info_heating_heading, body: m.info_heating_body },
			{ key: 'info_keybox', heading: m.info_keybox_heading, body: m.info_keybox_body },
			{ key: 'info_cancelling', heading: m.info_cancelling_heading, body: m.info_cancelling_body },
			{ key: 'info_contact', heading: m.info_contact_heading, body: m.info_contact_body }
		]
	},
	privacy: {
		title: m.privacy_title,
		slots: [
			{ key: 'privacy_operator', heading: m.privacy_operator_heading, body: m.privacy_operator_body },
			{ key: 'privacy_contact', heading: m.privacy_contact_heading, body: m.privacy_contact_body },
			{ key: 'privacy_purposes', heading: m.privacy_purposes_heading, body: m.privacy_purposes_body },
			{ key: 'privacy_retention', heading: m.privacy_retention_heading, body: m.privacy_retention_body },
			{ key: 'privacy_backups', heading: m.privacy_backups_heading, body: m.privacy_backups_body },
			{ key: 'privacy_tracking', heading: m.privacy_tracking_heading, body: m.privacy_tracking_body }
		]
	},
	imprint: {
		title: m.imprint_title,
		slots: [
			{ key: 'imprint_operator', heading: m.imprint_operator_heading, body: m.imprint_operator_body },
			{ key: 'imprint_address', heading: m.imprint_address_heading, body: m.imprint_address_body },
			{ key: 'imprint_contact', heading: m.imprint_contact_heading, body: m.imprint_contact_body },
			{ key: 'imprint_responsible', heading: m.imprint_responsible_heading, body: m.imprint_responsible_body }
		]
	}
};

export type Slot = {
	key: string;
	heading: string;
	text: string;
	/** `'de'` when English mode shows the German text because the English one is empty, else null. */
	lang: 'de' | null;
};

export type ContentPage = { title: string; slots: Slot[] };

/** One slot for a locale. An empty English body falls back to the German one, marked `lang="de"`. */
export function buildSlot(slot: SlotDef, locale: Locale): Slot {
	const heading = slot.heading({}, { locale });
	const text = slot.body({}, { locale });
	if (text === '' && locale !== baseLocale) {
		return { key: slot.key, heading, text: slot.body({}, { locale: baseLocale }), lang: 'de' };
	}
	return { key: slot.key, heading, text, lang: null };
}

/** A content page's title and ordered slots for a locale. */
export function contentPage(id: PageId, locale: Locale, pages: Record<PageId, PageDef> = PAGES): ContentPage {
	const page = pages[id];
	return { title: page.title({}, { locale }), slots: page.slots.map((slot) => buildSlot(slot, locale)) };
}

/**
 * A slot text as paragraphs: trimmed, split at blank lines, empty paragraphs dropped. Single
 * newlines stay inside a paragraph and render as line breaks (a postal address keeps its lines).
 */
export function paragraphs(text: string): string[] {
	return text
		.trim()
		.split(/\n[ \t]*\n/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph !== '');
}

/**
 * Every slot key whose heading or body, in DE or EN, still holds operator work (Story 5.5): it
 * starts with the placeholder marker or contains any bracketed gap such as `[Frist]` / `[period]`.
 */
export function placeholderSlots(pages: Record<PageId, PageDef> = PAGES): string[] {
	return Object.values(pages)
		.flatMap((page) => page.slots)
		.filter((slot) =>
			locales.some((locale) =>
				[slot.heading, slot.body].some((msg) => {
					const value = msg({}, { locale });
					return value.startsWith(PLACEHOLDER_MARKER) || OPEN_TOKEN.test(value);
				})
			)
		)
		.map((slot) => slot.key);
}
