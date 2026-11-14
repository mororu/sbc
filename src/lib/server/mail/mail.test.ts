// Stories 2.1, 2.2 and 2.3: the confirmation, keybox and heat-change emails, the layout's format rules and the
// transport's classification.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.ts';
import { renderConfirmation, type ConfirmationInput } from './confirmation.ts';
import { renderHeatChange, type HeatChangeInput } from './heat-change.ts';
import { renderKeybox, spacedCode, type KeyboxInput } from './keybox.ts';
import { escapeHtml, renderEmail } from './layout.ts';
import { classifySendError, createMailer, responseCodeOf, sinkDir } from './transport.ts';

/** Tue 12 Jan 2027 18:00, cold start 17:20–17:30, booked on Sun 10 Jan. */
const COLD_1800_JSON = '{"heat":"cold","earliest":"2027-01-12T16:20:00Z","latest":"2027-01-12T16:30:00Z"}';
const input = (over: Partial<ConfirmationInput['booking']> = {}, locale: 'de' | 'en' = 'en'): ConfirmationInput => ({
	snapshot: { notice: COLD_1800_JSON, locale },
	booking: {
		start: '2027-01-12T17:00:00Z',
		durationMin: 90,
		partySize: 3,
		createdAt: '2027-01-10T09:00:00Z',
		adminContact: 'sauna+info@example.ch',
		...over
	},
	claimedAt: '2027-01-10T09:00:30Z'
});

/** The HTML body as plain text: tags dropped, entities decoded, whitespace collapsed. */
const htmlBodyText = (html: string) =>
	html
		.replace(/^[\s\S]*<body>/, '')
		.replace(/<\/body>[\s\S]*$/, '')
		.replace(/<br>/g, ' ')
		.replace(/<\/(p|h1)>/g, ' ')
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('renderConfirmation', () => {
	it('renders the EN subject and body', () => {
		const email = renderConfirmation(input());
		expect(email.subject).toBe('Booked: Sauna Luegisee, Tue 12 January, 18:00');
		expect(email.lang).toBe('en');
		expect(email.text).toBe(
			[
				'Booked!',
				'Date: Tue 12 January\nStart: 18:00\nDuration: 90 minutes, until 19:30\nPeople: 3 people',
				"Cold start: come between 17:20 and 17:30 and light the fire. If that changes, we'll let you know.",
				"We'll send you the keybox code on Mon 11 January at 18:00.",
				'To cancel: Email sauna+info@example.ch.',
				'See you soon, Sauna Luegisee'
			].join('\n\n') + '\n'
		);
		expect(email.html).toContain('<a href="mailto:sauna%2Binfo@example.ch">sauna+info@example.ch</a>');
	});

	it('renders the DE subject and body', () => {
		const email = renderConfirmation(input({}, 'de'));
		expect(email.subject).toBe('Gebucht: Sauna Luegisee, Di 12. Januar, 18:00');
		expect(email.lang).toBe('de-CH');
		expect(email.text).toContain('Datum: Di 12. Januar\nBeginn: 18:00\nDauer: 90 Minuten, bis 19:30\nPersonen: 3 Personen');
		expect(email.text).toContain('Kaltstart: komm zwischen 17:20 und 17:30 und heiz ein. Falls sich das ändert, sagen wir es dir.');
		expect(email.text).toContain('Den Schlüsselcode schicken wir dir am Mo 11. Januar um 18:00.');
		expect(email.text).toContain('Absagen: Schreib an sauna+info@example.ch.');
		expect(email.text).toMatch(/Bis bald, Sauna Luegisee\n$/);
	});

	it('says the code follows right away when booked past the cutoff', () => {
		const email = renderConfirmation(input({ createdAt: '2027-01-11T17:00:00Z' }));
		expect(email.text).toContain('The keybox code follows right away in a separate email.');
		expect(email.text).not.toContain('Mon 11 January');
	});

	it('says the code follows right away when claimed past the cutoff', () => {
		const email = renderConfirmation({ ...input(), claimedAt: '2027-01-11T17:00:00Z' });
		expect(email.text).toContain('The keybox code follows right away');
		const before = renderConfirmation({ ...input(), claimedAt: '2027-01-11T16:59:59Z' });
		expect(before.text).toContain('on Mon 11 January at 18:00');
	});

	it('renders a hot notice', () => {
		const email = renderConfirmation({
			...input(),
			snapshot: { notice: '{"heat":"hot","earliest":null,"latest":null}', locale: 'en' }
		});
		expect(email.text).toContain("Already hot at 18:00. If that changes, we'll let you know.");
	});

	it('leaves only the notice line out without a stored notice', () => {
		const email = renderConfirmation({ ...input(), snapshot: { notice: null, locale: 'en' } });
		expect(email.text).toBe(
			[
				'Booked!',
				'Date: Tue 12 January\nStart: 18:00\nDuration: 90 minutes, until 19:30\nPeople: 3 people',
				"We'll send you the keybox code on Mon 11 January at 18:00.",
				'To cancel: Email sauna+info@example.ch.',
				'See you soon, Sauna Luegisee'
			].join('\n\n') + '\n'
		);
		expect(htmlBodyText(email.html)).toBe(collapse(email.text));
	});

	it('leaves the cancel line out without an admin contact', () => {
		const email = renderConfirmation(input({ adminContact: null }));
		expect(email.text).not.toContain('To cancel');
		expect(email.html).not.toContain('mailto:');
	});

	it.each(['de', 'en'] as const)('keeps the %s plain and HTML parts in step', (locale) => {
		const email = renderConfirmation(input({}, locale));
		expect(htmlBodyText(email.html)).toBe(collapse(email.text));
		expect(htmlBodyLines(email.html)).toBe(email.text);
	});
});

/**
 * The HTML body as the plain text should read it: one block per line of the HTML source, `<br>` as a
 * newline, tags dropped, entities decoded. Unlike `htmlBodyText`, line breaks are kept and checked.
 */
const htmlBodyLines = (html: string) =>
	html
		.replace(/^[\s\S]*<body>\n/, '')
		.replace(/\n<\/body>[\s\S]*$/, '')
		.replace(/<br>\n/g, '\u0001')
		.split('\n')
		.map((block) =>
			block
				.replace(/<[^>]+>/g, '')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&amp;/g, '&')
				.split('\u0001')
				.join('\n')
		)
		.join('\n\n') + '\n';

describe('renderKeybox', () => {
	const INSTRUCTIONS_DE = 'Die Box hängt links an der Tür.\nDreh am Rad.\n\n  Leg den Schlüssel danach zurück.  ';
	const keybox = (
		over: Partial<KeyboxInput['snapshot']> = {},
		instructions: string | null = INSTRUCTIONS_DE,
		adminContact: string | null = 'sauna+info@example.ch'
	): KeyboxInput => ({
		snapshot: { notice: COLD_1800_JSON, keyboxCode: '4711', locale: 'de', ...over },
		booking: { start: '2027-01-12T17:00:00Z', instructions, adminContact },
		claimedAt: '2027-01-11T17:00:30Z'
	});

	it('renders the DE subject, the code first, the date, the notice that counts, the instructions and the cancel line', () => {
		const email = renderKeybox(keybox());
		expect(email.subject).toBe('Schlüsselcode für Di 12. Januar, 18:00');
		expect(email.lang).toBe('de-CH');
		expect(email.text).toBe(
			[
				'Code: 4 7 1 1',
				'Datum: Di 12. Januar\nBeginn: 18:00',
				'Das gilt jetzt\nKaltstart: komm zwischen 17:20 und 17:30 und heiz ein.',
				'Schlüssel holen und zurückbringen',
				'Die Box hängt links an der Tür.\nDreh am Rad.',
				'Leg den Schlüssel danach zurück.',
				'Absagen: Schreib an sauna+info@example.ch.',
				'Bis bald, Sauna Luegisee'
			].join('\n\n') + '\n'
		);
		expect(email.html).toMatch(/<body>\n<h1>Code: 4 7 1 1<\/h1>/);
		expect(email.html).toContain('<p>Die Box hängt links an der Tür.<br>\nDreh am Rad.</p>');
		expect(email.html).toContain('<a href="mailto:sauna%2Binfo@example.ch">sauna+info@example.ch</a>');
	});

	it('renders the EN subject and body', () => {
		const email = renderKeybox(keybox({ locale: 'en', notice: '{"heat":"hot","earliest":null,"latest":null}' }, 'Box on the left.'));
		expect(email.subject).toBe('Keybox code for Tue 12 January, 18:00');
		expect(email.lang).toBe('en');
		expect(email.text).toBe(
			[
				'Code: 4 7 1 1',
				'Date: Tue 12 January\nStart: 18:00',
				'This is what counts now\nAlready hot at 18:00.',
				'Getting the key and bringing it back',
				'Box on the left.',
				'To cancel: Email sauna+info@example.ch.',
				'See you soon, Sauna Luegisee'
			].join('\n\n') + '\n'
		);
	});

	it('leaves the cancel line out without an admin contact, and the notice out without a snapshot notice', () => {
		const email = renderKeybox(keybox({ notice: null }, 'Box links.', null));
		expect(email.text).toBe(
			[
				'Code: 4 7 1 1',
				'Datum: Di 12. Januar\nBeginn: 18:00',
				'Schlüssel holen und zurückbringen',
				'Box links.',
				'Bis bald, Sauna Luegisee'
			].join('\n\n') + '\n'
		);
		expect(email.html).not.toContain('mailto:');
		expect(htmlBodyLines(email.html)).toBe(email.text);
	});

	it('judges a past arrival at the claim', () => {
		const late = { ...keybox({ locale: 'en' }, 'Box.'), claimedAt: '2027-01-12T16:40:00Z' };
		const text = renderKeybox(late).text;
		expect(text).toContain('This is what counts now\nCold start: ');
		expect(text).not.toContain('come between 17:20 and 17:30');
	});

	it.each(['de', 'en'] as const)('keeps the %s plain and HTML parts in step, line breaks included', (locale) => {
		const email = renderKeybox(keybox({ locale }, INSTRUCTIONS_DE));
		expect(htmlBodyLines(email.html)).toBe(email.text);
	});

	it('escapes the instructions in the HTML part', () => {
		expect(renderKeybox(keybox({}, 'Code <links> & "rechts"')).html).toContain('<p>Code &lt;links&gt; &amp; &quot;rechts&quot;</p>');
	});

	it.each([null, '', ' \n\n '])('throws MISSING_SETTING for the instructions %j', (instructions) => {
		expect(() => renderKeybox(keybox({}, instructions))).toThrow(expect.objectContaining({ code: 'MISSING_SETTING' }));
	});

	it.each([null, '  '])('throws MISSING_SETTING for the code %j, and never names a setting value in the error', (keyboxCode) => {
		const input = keybox({ keyboxCode }, 'Box links, Code 4711.');
		expect(() => renderKeybox(input)).toThrow(expect.objectContaining({ code: 'MISSING_SETTING' }));
		expect(() => renderKeybox(input)).toThrow(/^A keybox setting is missing$/);
	});

	it('spaces every character of the code', () => {
		expect(spacedCode('4711')).toBe('4 7 1 1');
		expect(spacedCode('A1 b2')).toBe('A 1 b 2');
	});
});

describe('renderHeatChange', () => {
	/** Sat 16 Jan 2027 (UTC+1). */
	const z = (hhmm: string) => {
		const [h, m] = hhmm.split(':').map(Number);
		return `2027-01-16T${String(h - 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
	};
	const HOT = '{"heat":"hot","earliest":null,"latest":null}';
	const cold = (earliest: string, latest: string | null) =>
		JSON.stringify({ heat: 'cold', earliest: z(earliest), latest: latest === null ? null : z(latest) });
	const heat = (
		start: string,
		lastTold: string,
		notice: string,
		locale: 'de' | 'en' = 'de',
		over: Partial<HeatChangeInput> = {}
	): HeatChangeInput => ({
		snapshot: { notice, lastTold, locale },
		booking: { start: z(start), adminContact: 'sauna+info@example.ch' },
		claimedAt: '2027-01-16T10:00:00Z',
		...over
	});
	const body = (lines: string[], cancel: string, signature: string) => [...lines, cancel, signature].join('\n\n') + '\n';
	const DE_END = ['Absagen: Schreib an sauna+info@example.ch.', 'Bis bald, Sauna Luegisee'] as const;
	const EN_END = ['To cancel: Email sauna+info@example.ch.', 'See you soon, Sauna Luegisee'] as const;

	const variants = {
		'good news': heat('18:30', cold('17:50', '18:00'), HOT),
		'now cold': heat('18:30', HOT, cold('17:50', '18:00')),
		'now cold, collapsed': heat('18:00', HOT, cold('17:45', null)),
		'later earliest': heat('18:00', cold('17:20', '17:30'), cold('17:25', '17:30')),
		'later earliest, collapsed': heat('18:00', cold('17:20', '17:30'), cold('17:45', null)),
		'earlier latest': heat('18:00', cold('17:20', '17:30'), cold('17:10', '17:20'))
	};
	const DE: Record<keyof typeof variants, { subject: string; lead: string; start: string }> = {
		'good news': {
			subject: 'Gute Nachricht: Sa 16. Januar, 18:30 ist schon heiss',
			lead: 'Vor dir ist jetzt jemand in der Sauna. Komm am Sa 16. Januar einfach um 18:30, der Ofen läuft.',
			start: '18:30'
		},
		'now cold': {
			subject: 'Wichtig: Kaltstart Sa 16. Januar, 18:30, komm zwischen 17:50 und 18:00',
			lead: 'Vor dir ist jetzt niemand mehr in der Sauna. Komm zwischen 17:50 und 18:00 und heiz ein.',
			start: '18:30'
		},
		'now cold, collapsed': {
			subject: 'Wichtig: Kaltstart Sa 16. Januar, 18:00, komm um 17:45',
			lead: 'Vor dir ist jetzt niemand mehr in der Sauna. Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf.',
			start: '18:00'
		},
		'later earliest': {
			subject: 'Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00',
			lead: 'Vor dir ist die Sauna länger belegt. Komm zwischen 17:25 und 17:30 und heiz ein.',
			start: '18:00'
		},
		'later earliest, collapsed': {
			subject: 'Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00',
			lead: 'Vor dir ist die Sauna länger belegt. Nur 15 Minuten zum Einheizen: komm um 17:45. Die Sauna wärmt dann noch auf.',
			start: '18:00'
		},
		'earlier latest': {
			subject: 'Wichtig: neue Ankunftszeit für Sa 16. Januar, 18:00',
			lead: 'Wir heizen jetzt länger vor. Komm zwischen 17:10 und 17:20 und heiz ein.',
			start: '18:00'
		}
	};
	const EN: Record<keyof typeof variants, { subject: string; lead: string }> = {
		'good news': {
			subject: 'Good news: Sat 16 January, 18:30 is already hot',
			lead: 'Someone is in the sauna before you now. Just come at 18:30 on Sat 16 January, the stove will be going.'
		},
		'now cold': {
			subject: 'Important: cold start Sat 16 January, 18:30, come between 17:50 and 18:00',
			lead: 'Nobody is in the sauna before you any more. Come between 17:50 and 18:00 and light the fire.'
		},
		'now cold, collapsed': {
			subject: 'Important: cold start Sat 16 January, 18:00, come at 17:45',
			lead: 'Nobody is in the sauna before you any more. Only 15 minutes to heat: come at 17:45. It will still be warming up.'
		},
		'later earliest': {
			subject: 'Important: new arrival time for Sat 16 January, 18:00',
			lead: 'The sauna is booked for longer before you. Come between 17:25 and 17:30 and light the fire.'
		},
		'later earliest, collapsed': {
			subject: 'Important: new arrival time for Sat 16 January, 18:00',
			lead: 'The sauna is booked for longer before you. Only 15 minutes to heat: come at 17:45. It will still be warming up.'
		},
		'earlier latest': {
			subject: 'Important: new arrival time for Sat 16 January, 18:00',
			lead: 'We now pre-heat for longer. Come between 17:10 and 17:20 and light the fire.'
		}
	};

	it.each(Object.keys(variants) as (keyof typeof variants)[])('renders %s in DE and EN, with the text part matching the HTML', (name) => {
		const de = renderHeatChange(variants[name]);
		expect(de.subject).toBe(DE[name].subject);
		expect(de.lang).toBe('de-CH');
		expect(de.text).toBe(body([DE[name].lead, `Datum: Sa 16. Januar\nBeginn: ${DE[name].start}`], ...DE_END));
		expect(htmlBodyLines(de.html)).toBe(de.text);

		const en = renderHeatChange({ ...variants[name], snapshot: { ...variants[name].snapshot, locale: 'en' } });
		expect(en.subject).toBe(EN[name].subject);
		expect(en.lang).toBe('en');
		expect(en.text).toBe(body([EN[name].lead, `Date: Sat 16 January\nStart: ${DE[name].start}`], ...EN_END));
		expect(htmlBodyLines(en.html)).toBe(en.text);
	});

	it('uses the past wording for an arrival already past at the claim', () => {
		const late = heat('18:00', cold('17:20', '17:30'), cold('17:10', '17:20'), 'de', { claimedAt: z('17:25') });
		const text = renderHeatChange(late).text;
		expect(text).toContain('Wir heizen jetzt länger vor. Komm so bald wie möglich und heiz ein.');
		expect(text).not.toContain('17:10');
	});

	it.each([
		['de', 'Wichtig: Kaltstart Sa 16. Januar, 18:30', 'Vor dir ist jetzt niemand mehr in der Sauna. Komm so bald wie möglich und heiz ein.'],
		['en', 'Important: cold start Sat 16 January, 18:30', 'Nobody is in the sauna before you any more. Come as soon as you can and light the fire.']
	] as const)('names no arrival time in the %s now-cold subject once the arrival has passed at the claim', (locale, subject, lead) => {
		const late = heat('18:30', HOT, cold('17:50', '18:00'), locale, { claimedAt: z('18:05') });
		const email = renderHeatChange(late);
		expect(email.subject).toBe(subject);
		expect(email.text).toContain(lead);
		expect(email.text).not.toContain('17:50');
		const collapsed = renderHeatChange(heat('18:00', HOT, cold('17:45', null), locale, { claimedAt: z('17:50') }));
		expect(collapsed.subject).not.toContain('17:45');
	});

	it('leaves the cancel line out without an admin contact', () => {
		const input = heat('18:30', cold('17:50', '18:00'), HOT);
		const email = renderHeatChange({ ...input, booking: { ...input.booking, adminContact: null } });
		expect(email.text).not.toContain('Absagen');
		expect(email.html).not.toContain('mailto:');
	});

	it.each([
		['equal notices', cold('17:20', '17:30'), cold('17:20', '17:30')],
		['a widened range', cold('17:20', '17:30'), cold('17:15', '17:30')],
		['no last-told notice', null, cold('17:20', '17:30')],
		['no notice', cold('17:20', '17:30'), null]
	])('throws for %s', (_name, lastTold, notice) => {
		const input = heat('18:00', HOT, HOT);
		expect(() => renderHeatChange({ ...input, snapshot: { ...input.snapshot, lastTold, notice } })).toThrow();
	});
});

describe('renderEmail', () => {
	const email = renderEmail({
		locale: 'de',
		subject: 'A <b> & "c"',
		blocks: [
			{ type: 'heading', text: 'Hi <there>' },
			{ type: 'paragraph', content: ['Call ', { text: '+41 79 123 45 67', href: 'tel:+41791234567' }, '.'] }
		]
	});

	it('sets lang, charset, color-scheme and the escaped title', () => {
		expect(email.html).toMatch(/^<!DOCTYPE html>\n<html lang="de-CH">/);
		expect(email.html).toContain('<meta charset="utf-8">');
		expect(email.html).toContain('<meta name="color-scheme" content="light dark">');
		expect(email.html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
		expect(email.html).toContain('<h1>Hi &lt;there&gt;</h1>');
		expect(email.html).toContain('<a href="tel:+41791234567">+41 79 123 45 67</a>');
	});

	it('uses no colours, images or tracking', () => {
		expect(email.html).not.toMatch(/background|color:|bgcolor|<img|style=/i);
	});

	it('signs every email', () => {
		expect(email.text).toBe('Hi <there>\n\nCall +41 79 123 45 67.\n\nBis bald, Sauna Luegisee\n');
	});

	it('escapes every HTML special character', () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
	});
});

describe('classifySendError', () => {
	it.each([
		['SMTP 550', { responseCode: 550, code: 'EENVELOPE' }, { outcome: 'refused', smtpCode: 550, reason: 'smtp 550' }],
		['SMTP 554', { responseCode: 554 }, { outcome: 'refused', smtpCode: 554, reason: 'smtp 554' }],
		['SMTP 421', { responseCode: 421 }, { outcome: 'transient_failure', smtpCode: 421, reason: 'smtp 421' }],
		['SMTP 451', { responseCode: 451, code: 'EENVELOPE' }, { outcome: 'transient_failure', smtpCode: 451, reason: 'smtp 451' }],
		['a connection error', { code: 'ECONNECTION' }, { outcome: 'transient_failure', smtpCode: null, reason: 'ECONNECTION' }],
		['a timeout', { code: 'ETIMEDOUT' }, { outcome: 'transient_failure', smtpCode: null, reason: 'ETIMEDOUT' }],
		['a render error', new TypeError('x is undefined'), { outcome: 'transient_failure', smtpCode: null, reason: 'error' }],
		['a code that is not a code', { code: 'mail for lena@example.ch' }, { outcome: 'transient_failure', smtpCode: null, reason: 'error' }],
		['nothing', null, { outcome: 'transient_failure', smtpCode: null, reason: 'error' }]
	])('classifies %s', (_label, error, expected) => {
		expect(classifySendError(error)).toEqual(expected);
	});

	it('never stores the server text', () => {
		const result = classifySendError({ responseCode: 550, response: '550 5.1.1 <lena@example.ch>: unknown user' });
		expect(JSON.stringify(result)).not.toContain('lena');
	});
});

describe('responseCodeOf', () => {
	it('reads the code at the start of a response', () => {
		expect(responseCodeOf('250 2.0.0 Ok: queued as 123')).toBe(250);
		expect(responseCodeOf('nope')).toBeNull();
		expect(responseCodeOf(undefined)).toBeNull();
	});
});

describe('the sink transport', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'sauna-mail-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const env = (over: Partial<Env> = {}): Env => ({
		production: false,
		databasePath: join(dir, 'app.sqlite'),
		guestKeySecret: 'dev-only-x',
		mailTransport: 'sink',
		smtp: null,
		devNow: null,
		...over
	});

	it('sits next to the database', () => {
		expect(sinkDir('./data/dev.sqlite')).toBe('data/mail-sink');
	});

	it('writes a multipart/alternative .eml with From, Reply-To and Content-Language', async () => {
		const mailer = createMailer(env());
		const email = renderConfirmation(input({}, 'de'));
		const result = await mailer.send({ rowId: 7, kind: 'confirmation', attempt: 1, to: 'lena@example.ch', replyTo: 'admin@example.ch', email });
		expect(result).toEqual({ outcome: 'accepted', smtpCode: null, reason: null });
		const eml = readFileSync(join(dir, 'mail-sink', '7-confirmation-1.eml'), 'utf8');
		expect(eml).toMatch(/^Content-Type: multipart\/alternative;/m);
		expect(eml).toMatch(/^Content-Type: text\/plain; charset=utf-8/m);
		expect(eml).toMatch(/^Content-Type: text\/html; charset=utf-8/m);
		expect(eml).toMatch(/^Content-Language: de-CH$/m);
		expect(eml).toMatch(/^Auto-Submitted: auto-generated$/m);
		expect(eml).toMatch(/^From: Sauna Luegisee <noreply@sauna-luegisee\.ch>$/m);
		expect(eml).toMatch(/^Reply-To: admin@example\.ch$/m);
		expect(eml).toMatch(/^To: lena@example\.ch$/m);
		expect(eml).toMatch(/^Subject: /m);
	});

	it('leaves Reply-To out without an admin contact', async () => {
		const mailer = createMailer(env());
		const email = renderConfirmation(input({ adminContact: null }));
		await mailer.send({ rowId: 8, kind: 'confirmation', attempt: 1, to: 'lena@example.ch', replyTo: null, email });
		const eml = readFileSync(join(dir, 'mail-sink', '8-confirmation-1.eml'), 'utf8');
		expect(eml).not.toMatch(/^Reply-To:/m);
		expect(eml).toMatch(/^Content-Language: en$/m);
	});

	it('keeps every attempt of a row in its own file', async () => {
		const mailer = createMailer(env());
		const email = renderConfirmation(input());
		for (const attempt of [1, 2]) {
			await mailer.send({ rowId: 5, kind: 'confirmation', attempt, to: 'lena@example.ch', replyTo: null, email });
		}
		expect(readdirSync(join(dir, 'mail-sink')).sort()).toEqual(['5-confirmation-1.eml', '5-confirmation-2.eml']);
	});

	it('uses the sink outside production even with SMTP values set', async () => {
		const mailer = createMailer(
			env({ smtp: { host: 'mail.invalid', port: 587, user: 'u', pass: 'p', from: 'x@sauna-luegisee.ch' } })
		);
		const email = renderConfirmation(input());
		expect(await mailer.send({ rowId: 9, kind: 'confirmation', attempt: 1, to: 'lena@example.ch', replyTo: null, email })).toEqual({
			outcome: 'accepted',
			smtpCode: null,
			reason: null
		});
		expect(readFileSync(join(dir, 'mail-sink', '9-confirmation-1.eml'), 'utf8')).toContain('noreply@sauna-luegisee.ch');
	});
});

describe('the SMTP transport', () => {
	const SMTP = { host: 'mail.example.ch', port: 587, user: 'u', pass: 'p', from: 'sauna@sauna-luegisee.ch' };
	const env: Env = {
		production: true,
		databasePath: '/data/app.sqlite',
		guestKeySecret: 'x'.repeat(40),
		mailTransport: 'smtp',
		smtp: SMTP,
		devNow: null
	};
	const message = {
		rowId: 3,
		kind: 'confirmation',
		attempt: 1,
		to: 'lena@example.ch',
		replyTo: 'admin@example.ch',
		email: renderConfirmation(input({}, 'de'))
	};

	/** Stubs nodemailer's transport: `sendMail` resolves `info` or rejects with `error`. */
	const stub = (outcome: { info?: object; error?: object }) => {
		const sendMail = vi.fn(async () => {
			if (outcome.error) throw outcome.error;
			return outcome.info;
		});
		const createTransport = vi
			.spyOn(nodemailer, 'createTransport')
			.mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
		return { sendMail, createTransport };
	};

	afterEach(() => vi.restoreAllMocks());

	it('connects with STARTTLS required and timeouts under the in-flight timeout', () => {
		const { createTransport } = stub({ info: { rejected: [], response: '250 ok' } });
		createMailer(env);
		expect(createTransport).toHaveBeenCalledWith({
			host: 'mail.example.ch',
			port: 587,
			secure: false,
			requireTLS: true,
			auth: { user: 'u', pass: 'p' },
			connectionTimeout: 30_000,
			greetingTimeout: 30_000,
			socketTimeout: 60_000
		});
	});

	it('sends From, Reply-To, Content-Language and Auto-Submitted; 250 is accepted', async () => {
		const { sendMail } = stub({ info: { accepted: ['lena@example.ch'], rejected: [], response: '250 ok' } });
		expect(await createMailer(env).send(message)).toEqual({ outcome: 'accepted', smtpCode: 250, reason: null });
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				from: { name: 'Sauna Luegisee', address: 'sauna@sauna-luegisee.ch' },
				to: 'lena@example.ch',
				replyTo: 'admin@example.ch',
				headers: { 'Content-Language': 'de-CH', 'Auto-Submitted': 'auto-generated' }
			})
		);
	});

	it('refuses a recipient rejected with 550', async () => {
		stub({ info: { rejected: ['lena@example.ch'], rejectedErrors: [{ responseCode: 550 }], response: '250 ok' } });
		expect(await createMailer(env).send(message)).toEqual({ outcome: 'refused', smtpCode: 550, reason: 'smtp 550' });
	});

	it('refuses a recipient rejected without a 4xx/5xx code', async () => {
		stub({ info: { rejected: ['lena@example.ch'], rejectedErrors: [{}], response: '250 ok' } });
		expect(await createMailer(env).send(message)).toEqual({ outcome: 'refused', smtpCode: null, reason: 'rejected' });
		stub({ info: { rejected: ['lena@example.ch'], response: '250 ok' } });
		expect(await createMailer(env).send(message)).toEqual({ outcome: 'refused', smtpCode: null, reason: 'rejected' });
	});

	it('classifies a thrown SMTP error', async () => {
		stub({ error: { responseCode: 421, code: 'EENVELOPE' } });
		expect(await createMailer(env).send(message)).toEqual({
			outcome: 'transient_failure',
			smtpCode: 421,
			reason: 'smtp 421'
		});
	});

	it('throws SMTP_CONFIG without SMTP settings', () => {
		expect(() => createMailer({ ...env, smtp: null })).toThrow(expect.objectContaining({ code: 'SMTP_CONFIG' }));
	});
});
