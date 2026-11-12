// Pure env parsing. The only place that reads process.env is ./env.ts.

export const ENV_VARIABLES = [
	'DATABASE_PATH',
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_USER',
	'SMTP_PASS',
	'MAIL_FROM',
	'GUEST_KEY_SECRET'
] as const;

/** Optional outside production: development always uses the local mail sink. */
const DEV_OPTIONAL = new Set<string>(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']);

/** The .env.example value starts with this; production refuses it. */
export const DEV_SECRET_PREFIX = 'dev-only-';
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

export type Smtp = {
	host: string;
	port: number;
	user: string;
	pass: string;
	from: string;
};

export type Env = {
	production: boolean;
	databasePath: string;
	guestKeySecret: string;
	/** Production sends over SMTP; everything else goes to the local sink, even with SMTP values set. */
	mailTransport: 'smtp' | 'sink';
	smtp: Smtp | null;
	/** Development only: a fixed "now" (UTC ISO instant) for trying season states. Null otherwise. */
	devNow: string | null;
};

/** Parses DEV_NOW into canonical instant text (seconds and `Z`), or throws. */
function parseDevNow(raw: string): string {
	try {
		return Temporal.Instant.from(raw).toString({ smallestUnit: 'second' });
	} catch {
		throw new Error(`DEV_NOW must be an ISO 8601 instant such as 2027-01-12T09:00:00Z, not "${raw}".`);
	}
}

export function parseEnv(source: Record<string, string | undefined>, nodeEnv: string | undefined): Env {
	const production = nodeEnv === 'production';
	const value = (name: string) => {
		const raw = source[name]?.trim();
		return raw ? raw : undefined;
	};

	const missing = ENV_VARIABLES.filter(
		(name) => value(name) === undefined && (production || !DEV_OPTIONAL.has(name))
	);
	if (missing.length > 0) {
		throw new Error(
			`Missing environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
				(production
					? 'All of them are required in production.'
					: 'Copy .env.example to .env for development.')
		);
	}

	const rawDevNow = value('DEV_NOW');
	if (production && rawDevNow !== undefined) {
		throw new Error('DEV_NOW is for development only; remove it from the production env.');
	}
	const devNow = rawDevNow === undefined ? null : parseDevNow(rawDevNow);

	let smtp: Smtp | null = null;
	if (production) {
		const secret = value('GUEST_KEY_SECRET')!;
		if (secret.startsWith(DEV_SECRET_PREFIX) || secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
			throw new Error(
				`GUEST_KEY_SECRET must be a random production secret of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters, not the development value.`
			);
		}
		const rawPort = value('SMTP_PORT')!;
		const port = Number(rawPort);
		if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
			throw new Error('SMTP_PORT must be a port number between 1 and 65535.');
		}
		smtp = {
			host: value('SMTP_HOST')!,
			port,
			user: value('SMTP_USER')!,
			pass: value('SMTP_PASS')!,
			from: value('MAIL_FROM')!
		};
	}

	return {
		production,
		databasePath: value('DATABASE_PATH')!,
		guestKeySecret: value('GUEST_KEY_SECRET')!,
		mailTransport: production ? 'smtp' : 'sink',
		smtp,
		devNow
	};
}
