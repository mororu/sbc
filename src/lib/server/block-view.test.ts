// Story 3.5: the Blocks view models: the list rows and their delete dialogs, the empty line and the
// statuses, the form labels and reasons, the "Prüfen" outcomes (past, overlap and gap refusals, the
// save dialog), and the block rows on the admin day view. `now` Mon 11 Jan 2027, 08:00 Zurich.
import { describe, expect, it } from 'vitest';
import type { Impact } from '#lib/domain/index.ts';
import type { AdminBlock, AdminBooking, BlockCheck } from '#lib/server/db/queries/index.ts';
import { buildAdminDayView } from './admin-day-view.ts';
import { buildBlockCheckView, buildBlockFormView, buildBlocksView, toBlockInstants } from './block-view.ts';
import { buildReplies } from './reply-view.ts';

const NOW = '2027-01-11T07:00:00Z';
const NONE: Impact = { affected: null, told: null, current: null, class: 'none', consequence: 'none' };
const MAIL: Impact = {
	affected: { id: 3, start: '2027-01-11T17:00:00Z', durationMin: 60, changeoverMin: 15, createdAt: '2027-01-07T10:00:00Z' },
	told: { heat: 'cold', earliest: '2027-01-11T16:20:00Z', latest: '2027-01-11T16:30:00Z' },
	current: { heat: 'cold', earliest: '2027-01-11T16:25:00Z', latest: '2027-01-11T16:30:00Z' },
	class: 'urgent',
	consequence: 'mail'
};
const cleaning: AdminBlock = { id: 1, start: '2027-01-11T08:00:00Z', end: '2027-01-11T10:00:00Z', reason: 'cleaning' };

describe('buildBlocksView', () => {
	it('lists "Mo 11. Januar · 09:00–11:00 · Reinigung" with its delete dialog', () => {
		const view = buildBlocksView({
			items: [{ block: cleaning, deletion: { block: cleaning, date: '2027-01-11', started: false, impact: NONE, affectedFirstName: null } }],
			now: NOW,
			locale: 'de',
			status: null
		});
		expect(view).toMatchObject({ title: 'Blocks', create: { href: '/admin/blocks/new', text: 'Neuer Block' }, empty: null, status: null });
		expect(view.rows[0]).toMatchObject({ id: 1, text: 'Mo 11. Januar · 09:00–11:00 · Reinigung', started: null });
		expect(view.rows[0].delete).toMatchObject({
			title: 'Block löschen?',
			what: 'Reinigung · Mo 11. Januar, 09:00–11:00',
			confirm: 'Block löschen',
			destructive: true,
			cancel: 'Abbrechen',
			row: { text: 'Kein Effekt auf andere Buchungen.' }
		});
	});

	it('has no delete on a running block, and "Hat schon begonnen."', () => {
		const running = { ...cleaning, start: '2027-01-11T06:30:00Z', reason: 'private_use' as const };
		const view = buildBlocksView({ items: [{ block: running, deletion: null }], now: NOW, locale: 'de', status: null });
		expect(view.rows[0]).toMatchObject({ text: 'Mo 11. Januar · 07:30–11:00 · Privat', started: 'Hat schon begonnen.', delete: null });
	});

	it('shows the empty line and the statuses, in German and English', () => {
		expect(buildBlocksView({ items: [], now: NOW, locale: 'de', status: 'saved' })).toMatchObject({
			rows: [],
			empty: 'Keine Blocks geplant.',
			status: 'Gespeichert.',
			messages: { gone: 'Schon erledigt.' }
		});
		expect(buildBlocksView({ items: [], now: NOW, locale: 'de', status: 'deleted' }).status).toBe('Block gelöscht.');
		expect(buildBlocksView({ items: [], now: NOW, locale: 'en', status: null })).toMatchObject({
			empty: 'No blocks planned.',
			create: { text: 'New block' },
			status: null
		});
	});
});

describe('buildBlockFormView', () => {
	it('has the labels, the three reasons, today and Reinigung preselected', () => {
		expect(buildBlockFormView({ now: NOW, locale: 'de' })).toMatchObject({
			title: 'Neuer Block',
			labels: { date: 'Datum', start: 'Von', end: 'Bis', reason: 'Grund', check: 'Prüfen' },
			reasons: [
				{ value: 'cleaning', text: 'Reinigung' },
				{ value: 'maintenance', text: 'Wartung' },
				{ value: 'private_use', text: 'Privat' }
			],
			defaults: { date: '2027-01-11', start: '', end: '', reason: 'cleaning' },
			errors: { field_required: 'Bitte ausfüllen.', block_end_not_after_start: 'Das Ende muss nach dem Beginn liegen.' }
		});
		expect(buildBlockFormView({ now: NOW, locale: 'en' }).reasons.map((r) => r.text)).toEqual(['Cleaning', 'Maintenance', 'Private use']);
	});
});

describe('buildBlockCheckView', () => {
	const block = { start: '2027-01-11T15:00:00Z', end: '2027-01-11T16:25:00Z', reason: 'cleaning' as const };
	const check = (over: Partial<BlockCheck> = {}): BlockCheck => ({
		date: '2027-01-11',
		past: false,
		conflict: null,
		impact: MAIL,
		affectedFirstName: 'Lena',
		...over
	});
	const ctx = { now: NOW, locale: 'de' as const };

	it('opens "Block speichern?" with the what line, the mini row and the primary confirm (Mail)', () => {
		const view = buildBlockCheckView(block, check(), ctx);
		expect(view).toMatchObject({
			kind: 'dialog',
			dialog: {
				title: 'Block speichern?',
				what: 'Reinigung · Mo 11. Januar, 16:00–17:25',
				confirm: 'Block speichern',
				destructive: false,
				row: { who: 'Lena, 18:00:', text: 'bekommt eine Mail.', notice: 'Neuer Hinweis: komm zwischen 17:25 und 17:30.' }
			}
		});
	});

	it('refuses an overlap with the bookings listed, singular and plural', () => {
		const two = buildBlockCheckView(
			block,
			check({
				conflict: {
					kind: 'overlap',
					bookings: [
						{ start: '2027-01-11T17:00:00Z', firstName: 'Anna' },
						{ start: '2027-01-11T18:30:00Z', firstName: 'Ben' }
					]
				}
			}),
			ctx
		);
		expect(two).toEqual({
			kind: 'conflict',
			text: 'Dieser Block überschneidet 2 Buchungen: Mo 18:00 (Anna), Mo 19:30 (Ben). Blocks löschen keine Buchungen.'
		});
		const one = buildBlockCheckView(block, check({ conflict: { kind: 'overlap', bookings: [{ start: '2027-01-11T17:00:00Z', firstName: null }] } }), ctx);
		expect(one).toEqual({ kind: 'conflict', text: 'Dieser Block überschneidet 1 Buchung: Mo 18:00. Blocks löschen keine Buchungen.' });
	});

	it('refuses a block inside a changeover, and a past start, before anything else', () => {
		expect(buildBlockCheckView(block, check({ conflict: { kind: 'gap' } }), ctx)).toEqual({
			kind: 'conflict',
			text: 'Zwischen diesen zwei Buchungen ist kein Platz für einen Block.'
		});
		expect(buildBlockCheckView(block, check({ past: true, conflict: { kind: 'gap' } }), ctx)).toEqual({ kind: 'past' });
	});

	it('words the refusals in English', () => {
		const en = { now: NOW, locale: 'en' as const };
		expect(buildBlockCheckView(block, check({ conflict: { kind: 'gap' } }), en)).toMatchObject({
			text: "There's no room for a block between these two bookings."
		});
		expect(buildBlockCheckView(block, check(), en)).toMatchObject({ dialog: { title: 'Save block?', confirm: 'Save block' } });
	});
});

describe('toBlockInstants', () => {
	const form = { date: '2027-01-11', start: '09:00', end: '11:00', reason: 'cleaning' };

	it('gives the Zurich instants of a valid form', () => {
		expect(toBlockInstants(form)).toEqual({
			ok: true,
			value: { start: '2027-01-11T08:00:00Z', end: '2027-01-11T10:00:00Z', reason: 'cleaning' }
		});
	});

	it('refuses a start or end the spring clock change skips (28 Mar 2027, 02:00–02:59)', () => {
		const spring = { ...form, date: '2027-03-28' };
		expect(toBlockInstants({ ...spring, start: '02:30', end: '04:00' })).toEqual({ ok: false, errors: { start: 'block_time_missing' } });
		// A skipped end would otherwise move to 03:30 and silently lengthen the block.
		expect(toBlockInstants({ ...spring, start: '01:00', end: '02:30' })).toEqual({ ok: false, errors: { end: 'block_time_missing' } });
		expect(toBlockInstants({ ...spring, start: '01:00', end: '03:00' })).toMatchObject({
			ok: true,
			value: { start: '2027-03-28T00:00:00Z', end: '2027-03-28T01:00:00Z' }
		});
	});

	it('maps a time the autumn clock change repeats to the earlier one (summer time, UTC+2)', () => {
		// 31 Oct 2027, 02:30 happens twice: first at 00:30Z (CEST), then at 01:30Z (CET).
		expect(toBlockInstants({ ...form, date: '2027-10-31', start: '02:30', end: '04:00' })).toEqual({
			ok: true,
			value: { start: '2027-10-31T00:30:00Z', end: '2027-10-31T03:00:00Z', reason: 'cleaning' }
		});
	});

	it('passes the schema errors on', () => {
		expect(toBlockInstants({ ...form, end: '08:00' })).toEqual({ ok: false, errors: { end: 'block_end_not_after_start' } });
	});
});

describe('admin day view: blocks', () => {
	const booking = (over: Partial<AdminBooking> = {}): AdminBooking => ({
		id: 7,
		start: '2027-01-11T10:30:00Z',
		durationMin: 60,
		partySize: 2,
		locale: 'de',
		name: 'Tom Brunner',
		email: null,
		mobile: null,
		current: null,
		lastTold: null,
		keybox: null,
		refusals: [],
		...over
	});
	const view = (bookings: AdminBooking[], blocks: AdminBlock[]) =>
		buildAdminDayView({
			date: '2027-01-11',
			bookings,
			stripDates: ['2027-01-11'],
			flaggedDates: new Set(),
			context: { now: NOW, locale: 'de', seasons: [], settings: { openMinute: 600, closeMinute: 1320 }, keyboxCode: null },
			replies: buildReplies([], 0, 'de'),
			blocks
		});

	it('puts the day’s blocks among the bookings in start order, with time range and reason', () => {
		const late = { ...cleaning, id: 2, start: '2027-01-11T16:00:00Z', end: '2027-01-11T16:30:00Z', reason: 'maintenance' as const };
		const v = view([booking()], [cleaning, late]);
		expect(v.entries.map((e) => (e.kind === 'block' ? `${e.block.time} ${e.block.text}` : e.row.time))).toEqual([
			'09:00–11:00 Block · Reinigung',
			'11:30–12:30',
			'17:00–17:30 Block · Wartung'
		]);
		expect(v.empty).toBeNull();
	});

	it('puts a block before a booking with the same start, whatever the input order', () => {
		const same = { ...cleaning, start: '2027-01-11T10:30:00Z', end: '2027-01-11T11:00:00Z' };
		const kinds = view([booking()], [same]).entries.map((e) => e.kind);
		expect(kinds).toEqual(['block', 'booking']);
	});

	it('keeps the empty line on a day with only blocks', () => {
		const v = view([], [cleaning]);
		expect(v.entries).toHaveLength(1);
		expect(v.empty).toBe('Keine Buchungen an diesem Tag.');
	});
});
