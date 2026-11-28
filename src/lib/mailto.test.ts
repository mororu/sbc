import { describe, expect, it } from 'vitest';
import { mailtoHref } from './mailto.ts';

describe('mailtoHref', () => {
	it('keeps a plain address readable', () => {
		expect(mailtoHref('platzhalter@sauna-luegisee.ch')).toBe('mailto:platzhalter@sauna-luegisee.ch');
	});

	it('encodes characters that would change the link', () => {
		expect(mailtoHref('sauna+info@example.ch')).toBe('mailto:sauna%2Binfo@example.ch');
		expect(mailtoHref('a?cc=x@example.ch')).toBe('mailto:a%3Fcc%3Dx@example.ch');
	});

	it('adds an encoded subject and a CRLF-joined body (Story 3.4)', () => {
		const href = mailtoHref('a+b@x.ch', { subject: 'Deine Sauna-Buchung ist gelöscht', body: ['Hallo Lena,', '', 'bis bald & ciao?'] });
		expect(href).toBe(
			'mailto:a%2Bb@x.ch?subject=Deine%20Sauna-Buchung%20ist%20gel%C3%B6scht&body=Hallo%20Lena%2C%0D%0A%0D%0Abis%20bald%20%26%20ciao%3F'
		);
	});

	it('adds only the fields given', () => {
		expect(mailtoHref('a@x.ch', { subject: 'Hi' })).toBe('mailto:a@x.ch?subject=Hi');
		expect(mailtoHref('a@x.ch', { body: ['x'] })).toBe('mailto:a@x.ch?body=x');
	});
});
