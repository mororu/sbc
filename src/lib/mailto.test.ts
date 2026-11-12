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
});
