// The settings page (EXPERIENCE "Settings card", Voice and Tone "Settings"; FR-15, FR-20; Stories
// 3.7, 3.8): one card per group, in order Saison, Betriebszeiten, Wechselzeit (note),
// Buchungshorizont, Vorheizzeit, Schlüsselbox-Code (note), Anleitung DE / EN, Kontaktadresse,
// Passwort (note), each with its fields prefilled from the setting row (the password always empty),
// its labels, and the text of every error key. The "outside the times" flag is split by cause
// (`outsideReason`): the season card lists the bookings in no season, the hours card those outside
// the hours (the home keeps one combined flag). Both are derived on every load, so they stay until
// those bookings start.
// The season card (`seasonTarget`) edits the row containing today, else the next one; with neither,
// it shows the last ended row read-only and creates the next season. The keybox card lists the
// upcoming bookings whose keybox email went out with an old code, grouped by code.
// `preheatDialog` words the pre-heat impact for the dialog. Every string is formatted here on the
// server; client code never needs src/lib/time. Read-only: nothing here writes.
import { m } from '#lib/paraglide/messages.js';
import { outsideReason } from '#lib/domain/index.ts';
import {
	CHANGEOVER_RANGE,
	HORIZON_RANGE,
	hhmm,
	HOURS_STEP_MIN,
	INSTRUCTIONS_MAX,
	KEYBOX_CODE_MAX,
	PREHEAT_RANGE,
	SETTINGS_ERROR_KEYS,
	type SettingsCard,
	type SettingsErrorKey
} from '#lib/schemas/index.ts';
import { compareDates, compareInstants, formatDateWithYear, today, type Instant, type LocalDate, type Locale } from '#lib/time/index.ts';
import { loadAdminRowContext, type AdminRowContext } from './admin-day-view.ts';
import { flagLink, type HomeFlag } from './admin-view.ts';
import { now as clockNow } from './clock.ts';
import {
	getAdminContact,
	getFutureFlagCandidates,
	getKeyboxSettings,
	getOldCodeBookings,
	getSeasonRows,
	getSettings,
	type FlagCandidate,
	type OldCodeBooking,
	type PreheatImpact,
	type SeasonRow
} from './db/queries/index.ts';

type Db = Parameters<typeof getSettings>[0];

/** One field of a card. `name` is the posted field; the input id is `settings-{card}-{name}`. */
export type SettingsFieldView = {
	name: string;
	label: string;
	/** The prefilled value; always empty for the password. */
	value: string;
	kind: 'time' | 'number' | 'date' | 'text' | 'textarea' | 'email' | 'password';
	min?: number;
	max?: number;
	/** `step` in the input's unit: seconds for time inputs (300), else the number step. */
	step?: number;
	maxlength?: number;
	/** Shown and posted but not editable: the Beginn of a season that has started. */
	readOnly?: boolean;
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
	/** The season card: the bookings in no season; the hours card: those outside the hours; with links, else null. */
	flag: HomeFlag | null;
	/** Posted with the form but not shown: the season row's `id`. */
	hidden: { name: string; value: string }[];
	/** The button: "Speichern", or "Nächste Saison anlegen". */
	submitLabel: string;
	/** A read-only line above the fields: "Letzte Saison (vorbei)" with "9. Januar 2027 – 30. April 2027". */
	readOnly: { label: string; text: string } | null;
	/** The keybox card: the upcoming bookings sent an old code, one group per code; else empty. */
	groups: OldCodeGroup[];
	/** "Kommende Buchungen mit einem alten Code:" above two or more groups; else null. */
	groupsHeading: string | null;
};

/** One old code: "3 kommende Buchungen haben ihre Schlüsselmail noch mit dem alten Code 4711 bekommen:" and a link per booking. */
export type OldCodeGroup = { code: string; text: string; links: HomeFlag['links'] };

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
	/** The "outside the times" flag split by cause (`buildSettingsFlags`). */
	flags: SettingsFlags;
	/** Every season row, and today in Zurich (the season card's target). */
	seasons: SeasonRow[];
	today: LocalDate;
	/** The current keybox code (trimmed), or null when unset. */
	keyboxCode: string | null;
	/** `getOldCodeBookings`: the upcoming bookings sent an old code, in start order. */
	oldCode: OldCodeBooking[];
};

/** The bookings outside the current times, by cause: in no season, or outside the hours. */
export type SettingsFlags = { season: HomeFlag | null; hours: HomeFlag | null };

/** Pure: the season and hours flags over the bookings that have not started (`outsideReason`, season first). */
export function buildSettingsFlags(candidates: FlagCandidate[], context: AdminRowContext): SettingsFlags {
	const { locale } = context;
	const future = candidates.filter((b) => compareInstants(b.start, context.now) > 0);
	const flag = (reason: 'season' | 'hours'): HomeFlag | null => {
		const list = future.filter((b) => outsideReason(b, context.seasons, context.settings) === reason);
		if (list.length === 0) return null;
		return { kind: 'outside', text: m.admin_flag_outside({ count: list.length }, { locale }), links: list.map((b) => flagLink(b, locale)) };
	};
	return { season: flag('season'), hours: flag('hours') };
}

/**
 * Pure: what the season card edits, with `today` in Zurich:
 * 1. the row containing today, else 2. the earliest row starting after today (`edit`);
 * 3. else `create`, showing the latest ended row (4. with no row at all, none).
 */
export type SeasonTarget = { kind: 'edit'; row: SeasonRow } | { kind: 'create'; last: SeasonRow | null };

export function seasonTarget(rows: SeasonRow[], today: LocalDate): SeasonTarget {
	const current = rows.find((r) => compareDates(r.startDate, today) <= 0 && compareDates(today, r.endDate) <= 0);
	if (current) return { kind: 'edit', row: current };
	const next = rows
		.filter((r) => compareDates(r.startDate, today) > 0)
		.sort((a, b) => compareDates(a.startDate, b.startDate))[0];
	if (next) return { kind: 'edit', row: next };
	const last = rows
		.filter((r) => compareDates(r.endDate, today) < 0)
		.sort((a, b) => compareDates(b.endDate, a.endDate))[0];
	return { kind: 'create', last: last ?? null };
}

/** Pure: the old-code groups, one per code, ordered by their first booking's start. */
export function oldCodeGroups(bookings: OldCodeBooking[], locale: Locale): OldCodeGroup[] {
	const byCode = new Map<string, OldCodeBooking[]>();
	// `bookings` are in start order, so the map's insertion order is the order of first starts.
	for (const b of bookings) byCode.set(b.code, [...(byCode.get(b.code) ?? []), b]);
	return [...byCode].map(([code, list]) => ({
		code,
		text: m.admin_settings_old_code({ count: list.length, code }, { locale }),
		links: list.map((b) => flagLink(b, locale))
	}));
}

const ERROR_TEXT: Record<SettingsErrorKey, (locale: Locale) => string> = {
	field_required: (locale) => m.field_required({}, { locale }),
	block_date_invalid: (locale) => m.block_date_invalid({}, { locale }),
	block_time_step: (locale) => m.block_time_step({}, { locale }),
	settings_season_order: (locale) => m.settings_season_order({}, { locale }),
	settings_season_overlap: (locale) => m.settings_season_overlap({}, { locale }),
	settings_season_end_past: (locale) => m.settings_season_end_past({}, { locale }),
	settings_season_start_past: (locale) => m.settings_season_start_past({}, { locale }),
	settings_keybox_invalid: (locale) => m.settings_keybox_invalid({}, { locale }),
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
	const save = m.admin_settings_save({}, { locale });
	const card = (
		c: Omit<SettingsCardView, 'action' | 'note' | 'flag' | 'paired' | 'hidden' | 'submitLabel' | 'readOnly' | 'groups' | 'groupsHeading'> &
			Partial<SettingsCardView>
	): SettingsCardView => ({
		action: `?/${c.card}`,
		paired: false,
		note: null,
		flag: null,
		hidden: [],
		submitLabel: save,
		readOnly: null,
		groups: [],
		groupsHeading: null,
		...c
	});
	const target = seasonTarget(input.seasons, input.today);
	const date = (name: 'start' | 'end', label: string, value: string): SettingsFieldView => ({ name, label, value, kind: 'date' });
	const edited = target.kind === 'edit' ? target.row : null;
	const last = target.kind === 'create' ? target.last : null;
	const groups = oldCodeGroups(input.oldCode, locale);
	const errors = Object.fromEntries(SETTINGS_ERROR_KEYS.map((key) => [key, ERROR_TEXT[key](locale)])) as Record<SettingsErrorKey, string>;
	return {
		kind: 'admin-settings',
		title: m.admin_nav_settings({}, { locale }),
		cards: [
			card({
				card: 'season',
				title: m.admin_settings_season({}, { locale }),
				paired: true,
				fields: [
					{
						...date('start', m.admin_settings_season_start({}, { locale }), edited?.startDate ?? ''),
						// A running season's start has passed; `changeSettings` refuses a change.
						...(edited && compareDates(edited.startDate, input.today) < 0 ? { readOnly: true } : {})
					},
					date('end', m.admin_settings_season_end({}, { locale }), edited?.endDate ?? '')
				],
				hidden: edited ? [{ name: 'id', value: String(edited.id) }] : [],
				submitLabel: edited ? save : m.admin_settings_season_create({}, { locale }),
				readOnly: last
					? {
							label: m.admin_settings_season_last({}, { locale }),
							text: m.admin_settings_season_range(
								{ start: formatDateWithYear(last.startDate, locale), end: formatDateWithYear(last.endDate, locale) },
								{ locale }
							)
						}
					: null,
				flag: input.flags.season
			}),
			card({
				card: 'hours',
				title: m.admin_settings_hours({}, { locale }),
				paired: true,
				fields: [
					time('open', m.admin_settings_hours_open({}, { locale }), settings.openMinute),
					time('close', m.admin_settings_hours_close({}, { locale }), settings.closeMinute)
				],
				flag: input.flags.hours
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
				card: 'keybox',
				title: m.admin_settings_keybox({}, { locale }),
				fields: [
					{
						name: 'code',
						label: m.admin_settings_keybox_code({}, { locale }),
						value: input.keyboxCode ?? '',
						kind: 'text',
						maxlength: KEYBOX_CODE_MAX,
						autocomplete: 'off'
					}
				],
				note: m.admin_settings_keybox_note({}, { locale }),
				groups,
				groupsHeading: groups.length >= 2 ? m.admin_settings_old_code_heading({}, { locale }) : null
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
		save,
		saved: m.admin_settings_saved({}, { locale }),
		failed: m.admin_action_failed({}, { locale }),
		errors
	};
}

/** The settings page at `now`: the setting row, the seasons, the keybox code and instructions, the contact, the flags and the old-code list. */
export function loadSettings(locale: Locale, now: Instant = clockNow(), db?: Db): SettingsView {
	const context = loadAdminRowContext(locale, now, db);
	const keybox = getKeyboxSettings(db);
	return buildSettingsView(
		{
			settings: getSettings(db),
			instructions: keybox.instructions,
			contact: getAdminContact(db),
			flags: buildSettingsFlags(getFutureFlagCandidates(now, db), context),
			seasons: getSeasonRows(db),
			today: today(now),
			keyboxCode: keybox.code,
			oldCode: getOldCodeBookings(now, db)
		},
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
