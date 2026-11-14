// Mail transport (AD-15). Production (`NODE_ENV=production`) sends over SMTP with STARTTLS required.
// Everything else writes `<rowId>-<kind>-<attempt>.eml` files to the local sink next to the
// database, even with SMTP values set. Only the worker calls `send`. A send never throws: it returns the outcome, the SMTP code and
// a reason that is `smtp <code>` or an error code, never the server's text (it can echo the address).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';
import type { Env } from '../env.ts';
import type { RenderedEmail } from './layout.ts';

export const FROM_NAME = 'Sauna Luegisee';
/** The sink's From address; production uses MAIL_FROM. */
const SINK_FROM = 'noreply@sauna-luegisee.ch';

export type OutgoingMessage = {
	/** The outbox row id, kind and attempt number: they name the sink file. */
	rowId: number;
	kind: string;
	attempt: number;
	to: string;
	/** The admin contact at send time; null leaves `Reply-To` out. */
	replyTo: string | null;
	email: RenderedEmail;
};

export type SendResult = {
	outcome: 'accepted' | 'refused' | 'transient_failure';
	smtpCode: number | null;
	reason: string | null;
};

export type Mailer = { send(message: OutgoingMessage): Promise<SendResult> };

/** The sink folder: `mail-sink/` next to the database file. */
export function sinkDir(databasePath: string): string {
	return join(dirname(databasePath), 'mail-sink');
}

/**
 * A failed send, classified: SMTP 5xx is refused, SMTP 4xx, a connection error and anything
 * unexpected (a render error included) are transient.
 */
export function classifySendError(error: unknown): SendResult {
	const { responseCode, code } = (error ?? {}) as { responseCode?: unknown; code?: unknown };
	if (typeof responseCode === 'number' && Number.isInteger(responseCode)) {
		if (responseCode >= 500 && responseCode < 600) {
			return { outcome: 'refused', smtpCode: responseCode, reason: `smtp ${responseCode}` };
		}
		if (responseCode >= 400 && responseCode < 500) {
			return { outcome: 'transient_failure', smtpCode: responseCode, reason: `smtp ${responseCode}` };
		}
	}
	const reason = typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/.test(code) ? code : 'error';
	return { outcome: 'transient_failure', smtpCode: null, reason };
}

/** The SMTP code at the start of a server response such as "250 2.0.0 Ok: queued", or null. */
export function responseCodeOf(response: unknown): number | null {
	const match = typeof response === 'string' ? /^(\d{3})\b/.exec(response) : null;
	return match ? Number(match[1]) : null;
}

function mailOptions(message: OutgoingMessage, from: string) {
	return {
		from: { name: FROM_NAME, address: from },
		to: message.to,
		...(message.replyTo ? { replyTo: message.replyTo } : {}),
		subject: message.email.subject,
		text: message.email.text,
		html: message.email.html,
		// RFC 3834: tells mail servers and autoresponders this is an automatic message.
		headers: { 'Content-Language': message.email.lang, 'Auto-Submitted': 'auto-generated' }
	};
}

export function createMailer(env: Env, options: { sinkDir?: string } = {}): Mailer {
	if (env.mailTransport === 'smtp') {
		const smtp = env.smtp;
		if (!smtp) throw Object.assign(new Error('SMTP transport without SMTP settings'), { code: 'SMTP_CONFIG' });
		// Timeouts well under the in-flight timeout (10 min), so a hung send ends long before its row
		// counts as stale and is released.
		const transporter = nodemailer.createTransport({
			host: smtp.host,
			port: smtp.port,
			secure: false,
			requireTLS: true,
			auth: { user: smtp.user, pass: smtp.pass },
			connectionTimeout: 30_000,
			greetingTimeout: 30_000,
			socketTimeout: 60_000
		});
		return {
			async send(message) {
				try {
					const info = await transporter.sendMail(mailOptions(message, smtp.from));
					if (info.rejected.length > 0) {
						const code = info.rejectedErrors?.[0]?.responseCode;
						return typeof code === 'number' && code >= 400 && code < 600
							? classifySendError({ responseCode: code })
							: { outcome: 'refused', smtpCode: null, reason: 'rejected' };
					}
					return { outcome: 'accepted', smtpCode: responseCodeOf(info.response), reason: null };
				} catch (error) {
					return classifySendError(error);
				}
			}
		};
	}

	const dir = options.sinkDir ?? sinkDir(env.databasePath);
	const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
	return {
		async send(message) {
			try {
				const info = await transporter.sendMail(mailOptions(message, SINK_FROM));
				mkdirSync(dir, { recursive: true });
				writeFileSync(join(dir, `${message.rowId}-${message.kind}-${message.attempt}.eml`), info.message as Buffer);
				return { outcome: 'accepted', smtpCode: null, reason: null };
			} catch (error) {
				return classifySendError(error);
			}
		}
	};
}
