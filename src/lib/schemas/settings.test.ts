// Story 3.7 matrix "Invalid": the settings card schemas. Each card parses alone; errors are message
// keys per field (the first problem of each), the values come back as posted, never the password.
import { describe, expect, it } from 'vitest';
import { hhmm, parseSettingsCard, settingsErrorFields, settingsValues } from './settings.ts';

describe('hours', () => {
	it('gives the minutes after midnight', () => {
		expect(parseSettingsCard('hours', { open: '12:00', close: '21:00' })).toEqual({ ok: true, value: { openMinute: 720, closeMinute: 1260 } });
		expect(parseSettingsCard('hours', { open: ' 00:00 ', close: '23:55' })).toEqual({ ok: true, value: { openMinute: 0, closeMinute: 1435 } });
	});

	it('reads a "Bis" of 00:00 as midnight at the end of the day, and prefills 1440 as 00:00 (round trip)', () => {
		expect(parseSettingsCard('hours', { open: '10:00', close: '00:00' })).toEqual({ ok: true, value: { openMinute: 600, closeMinute: 1440 } });
		expect(parseSettingsCard('hours', { open: '00:00', close: '00:00' })).toEqual({ ok: true, value: { openMinute: 0, closeMinute: 1440 } });
		expect(hhmm(1440)).toBe('00:00');
		expect(parseSettingsCard('hours', { open: hhmm(600), close: hhmm(1440) })).toEqual({ ok: true, value: { openMinute: 600, closeMinute: 1440 } });
	});

	it('refuses close at or before open on "Bis"', () => {
		expect(parseSettingsCard('hours', { open: '12:00', close: '12:00' })).toEqual({ ok: false, errors: { close: 'settings_hours_order' } });
		expect(parseSettingsCard('hours', { open: '12:00', close: '11:00' })).toEqual({ ok: false, errors: { close: 'settings_hours_order' } });
	});

	it('refuses empty, malformed and off-step times', () => {
		expect(parseSettingsCard('hours', {})).toEqual({ ok: false, errors: { open: 'field_required', close: 'field_required' } });
		expect(parseSettingsCard('hours', { open: '12:03', close: '24:00' })).toEqual({
			ok: false,
			errors: { open: 'block_time_step', close: 'block_time_step' }
		});
	});
});

describe('changeover', () => {
	it.each([
		['0', 0],
		['15', 15],
		['60', 60]
	])('accepts %s', (minutes, changeoverMin) => {
		expect(parseSettingsCard('changeover', { minutes })).toEqual({ ok: true, value: { changeoverMin } });
	});

	it.each(['7', '65', '-5', '1.5', 'abc'])('refuses %s', (minutes) => {
		expect(parseSettingsCard('changeover', { minutes })).toEqual({ ok: false, errors: { minutes: 'settings_changeover_range' } });
	});

	it('refuses empty', () => {
		expect(parseSettingsCard('changeover', { minutes: ' ' })).toEqual({ ok: false, errors: { minutes: 'field_required' } });
	});
});

describe('horizon', () => {
	it('accepts 1 to 60', () => {
		expect(parseSettingsCard('horizon', { days: '1' })).toEqual({ ok: true, value: { horizonDays: 1 } });
		expect(parseSettingsCard('horizon', { days: '21' })).toEqual({ ok: true, value: { horizonDays: 21 } });
		expect(parseSettingsCard('horizon', { days: '60' })).toEqual({ ok: true, value: { horizonDays: 60 } });
	});

	it.each(['0', '61', 'x'])('refuses %s', (days) => {
		expect(parseSettingsCard('horizon', { days })).toEqual({ ok: false, errors: { days: 'settings_horizon_range' } });
	});
});

describe('preheat', () => {
	it('accepts 15–90 in steps of 5, min ≤ max', () => {
		expect(parseSettingsCard('preheat', { min: '40', max: '50' })).toEqual({ ok: true, value: { minMin: 40, maxMin: 50 } });
		expect(parseSettingsCard('preheat', { min: '30', max: '30' })).toEqual({ ok: true, value: { minMin: 30, maxMin: 30 } });
	});

	it('refuses a swapped window on the shortest time', () => {
		expect(parseSettingsCard('preheat', { min: '50', max: '40' })).toEqual({ ok: false, errors: { min: 'settings_preheat_swapped' } });
	});

	it('refuses values out of range or off the step on each field', () => {
		expect(parseSettingsCard('preheat', { min: '10', max: '42' })).toEqual({
			ok: false,
			errors: { min: 'settings_preheat_range', max: 'settings_preheat_range' }
		});
		expect(parseSettingsCard('preheat', { min: '30', max: '95' })).toEqual({ ok: false, errors: { max: 'settings_preheat_range' } });
	});
});

describe('instructions', () => {
	it('trims both texts', () => {
		expect(parseSettingsCard('instructions', { de: ' Box links. ', en: 'Box left.\n' })).toEqual({
			ok: true,
			value: { de: 'Box links.', en: 'Box left.' }
		});
	});

	it('refuses empty and too long texts', () => {
		expect(parseSettingsCard('instructions', { de: '   ', en: 'x'.repeat(4001) })).toEqual({
			ok: false,
			errors: { de: 'field_required', en: 'settings_instructions_too_long' }
		});
		expect(parseSettingsCard('instructions', { de: 'ä'.repeat(4000), en: 'x' }).ok).toBe(true);
	});

	it('stores CRLF as LF and counts UTF-16 code units after that, as maxlength does', () => {
		// 2000 lines: 3999 code units with LF, 5997 as posted with CRLF.
		const posted = `x${'\r\nx'.repeat(1999)}`;
		const parsed = parseSettingsCard('instructions', { de: posted, en: 'a\rb' });
		expect(parsed).toEqual({ ok: true, value: { de: `x${'\nx'.repeat(1999)}`, en: 'a\nb' } });
		expect(parseSettingsCard('instructions', { de: `${posted}\r\nxx`, en: 'x' })).toEqual({
			ok: false,
			errors: { de: 'settings_instructions_too_long' }
		});
		// An emoji is two code units, as the textarea counts it.
		expect(parseSettingsCard('instructions', { de: '😀'.repeat(2000), en: 'x' }).ok).toBe(true);
		expect(parseSettingsCard('instructions', { de: '😀'.repeat(2001), en: 'x' })).toEqual({
			ok: false,
			errors: { de: 'settings_instructions_too_long' }
		});
	});
});

describe('contact', () => {
	it('accepts an address', () => {
		expect(parseSettingsCard('contact', { email: ' sauna@example.ch ' })).toEqual({ ok: true, value: { contact: 'sauna@example.ch' } });
	});

	it('refuses an empty or bad address with its own key', () => {
		expect(parseSettingsCard('contact', { email: '' })).toEqual({ ok: false, errors: { email: 'field_required' } });
		expect(parseSettingsCard('contact', { email: 'sauna@' })).toEqual({ ok: false, errors: { email: 'settings_contact_invalid' } });
		expect(parseSettingsCard('contact', { email: `${'a'.repeat(250)}@example.ch` })).toEqual({
			ok: false,
			errors: { email: 'settings_contact_invalid' }
		});
	});
});

describe('password', () => {
	it('accepts 12 characters, untrimmed', () => {
		expect(parseSettingsCard('password', { password: ' abcdefghij ' })).toEqual({ ok: true, value: { password: ' abcdefghij ' } });
	});

	it('refuses empty, short and too long', () => {
		expect(parseSettingsCard('password', {})).toEqual({ ok: false, errors: { password: 'field_required' } });
		expect(parseSettingsCard('password', { password: 'short' })).toEqual({ ok: false, errors: { password: 'admin_password_too_short' } });
		expect(parseSettingsCard('password', { password: 'x'.repeat(1025) })).toEqual({ ok: false, errors: { password: 'admin_password_too_long' } });
	});

	it('never keeps the password in the values', () => {
		expect(settingsValues('password', { password: 'correct horse battery' })).toEqual({});
	});
});

describe('helpers', () => {
	it('keeps the posted values of a card as strings', () => {
		expect(settingsValues('preheat', { min: '50', max: 40, other: 'x' })).toEqual({ min: '50', max: '' });
	});

	it('lists the error fields in form order', () => {
		expect(settingsErrorFields('preheat', { max: 'settings_preheat_range', min: 'settings_preheat_range' })).toEqual(['min', 'max']);
	});

	it('formats minutes as HH:MM', () => {
		expect(hhmm(600)).toBe('10:00');
		expect(hhmm(1325)).toBe('22:05');
	});
});

describe('season (Story 3.8)', () => {
	it('gives the dates and the id, or null without one', () => {
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-04-15', id: '1' })).toEqual({
			ok: true,
			value: { id: 1, startDate: '2027-01-09', endDate: '2027-04-15' }
		});
		expect(parseSettingsCard('season', { start: ' 2027-12-20 ', end: '2028-04-30' })).toEqual({
			ok: true,
			value: { id: null, startDate: '2027-12-20', endDate: '2028-04-30' }
		});
	});

	it('Order: refuses an end on or before the start on `end`, values kept', () => {
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-01-09', id: '1' })).toEqual({
			ok: false,
			errors: { end: 'settings_season_order' }
		});
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-01-08' })).toEqual({ ok: false, errors: { end: 'settings_season_order' } });
		expect(settingsValues('season', { start: '2027-01-09', end: '2027-01-08', id: '1' })).toEqual({ start: '2027-01-09', end: '2027-01-08', id: '1' });
	});

	it('Empty: refuses an empty start with `field_required`; malformed dates and ids', () => {
		expect(parseSettingsCard('season', { start: '', end: '2027-04-30', id: '1' })).toEqual({ ok: false, errors: { start: 'field_required' } });
		expect(parseSettingsCard('season', {})).toEqual({ ok: false, errors: { start: 'field_required', end: 'field_required' } });
		expect(parseSettingsCard('season', { start: '2027-02-30', end: '9.1.2027' })).toEqual({
			ok: false,
			errors: { start: 'block_date_invalid', end: 'block_date_invalid' }
		});
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-04-30', id: '0' })).toEqual({ ok: false, errors: { id: 'field_required' } });
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-04-30', id: '1.5' })).toEqual({ ok: false, errors: { id: 'field_required' } });
		expect(settingsErrorFields('season', { end: 'settings_season_order', start: 'field_required' })).toEqual(['start', 'end']);
	});
});

describe('keybox (Story 3.8)', () => {
	it('gives the trimmed code', () => {
		expect(parseSettingsCard('keybox', { code: ' 5822 ' })).toEqual({ ok: true, value: { code: '5822' } });
	});

	it('Empty code: refuses blanks with `field_required`, values kept as posted', () => {
		expect(parseSettingsCard('keybox', { code: '  ' })).toEqual({ ok: false, errors: { code: 'field_required' } });
		expect(parseSettingsCard('keybox', {})).toEqual({ ok: false, errors: { code: 'field_required' } });
		expect(settingsValues('keybox', { code: '  ' })).toEqual({ code: '  ' });
	});
});

describe('season id and keybox code limits (Story 3.8 review)', () => {
	it('accepts a season id of up to 9 digits, refuses 10', () => {
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-04-30', id: '999999999' })).toMatchObject({ ok: true, value: { id: 999999999 } });
		expect(parseSettingsCard('season', { start: '2027-01-09', end: '2027-04-30', id: '1000000000' })).toEqual({ ok: false, errors: { id: 'field_required' } });
	});

	it('accepts a code of 32 characters after trimming; refuses 33 and any line break', () => {
		const code32 = 'A'.repeat(32);
		expect(parseSettingsCard('keybox', { code: `  ${code32}  ` })).toEqual({ ok: true, value: { code: code32 } });
		expect(parseSettingsCard('keybox', { code: 'A'.repeat(33) })).toEqual({ ok: false, errors: { code: 'settings_keybox_invalid' } });
		expect(parseSettingsCard('keybox', { code: '47\n11' })).toEqual({ ok: false, errors: { code: 'settings_keybox_invalid' } });
		expect(parseSettingsCard('keybox', { code: '47\r\n11' })).toEqual({ ok: false, errors: { code: 'settings_keybox_invalid' } });
	});
});
