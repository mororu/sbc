import { describe, expect, it } from 'vitest';
import { parseEnv } from './env-parse.ts';

const devMinimal = {
	DATABASE_PATH: './data/test.sqlite',
	GUEST_KEY_SECRET: 'test-only-secret'
};

const prodSecret = { GUEST_KEY_SECRET: 'a'.repeat(32) };

const smtp = {
	SMTP_HOST: 'mail.example.test',
	SMTP_PORT: '587',
	SMTP_USER: 'user',
	SMTP_PASS: 'pass',
	MAIL_FROM: 'Sauna <test@example.test>'
};

describe('parseEnv', () => {
	it('loads a minimal development env and uses the local mail sink', () => {
		const env = parseEnv(devMinimal, 'development');
		expect(env).toEqual({
			production: false,
			databasePath: './data/test.sqlite',
			guestKeySecret: 'test-only-secret',
			mailTransport: 'sink',
			smtp: null
		});
	});

	it('treats an unset NODE_ENV as development', () => {
		expect(parseEnv(devMinimal, undefined).mailTransport).toBe('sink');
	});

	it('keeps the local sink in development even with SMTP values present', () => {
		const env = parseEnv({ ...devMinimal, ...smtp }, 'development');
		expect(env.mailTransport).toBe('sink');
		expect(env.smtp).toBeNull();
	});

	it('loads a complete production env with SMTP', () => {
		const env = parseEnv({ ...devMinimal, ...smtp, ...prodSecret }, 'production');
		expect(env.production).toBe(true);
		expect(env.mailTransport).toBe('smtp');
		expect(env.smtp).toEqual({
			host: 'mail.example.test',
			port: 587,
			user: 'user',
			pass: 'pass',
			from: 'Sauna <test@example.test>'
		});
	});

	it('fails in production when a variable is missing, naming it', () => {
		const { GUEST_KEY_SECRET: _omit, ...rest } = { ...devMinimal, ...smtp };
		expect(() => parseEnv(rest, 'production')).toThrow(/GUEST_KEY_SECRET/);
	});

	it('names every missing variable in production', () => {
		expect(() => parseEnv(devMinimal, 'production')).toThrow(
			'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM'
		);
	});

	it('treats blank values as missing', () => {
		expect(() => parseEnv({ ...devMinimal, GUEST_KEY_SECRET: '  ' }, 'development')).toThrow(
			/GUEST_KEY_SECRET/
		);
	});

	it.each(['development', 'production'])('fails without DATABASE_PATH in %s', (nodeEnv) => {
		const { DATABASE_PATH: _omit, ...rest } = { ...devMinimal, ...smtp };
		expect(() => parseEnv(rest, nodeEnv)).toThrow(/DATABASE_PATH/);
	});

	it.each(['abc', '0', '70000', '587.5', '0x24B', '5.87e2'])(
		'rejects SMTP_PORT %s in production',
		(port) => {
			expect(() =>
				parseEnv({ ...devMinimal, ...smtp, ...prodSecret, SMTP_PORT: port }, 'production')
			).toThrow(/SMTP_PORT/);
		}
	);

	it.each([
		['the .env.example value', 'dev-only-not-for-production-0b7f3c9a-long-enough'],
		['a short value', 'too-short']
	])('rejects %s as GUEST_KEY_SECRET in production', (_label, secret) => {
		expect(() =>
			parseEnv({ ...devMinimal, ...smtp, GUEST_KEY_SECRET: secret }, 'production')
		).toThrow(/GUEST_KEY_SECRET/);
	});
});
