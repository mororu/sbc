import { describe, expect, it } from 'vitest';
import { errorFields, normaliseMobile, parseBooking, validateContactField } from './booking.ts';

describe('normaliseMobile', () => {
	it.each([
		['079 123 45 67', '+41791234567'],
		['0791234567', '+41791234567'],
		['+41 79 123 45 67', '+41791234567'],
		['+41791234567', '+41791234567'],
		['0041 79 123 45 67', '+41791234567'],
		['+41 079 123 45 67', '+41791234567'],
		['079-123-45-67', '+41791234567'],
		[' 079 123 45 67 ', '+41791234567'],
		['044 123 45 67', '+41441234567'],
		['+49 151 23456789', '+4915123456789'],
		['0049 151 23456789', '+4915123456789'],
		['+33 6 12 34 56 78', '+33612345678'],
		['+1 2025550123', '+12025550123']
	])('%s → %s', (input, expected) => {
		expect(normaliseMobile(input)).toBe(expected);
	});

	it.each([
		'12',
		'',
		'079 123 45 6',
		'079 123 45 678',
		'+41 79 123 45 6',
		'+41 79 123 45 678',
		'+1234567',
		'+1234567890123456',
		'+0 123 456 789',
		'079 123 45 6x',
		'(079) 123 45 67'
	])('rejects %s', (input) => {
		expect(normaliseMobile(input)).toBeNull();
	});
});

const NOTICE = '{"heat":"hot","earliest":null,"latest":null}';

const valid = {
	name: 'Lena',
	email: 'lena@example.ch ',
	mobile: '079 123 45 67',
	duration: '90',
	partySize: '3',
	submitToken: 'AAAAAAAAAAAAAAAAAAAAAA',
	notice: NOTICE
};

describe('parseBooking', () => {
	it('trims and normalises a valid form', () => {
		expect(parseBooking({ ...valid, name: '  Lena ' })).toEqual({
			ok: true,
			value: {
				name: 'Lena',
				email: 'lena@example.ch',
				mobile: '+41791234567',
				duration: 90,
				partySize: 3,
				submitToken: 'AAAAAAAAAAAAAAAAAAAAAA',
				notice: NOTICE
			}
		});
	});

	it('returns one error key per invalid field, in form order', () => {
		const result = parseBooking({ ...valid, email: 'lena@', mobile: '12' });
		expect(result).toEqual({ ok: false, errors: { email: 'email_invalid', mobile: 'mobile_invalid' } });
		if (!result.ok) expect(errorFields(result.errors)).toEqual(['email', 'mobile']);
	});

	it('requires name and email, and a mobile', () => {
		expect(parseBooking({ ...valid, name: '   ', email: '', mobile: '' })).toEqual({
			ok: false,
			errors: { name: 'field_required', email: 'field_required', mobile: 'mobile_invalid' }
		});
		expect(parseBooking({ duration: '60', partySize: '2', submitToken: valid.submitToken, notice: NOTICE })).toEqual({
			ok: false,
			errors: { name: 'field_required', email: 'field_required', mobile: 'mobile_invalid' }
		});
	});

	it.each(['Le\u0000na', 'Le\tna', 'Lena\u001f', 'Le\u007fna', 'Le\nna'])('refuses control characters in the name: %j', (name) => {
		expect(parseBooking({ ...valid, name })).toEqual({ ok: false, errors: { name: 'name_invalid' } });
	});

	it('keeps other characters in the name', () => {
		expect(parseBooking({ ...valid, name: 'Zoë Müller-Brändli' }).ok).toBe(true);
	});

	it('limits the mobile field to 32 characters', () => {
		expect(parseBooking({ ...valid, mobile: '0' + ' '.repeat(30) + '791234567' })).toEqual({
			ok: false,
			errors: { mobile: 'mobile_invalid' }
		});
	});

	it('limits the name to 100 characters', () => {
		expect(parseBooking({ ...valid, name: 'x'.repeat(100) }).ok).toBe(true);
		expect(parseBooking({ ...valid, name: 'x'.repeat(101) })).toEqual({
			ok: false,
			errors: { name: 'name_too_long' }
		});
	});

	it.each([
		['duration', '75'],
		['duration', '210'],
		['duration', '60.0'],
		['duration', ''],
		['partySize', '0'],
		['partySize', '7'],
		['partySize', '-1'],
		['submitToken', 'short'],
		['submitToken', 'AAAAAAAAAAAAAAAAAAAA/A=='],
		['submitToken', 'A'.repeat(23)],
		['submitToken', 'A'.repeat(21)],
		['notice', ''],
		['notice', 'x'.repeat(201)]
	])('refuses a crafted %s of %j as form_invalid', (field, value) => {
		expect(parseBooking({ ...valid, [field]: value })).toEqual({ ok: false, errors: { [field]: 'form_invalid' } });
	});
});

describe('the notice field', () => {
	it('only checks that it is there: the action parses it', () => {
		expect(parseBooking({ ...valid, notice: 'not json' }).ok).toBe(true);
		expect(parseBooking({ ...valid, notice: 'x'.repeat(200) }).ok).toBe(true);
		const { notice: _notice, ...missing } = valid;
		expect(parseBooking(missing)).toEqual({ ok: false, errors: { notice: 'form_invalid' } });
	});
});

describe('validateContactField', () => {
	it('validates one field', () => {
		expect(validateContactField('email', 'lena@')).toBe('email_invalid');
		expect(validateContactField('email', ' lena@example.ch ')).toBeNull();
		expect(validateContactField('mobile', '12')).toBe('mobile_invalid');
		expect(validateContactField('name', '')).toBe('field_required');
		expect(validateContactField('name', 'Lena')).toBeNull();
	});
});
