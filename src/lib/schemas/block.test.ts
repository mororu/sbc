// Story 3.5: the block form schema: required fields, 5-minute steps, end after start, the reason
// list, and the conversion into instants through the caller's converter.
import { describe, expect, it } from 'vitest';
import { blockErrorFields, parseBlockForm, validateBlockForm } from './block.ts';

/** A stand-in converter (schemas import nothing from the app): local time as text. */
const toInstant = (date: string, minute: number) =>
	`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const good = { date: '2027-01-11', start: '09:00', end: '11:00', reason: 'cleaning' };

describe('parseBlockForm', () => {
	it('gives the start and end instants and the reason', () => {
		expect(parseBlockForm(good, toInstant)).toEqual({
			ok: true,
			value: { start: '2027-01-11T09:00', end: '2027-01-11T11:00', reason: 'cleaning' }
		});
	});

	it('refuses empty fields with field_required', () => {
		expect(parseBlockForm({}, toInstant)).toEqual({
			ok: false,
			errors: { date: 'field_required', start: 'field_required', end: 'field_required', reason: 'field_required' }
		});
	});

	it('refuses a time off the 5-minute step or malformed, and an impossible date', () => {
		expect(validateBlockForm({ ...good, start: '09:03' })).toEqual({ ok: false, errors: { start: 'block_time_step' } });
		expect(validateBlockForm({ ...good, end: '24:00' })).toEqual({ ok: false, errors: { end: 'block_time_step' } });
		expect(validateBlockForm({ ...good, end: '9:00' })).toEqual({ ok: false, errors: { end: 'block_time_step' } });
		expect(validateBlockForm({ ...good, date: '2027-02-29' })).toEqual({ ok: false, errors: { date: 'block_date_invalid' } });
		expect(validateBlockForm({ ...good, date: '2028-02-29' }).ok).toBe(true);
	});

	it('refuses an end not after the start, at the end', () => {
		expect(validateBlockForm({ ...good, end: '09:00' })).toEqual({ ok: false, errors: { end: 'block_end_not_after_start' } });
		expect(validateBlockForm({ ...good, start: '11:05' })).toEqual({ ok: false, errors: { end: 'block_end_not_after_start' } });
	});

	it('accepts the last step of the day and refuses an unknown reason', () => {
		expect(validateBlockForm({ ...good, start: '23:00', end: '23:55' }).ok).toBe(true);
		expect(validateBlockForm({ ...good, reason: 'party' })).toEqual({ ok: false, errors: { reason: 'field_required' } });
	});

	it('lists the fields with an error in form order', () => {
		expect(blockErrorFields({ reason: 'field_required', start: 'block_time_step' })).toEqual(['start', 'reason']);
	});
});
