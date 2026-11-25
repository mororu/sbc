// The settings page (EXPERIENCE "Settings card", Voice and Tone "Settings"; FR-15, FR-20; Story 3.7):
// one card per group, in order Betriebszeiten, Wechselzeit (note), Buchungshorizont, Vorheizzeit,
// Anleitung DE / EN, Kontaktadresse, Passwort (note), each with its fields prefilled from the setting
// row (the password always empty), its labels, and the text of every error key. The hours card
// carries the "outside the times" flag (`buildHomeFlags` over `getFutureFlagCandidates`, the home's
// flag) whenever a booking that has not started lies outside the current times; it is derived on
// every load, so it stays until those bookings pass. Story 3.8 adds Saison and Schlüsselbox-Code.
// `preheatDialog` words the pre-heat impact for the dialog. Every string is formatted here on the
// server; client code never needs src/lib/time. Read-only: nothing here writes.
import { m } from '#lib/paraglide/messages.js';
import {
	CHANGEOVER_RANGE,
	HORIZON_RANGE,
	hhmm,
	HOURS_STEP_MIN,
	INSTRUCTIONS_MAX,
	PREHEAT_RANGE,
	SETTINGS_ERROR_KEYS,
	type SettingsCard,
	type SettingsErrorKey
} from '#lib/schemas/index.ts';
import type { Instant, Locale } from '#lib/time/index.ts';
import { loadAdminRowContext } from './admin-day-view.ts';
import { buildHomeFlags, type HomeFlag } from './admin-view.ts';
import { now as clockNow } from './clock.ts';
import {
	getAdminContact,
	getFutureFlagCandidates,
	getKeyboxSettings,
	getSettings,
	type PreheatImpact
} from './db/queries/index.ts';

type Db = Parameters<typeof getSettings>[0];

/** One field of a card. `name` is the posted field; the input id is `settings-{card}-{name}`. */
export type SettingsFieldView = {
	name: string;
	label: string;
	/** The prefilled value; always empty for the password. */
	value: string;
	kind: 'time' | 'number' | 'textarea' | 'email' | 'password';
	min?: number;
	max?: number;
	/** `step` in the input's unit: seconds for time inputs (300), else the number step. */
	step?: number;
	maxlength?: number;
	/** The language of the field's content (the instructions). */
	lang?: Locale;
	autocomplete?: string;
};

export type SettingsCardView = {
	card: SettingsCard;
	/** The section-label `h2`: "Betriebszeiten". */
	title: string;
	/** The action "Speichern" posts to: `?/hours`, …; the pre-heat card checks first (`?/preheatCheck`). */
	action: string;
	fields: SettingsFieldView[];
	/** Two fields side by side (Von · Bis, Kürzeste · Längste Zeit). */
	paired: boolean;
	/** "Gilt nur für neue Buchungen." · "Alle anderen Admins werden abgemeldet." */
	note: string | null;
	/** The hours card: the bookings outside the current times, with links; else null. */
	flag: HomeFlag | null;
};

export type SettingsView = {
	kind: 'admin-settings';
	/** `<title>` and the visually hidden `h1`: "Einstellungen". */
	title: string;
	cards: SettingsCardView[];
	/** "Speichern" */
	save: string;
	/** "Gespeichert." */
	saved: string;
	/** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." */
	failed: string;
	/** The text of each error key. */
	errors: Record<SettingsErrorKey, string>;
};

/** What `buildSettingsView` reads. */
export type SettingsInputs = {
	settings: ReturnType<typeof getSettings>;
	instructions: { de: string | null; en: string | null };
	contact: string | null;
	/** The home's "outside the times" flag, or null. */
	outside: HomeFlag | null;
};

const ERROR_TEXT: Record<SettingsErrorKey, (locale: Locale) => string> = {
	field_required: (locale) => m.field_required({}, { locale }),
	block_time_step: (locale) => m.block_time_step({}, { locale }),
	settings_hours_order: (locale) => m.settings_hours_order({}, { locale }),
	settings_changeover_range: (locale) => m.settings_changeover_range({}, { locale }),
	settings_horizon_range: (locale) => m.settings_horizon_range({}, { locale }),
	settings_preheat_range: (locale) => m.settings_preheat_range({}, { locale }),
	settings_preheat_swapped: (locale) => m.settings_preheat_swapped({}, { locale }),
	settings_instructions_too_long: (locale) => m.settings_instructions_too_long({}, { locale }),
	settings_contact_invalid: (locale) => m.settings_contact_invalid({}, { locale }),
	admin_password_too_short: (locale) => m.admin_password_too_short({}, { locale }),
	admin_password_too_long: (locale) => m.admin_password_too_long({}, { locale })
};

const number = (name: string, label: string, value: number, range: { min: number; max: number; step: number }): SettingsFieldView => ({
	name,
	label,
	value: String(value),
	kind: 'number',
	min: range.min,
	max: range.max,
	step: range.step
});

const time = (name: string, label: string, minuteOfDay: number): SettingsFieldView => ({
	name,
	label,
	value: hhmm(minuteOfDay),
	kind: 'time',
	step: HOURS_STEP_MIN * 60
});

/** Pure: the settings page. */
export function buildSettingsView(input: SettingsInputs, locale: Locale): SettingsView {
	const { settings } = input;
	const card = (c: Omit<SettingsCardView, 'action' | 'note' | 'flag' | 'paired'> & Partial<SettingsCardView>): SettingsCardView => ({
		action: `?/${c.card}`,
		paired: false,
		note: null,
		flag: null,
		...c
	});
	const errors = Object.fromEntries(SETTINGS_ERROR_KEYS.map((key) => [key, ERROR_TEXT[key](locale)])) as Record<SettingsErrorKey, string>;
	return {
		kind: 'admin-settings',
		title: m.admin_nav_settings({}, { locale }),
		cards: [
			card({
				card: 'hours',
				title: m.admin_settings_hours({}, { locale }),
				paired: true,
				fields: [
					time('open', m.admin_settings_hours_open({}, { locale }), settings.openMinute),
					time('close', m.admin_settings_hours_close({}, { locale }), settings.closeMinute)
				],
				flag: input.outside
			}),
			card({
				card: 'changeover',
				title: m.admin_settings_changeover({}, { locale }),
				fields: [number('minutes', m.admin_settings_minutes({}, { locale }), settings.changeoverMin, CHANGEOVER_RANGE)],
				note: m.admin_settings_changeover_note({}, { locale })
			}),
			card({
				card: 'horizon',
				title: m.admin_settings_horizon({}, { locale }),
				fields: [number('days', m.admin_settings_days({}, { locale }), settings.horizonDays, HORIZON_RANGE)]
			}),
			card({
				card: 'preheat',
				title: m.admin_settings_preheat({}, { locale }),
				action: '?/preheatCheck',
				paired: true,
				fields: [
					number('min', m.admin_settings_preheat_min({}, { locale }), settings.preheatMinMin, PREHEAT_RANGE),
					number('max', m.admin_settings_preheat_max({}, { locale }), settings.preheatMaxMin, PREHEAT_RANGE)
				]
			}),
			card({
				card: 'instructions',
				title: m.admin_settings_instructions({}, { locale }),
				fields: (['de', 'en'] as const).map((lang) => ({
					name: lang,
					label: lang === 'de' ? m.admin_settings_instructions_de({}, { locale }) : m.admin_settings_instructions_en({}, { locale }),
					value: input.instructions[lang] ?? '',
					kind: 'textarea' as const,
					maxlength: INSTRUCTIONS_MAX,
					lang
				}))
			}),
			card({
				card: 'contact',
				title: m.admin_settings_contact({}, { locale }),
				fields: [
					{
						name: 'email',
						label: m.admin_settings_contact_email({}, { locale }),
						value: input.contact ?? '',
						kind: 'email',
						autocomplete: 'email'
					}
				]
			}),
			card({
				card: 'password',
				title: m.admin_settings_password({}, { locale }),
				fields: [
					{
						name: 'password',
						label: m.admin_settings_password_new({}, { locale }),
						value: '',
						kind: 'password',
						autocomplete: 'new-password'
					}
				],
				note: m.admin_settings_password_note({}, { locale })
			})
		],
		save: m.admin_settings_save({}, { locale }),
		saved: m.admin_settings_saved({}, { locale }),
		failed: m.admin_action_failed({}, { locale }),
		errors
	};
}

/** The settings page at `now`: the setting row, the instructions, the contact and the hours flag. */
export function loadSettings(locale: Locale, now: Instant = clockNow(), db?: Db): SettingsView {
	const context = loadAdminRowContext(locale, now, db);
	const outside = buildHomeFlags(getFutureFlagCandidates(now, db), context).find((f) => f.kind === 'outside') ?? null;
	const keybox = getKeyboxSettings(db);
	return buildSettingsView(
		{ settings: getSettings(db), instructions: keybox.instructions, contact: getAdminContact(db), outside },
		locale
	);
}

/** The pre-heat dialog: "Vorheizzeit ändern?", the what line, "Speichern" and "Abbrechen". */
export type PreheatDialogView = {
	title: string;
	/** "30–40 → 40–50 Minuten · 1 Buchung bekommt eine neue Ankunftszeit" */
	what: string;
	confirm: string;
	cancel: string;
	/** The impact token the confirm posts (`PreheatImpact.token`). */
	token: string;
	/** The checked window, posted again with the confirm. */
	values: { min: string; max: string };
	messages: {
		/** "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." */
		stale: string;
		/** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." */
		failed: string;
	};
};

/** Pure: the pre-heat dialog of an impact. */
export function preheatDialog(impact: PreheatImpact, locale: Locale): PreheatDialogView {
	const range = (p: { minMin: number; maxMin: number }) => `${p.minMin}–${p.maxMin}`;
	return {
		title: m.admin_settings_preheat_title({}, { locale }),
		what: m.admin_settings_preheat_what({ count: impact.changed.length, from: range(impact.from), to: range(impact.to) }, { locale }),
		confirm: m.admin_settings_save({}, { locale }),
		cancel: m.admin_cancel({}, { locale }),
		token: impact.token,
		values: { min: String(impact.to.minMin), max: String(impact.to.maxMin) },
		messages: { stale: m.admin_impact_stale({}, { locale }), failed: m.admin_action_failed({}, { locale }) }
	};
}
