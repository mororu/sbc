// The Blocks pages (EXPERIENCE "Blocks", "Block form", "Impact dialog"; UX-DR40, UX-DR56; Story 3.5):
// the list of upcoming blocks with a delete dialog per row, the block form, and the outcome of
// "Prüfen" (the save dialog or a refusal). The dialogs are built from `getBlockCheck` and
// `getBlockDeletion`, the queries the create-block and delete-block commands recheck. Every
// string is formatted here on the server, so client code never needs src/lib/time.
// Read-only: nothing here writes.
import { impactToken } from '#lib/domain/index.ts';
import type { ResolvedPathname } from '$app/types';
import { ADMIN_TAB_HREF } from '#lib/admin-nav.ts';
import { m } from '#lib/paraglide/messages.js';
import {
	BLOCK_FORM_REASONS,
	minuteOf,
	parseBlockForm,
	type BlockErrorKey,
	type BlockErrors,
	type BlockFormReason,
	type BlockValues
} from '#lib/schemas/index.ts';
import {
	getBlockDeletion,
	getUpcomingBlocks,
	type AdminBlock,
	type BlockCheck,
	type BlockDeletion,
	type BlockReason
} from '#lib/server/db/queries/index.ts';
import {
	compareInstants,
	formatDateShort,
	formatTime,
	formatWeekdayShort,
	localDate,
	localMinuteOfDay,
	toInstant,
	today,
	type Instant,
	type Locale
} from '#lib/time/index.ts';
import { now as clockNow } from './clock.ts';
import { buildImpactRow, type ImpactRowView } from './impact-view.ts';

type Db = Parameters<typeof getUpcomingBlocks>[1];

/** `/admin/blocks/new`: the block form. */
export const NEW_BLOCK_HREF = `${ADMIN_TAB_HREF.blocks}/new` as ResolvedPathname;

/** "Reinigung" · "Wartung" · "Privat". */
export function reasonText(reason: BlockReason | BlockFormReason, locale: Locale): string {
	switch (reason) {
		case 'cleaning':
			return m.admin_block_reason_cleaning({}, { locale });
		case 'maintenance':
			return m.admin_block_reason_maintenance({}, { locale });
		case 'private_use':
			return m.admin_block_reason_private_use({}, { locale });
	}
}

/** "09:00–11:00" */
export const timeRange = (start: Instant, end: Instant) => `${formatTime(start)}–${formatTime(end)}`;

/** The save-block or delete-block impact dialog. */
export type BlockDialogView = {
	/** "Block speichern?" / "Block löschen?" */
	title: string;
	/** "Reinigung · Mo 11. Januar, 09:00–11:00" */
	what: string;
	row: ImpactRowView;
	/** The impact token the form posts (`impactToken`). */
	token: string;
	/** "Block speichern" (primary) / "Block löschen" (destructive): the confirm button. */
	confirm: string;
	destructive: boolean;
	/** "Abbrechen" */
	cancel: string;
	messages: {
		/** "Die Auswirkung hat sich geändert. Bitte prüf sie nochmal." */
		stale: string;
		/** "Hat schon begonnen." */
		past: string;
		/** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." */
		failed: string;
	};
};

type DialogInput = {
	kind: 'save' | 'delete';
	block: { start: Instant; end: Instant; reason: BlockReason | BlockFormReason };
	check: Pick<BlockCheck, 'date' | 'impact' | 'affectedFirstName'>;
};

/** Pure: the impact dialog of saving or deleting a block. */
export function buildBlockDialog(input: DialogInput, context: { now: Instant; locale: Locale }): BlockDialogView {
	const { now, locale } = context;
	const { block, check } = input;
	const save = input.kind === 'save';
	const confirm = save ? m.admin_block_save_button({}, { locale }) : m.admin_block_delete_button({}, { locale });
	return {
		title: save ? m.admin_block_save_title({}, { locale }) : m.admin_block_delete_title({}, { locale }),
		what: m.admin_block_what(
			{ reason: reasonText(block.reason, locale), date: formatDateShort(check.date, locale), time: timeRange(block.start, block.end) },
			{ locale }
		),
		row: buildImpactRow(check.impact, { now, locale, firstName: check.affectedFirstName, date: check.date }),
		token: impactToken(check.impact),
		confirm,
		destructive: !save,
		cancel: m.admin_cancel({}, { locale }),
		messages: {
			stale: m.admin_impact_stale({}, { locale }),
			past: m.admin_started({}, { locale }),
			failed: m.admin_action_failed({}, { locale })
		}
	};
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export type BlockListRow = {
	id: number;
	/** "Mo 11. Januar · 09:00–11:00 · Reinigung" */
	text: string;
	datetime: Instant;
	/** "Hat schon begonnen." for a running block (no delete). */
	started: string | null;
	/** "Block löschen" and its dialog; null once the block has started. */
	delete: BlockDialogView | null;
};

/** `?saved` / `?deleted` on `/admin/blocks`: the status after a save or a delete. */
export type BlocksStatus = 'saved' | 'deleted' | null;

export type BlocksView = {
	kind: 'admin-blocks';
	/** `<title>` and `h1`: "Blocks". */
	title: string;
	/** "Neuer Block" to the form. */
	create: { href: ResolvedPathname; text: string };
	rows: BlockListRow[];
	/** "Keine Blocks geplant." without upcoming blocks. */
	empty: string | null;
	/** "Gespeichert." / "Block gelöscht." from the flag, else null. */
	status: string | null;
	messages: {
		/** "Schon erledigt.": the block was deleted by another admin. */
		gone: string;
	};
};

/** Pure: the Blocks list. `items` are the upcoming blocks in start order, each with its deletion impact (null once started). */
export function buildBlocksView(input: {
	items: { block: AdminBlock; deletion: BlockDeletion | null }[];
	now: Instant;
	locale: Locale;
	status: BlocksStatus;
}): BlocksView {
	const { now, locale } = input;
	const rows = input.items.map(({ block, deletion }): BlockListRow => {
		const started = compareInstants(block.start, now) <= 0 || deletion?.started === true;
		return {
			id: block.id,
			text: m.admin_block_row(
				{ date: formatDateShort(localDate(block.start), locale), time: timeRange(block.start, block.end), reason: reasonText(block.reason, locale) },
				{ locale }
			),
			datetime: block.start,
			started: started ? m.admin_started({}, { locale }) : null,
			delete: !started && deletion ? buildBlockDialog({ kind: 'delete', block, check: deletion }, { now, locale }) : null
		};
	});
	const status =
		input.status === 'saved'
			? m.admin_block_saved({}, { locale })
			: input.status === 'deleted'
				? m.admin_block_deleted({}, { locale })
				: null;
	return {
		kind: 'admin-blocks',
		title: m.admin_blocks_title({}, { locale }),
		create: { href: NEW_BLOCK_HREF, text: m.admin_blocks_new({}, { locale }) },
		rows,
		empty: rows.length === 0 ? m.admin_blocks_empty({}, { locale }) : null,
		status,
		messages: { gone: m.admin_block_gone({}, { locale }) }
	};
}

/** The Blocks list at `now`: the upcoming blocks, with the deletion impact of each one that has not started. */
export function loadBlocksView(locale: Locale, status: BlocksStatus, options: { now?: Instant; db?: Db } = {}): BlocksView {
	const { db } = options;
	const now = options.now ?? clockNow();
	const items = getUpcomingBlocks(now, db).flatMap((block): { block: AdminBlock; deletion: BlockDeletion | null }[] => {
		if (compareInstants(block.start, now) <= 0) return [{ block, deletion: null }];
		const deletion = getBlockDeletion(block.id, now, db);
		// Deleted by another admin between the two reads: not listed.
		return deletion ? [{ block, deletion }] : [];
	});
	return buildBlocksView({ items, now, locale, status });
}

// ---------------------------------------------------------------------------
// The form and "Prüfen"
// ---------------------------------------------------------------------------

export type BlockFormView = {
	kind: 'admin-block-new';
	/** `<title>` and `h1`: "Neuer Block". */
	title: string;
	/** "‹ Blocks" back to the list. */
	back: { href: ResolvedPathname; text: string };
	labels: { date: string; start: string; end: string; reason: string; check: string };
	reasons: { value: BlockFormReason; text: string }[];
	/** The values a fresh form starts with: today, empty times, Reinigung. */
	defaults: BlockValues;
	/** The text of each error key. */
	errors: Record<BlockErrorKey, string>;
	/** "Das hat nicht geklappt. Nichts wurde geändert. Versuch es bitte nochmal." */
	failed: string;
};

/** Pure: the block form. */
export function buildBlockFormView(context: { now: Instant; locale: Locale }): BlockFormView {
	const { now, locale } = context;
	return {
		kind: 'admin-block-new',
		title: m.admin_blocks_new({}, { locale }),
		back: { href: ADMIN_TAB_HREF.blocks, text: m.admin_blocks_title({}, { locale }) },
		labels: {
			date: m.admin_block_field_date({}, { locale }),
			start: m.admin_block_field_start({}, { locale }),
			end: m.admin_block_field_end({}, { locale }),
			reason: m.admin_block_field_reason({}, { locale }),
			check: m.admin_block_check({}, { locale })
		},
		reasons: BLOCK_FORM_REASONS.map((value) => ({ value, text: reasonText(value, locale) })),
		defaults: { date: today(now), start: '', end: '', reason: 'cleaning' },
		errors: {
			field_required: m.field_required({}, { locale }),
			block_date_invalid: m.block_date_invalid({}, { locale }),
			block_time_step: m.block_time_step({}, { locale }),
			block_end_not_after_start: m.block_end_not_after_start({}, { locale }),
			block_time_missing: m.block_time_missing({}, { locale }),
			block_past: m.block_past({}, { locale })
		},
		failed: m.admin_action_failed({}, { locale })
	};
}

/** Pure: "Mo 18:00 (Anna)" for each overlapped booking ("Mo 18:00" without a name). */
function overlapText(bookings: { start: Instant; firstName: string | null }[], locale: Locale): string {
	const list = bookings
		.map((b) => {
			const time = `${formatWeekdayShort(localDate(b.start), locale)} ${formatTime(b.start)}`;
			return b.firstName ? m.admin_block_overlap_item({ time, name: b.firstName }, { locale }) : time;
		})
		.join(', ');
	return m.admin_block_overlap({ count: bookings.length, list }, { locale });
}

/** The refusal text of a conflicting block. */
export function blockRefusalText(conflict: NonNullable<BlockCheck['conflict']>, locale: Locale): string {
	return conflict.kind === 'overlap' ? overlapText(conflict.bookings, locale) : m.admin_block_gap({}, { locale });
}

/**
 * What "Prüfen" shows (Story 3.5): `past` (an inline error at the start), `conflict` with its
 * refusal text, or the save dialog.
 */
export type BlockCheckView =
	| { kind: 'past' }
	| { kind: 'conflict'; text: string }
	| { kind: 'dialog'; dialog: BlockDialogView };

/** Pure: the outcome of "Prüfen" for a block and its check. */
export function buildBlockCheckView(
	block: { start: Instant; end: Instant; reason: BlockFormReason },
	check: BlockCheck,
	context: { now: Instant; locale: Locale }
): BlockCheckView {
	if (check.past) return { kind: 'past' };
	if (check.conflict) return { kind: 'conflict', text: blockRefusalText(check.conflict, context.locale) };
	return { kind: 'dialog', dialog: buildBlockDialog({ kind: 'save', block, check }, context) };
}

/**
 * The block form as Zurich instants (Story 3.5): the shared schema (`parseBlockForm` with
 * `toInstant`), then two checks that need the time zone:
 * - a start or end that does not exist on that date (the spring clock change skips 02:00–02:59):
 *   `block_time_missing` at that field. `toInstant` would move it an hour later, which would
 *   silently lengthen (or invert) the block. Detected as "the instant, formatted back to local
 *   time, is not what was entered".
 * - an end not after the start once both are instants: `block_end_not_after_start`.
 * A time the autumn clock change repeats (02:00–02:59 on its Sunday) exists twice; `toInstant`
 * takes the earlier one (summer time, UTC+2): 31 Oct 2027, 02:30 is 2027-10-31T00:30:00Z.
 */
export function toBlockInstants(
	values: Record<string, unknown>
): { ok: true; value: { start: Instant; end: Instant; reason: BlockFormReason } } | { ok: false; errors: BlockErrors } {
	const parsed = parseBlockForm(values, toInstant);
	if (!parsed.ok) return parsed;
	const { date, start, end } = values as BlockValues;
	const errors: BlockErrors = {};
	const exists = (instant: Instant, time: string) =>
		localDate(instant) === date.trim() && localMinuteOfDay(instant) === minuteOf(time.trim());
	if (!exists(parsed.value.start, start)) errors.start = 'block_time_missing';
	if (!exists(parsed.value.end, end)) errors.end = 'block_time_missing';
	if (errors.start || errors.end) return { ok: false, errors };
	if (compareInstants(parsed.value.start, parsed.value.end) >= 0) return { ok: false, errors: { end: 'block_end_not_after_start' } };
	return parsed;
}
