// In-process worker (AD-5, AD-23): drains the outbox and records its heartbeat. Started once from
// hooks.server.ts `init`, behind a `globalThis` guard because dev HMR re-evaluates this module and a
// module-level flag would reset. Each tick releases stale claims, claims due rows until none is left
// (so the first tick after downtime catches up), sends each one outside any transaction and records
// the outcome, then records the heartbeat, but only when the drain did not fail, so an old heartbeat
// also flags a worker that runs but cannot send. The next tick is scheduled only after the current
// one has finished. Delivery is at-least-once (AD-23): a stale release may resend a mail the server
// had already accepted. A keybox row whose settings are unset is held: the claim skips it, and after
// the drain the tick logs a `held` line for each row that is newly held or now misses another
// setting (the last held set is kept in memory), so an unset setting is not logged every minute.
// Log lines name the row id, kind, attempt, state, SMTP code and next due time only: never a guest's
// name, email, mobile or the keybox code, and never the SMTP server's text.
import {
	cancelInFlightOfDeleted,
	claimDueRow,
	recordHeartbeat,
	recordSendOutcome,
	releaseHeldKeybox,
	releaseStaleClaims,
	type ClaimedRow
} from '#lib/server/commands/index.ts';
import { getHeldKeyboxRows, getSendData } from '#lib/server/db/queries/index.ts';
import {
	classifySendError,
	createMailer,
	renderConfirmation,
	renderHeatChange,
	renderKeybox,
	type Mailer,
	type RenderedEmail,
	type SendResult
} from '#lib/server/mail/index.ts';
import { missingKeyboxSetting, type KeyboxSettingName } from '#lib/domain/index.ts';
import type { Instant } from '#lib/time/index.ts';
import { now as clockNow } from '../clock.ts';
import { getEnv } from '../env.ts';

/** About a minute between the end of one tick and the start of the next. */
export const TICK_INTERVAL_MS = 60_000;

type Db = NonNullable<NonNullable<Parameters<typeof claimDueRow>[0]>['db']>;
type SendData = NonNullable<ReturnType<typeof getSendData>>;

export type WorkerDeps = {
	db?: Db;
	mailer?: Mailer;
	now?: () => Instant;
	log?: (line: string) => void;
};

type Context = { db: Db | undefined; mailer: Mailer; now: () => Instant; log: (line: string) => void };

const WORKER = Symbol.for('sauna-booking.worker');
const HELD = Symbol.for('sauna-booking.worker.held');

type WorkerState = { timer: ReturnType<typeof setTimeout> | null; stopped: boolean };

const defaultLog = (line: string) => console.log(line);

function context(deps: WorkerDeps): Context {
	return {
		db: deps.db,
		// Throws a coded error (SMTP_CONFIG) when production has no SMTP settings.
		mailer: deps.mailer ?? createMailer(getEnv()),
		now: deps.now ?? clockNow,
		log: deps.log ?? defaultLog
	};
}

/** An error's code for the log, never its message (which can carry an address). */
function errorCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/.test(code) ? code : 'error';
}

const noTemplate = (kind: string) => Object.assign(new Error(`No template for ${kind}`), { code: 'NO_TEMPLATE' });

function render(row: ClaimedRow, data: SendData): RenderedEmail {
	switch (row.kind) {
		case 'confirmation':
			return renderConfirmation({
				snapshot: { notice: row.snapshotNotice, locale: row.snapshotLocale },
				booking: data,
				claimedAt: row.claimedAt
			});
		case 'keybox':
			return renderKeybox({
				snapshot: { notice: row.snapshotNotice, keyboxCode: row.snapshotKeyboxCode, locale: row.snapshotLocale },
				booking: { start: data.start, instructions: data.keyboxInstructions, adminContact: data.adminContact },
				claimedAt: row.claimedAt
			});
		case 'heat_change':
			return renderHeatChange({
				snapshot: { notice: row.snapshotNotice, lastTold: row.snapshotLastTold, locale: row.snapshotLocale },
				booking: { start: data.start, adminContact: data.adminContact },
				claimedAt: row.claimedAt
			});
		default:
			throw noTemplate(row.kind);
	}
}

/** The held keybox rows last logged, by row id. On `globalThis`, like the loop guard, for dev HMR. */
function heldMemory(): Map<number, KeyboxSettingName> {
	const g = globalThis as { [HELD]?: Map<number, KeyboxSettingName> };
	g[HELD] ??= new Map();
	return g[HELD];
}

/** Logs a held row unless it was already logged as missing the same setting. Names the setting, never its value. */
function logHeld(ctx: Context, id: number, missing: KeyboxSettingName): void {
	const memory = heldMemory();
	if (memory.get(id) !== missing) ctx.log(`[worker] outbox ${id} keybox held missing=${missing}`);
	memory.set(id, missing);
}

/** Logs the rows newly held (or missing another setting) and forgets the rows no longer held. */
function logHeldRows(ctx: Context, at: Instant): void {
	const held = getHeldKeyboxRows(at, ctx.db);
	const memory = heldMemory();
	const ids = new Set(held.map((row) => row.id));
	for (const id of [...memory.keys()]) if (!ids.has(id)) memory.delete(id);
	for (const row of held) logHeld(ctx, row.id, row.missing);
}

/** The keybox setting a claimed keybox row now lacks: its frozen code, or the instructions read at send time. */
function heldSince(row: ClaimedRow, data: SendData): KeyboxSettingName | null {
	const instructions = { de: null, en: null, [row.snapshotLocale]: data.keyboxInstructions };
	return missingKeyboxSetting({ code: row.snapshotKeyboxCode, instructions }, row.snapshotLocale);
}

const refused = (reason: string): SendResult => ({ outcome: 'refused', smtpCode: null, reason });

/**
 * Sends one claimed row. Deterministic failures (no row, no address, no template, a render error)
 * are terminal; only the transport's own classification can make a row transient. A booking deleted
 * since the claim is not sent and its row is cancelled. A keybox row whose instructions were unset
 * since the claim is not sent either: it goes back to `pending`, held until the setting is fixed.
 * Exported for tests.
 */
export async function sendClaimedRow(row: ClaimedRow, deps: WorkerDeps = {}): Promise<void> {
	const ctx = context(deps);
	const prefix = `[worker] outbox ${row.id} ${row.kind} attempt=${row.attempts}`;
	const data = getSendData(row.id, ctx.db);
	if (data?.deletedAt) {
		const cancelled = cancelInFlightOfDeleted(row.id, { now: ctx.now(), db: ctx.db });
		ctx.log(`${prefix} ${cancelled.code}`);
		return;
	}

	const held = data && row.kind === 'keybox' ? heldSince(row, data) : null;
	let result: SendResult;
	let email: RenderedEmail | null = null;
	if (!data) result = refused('no_row');
	// The contact data was erased: no retry can deliver this one.
	else if (!data.email) result = refused('no_address');
	else if (held) {
		const released = releaseHeldKeybox(row.id, { db: ctx.db });
		if (released.ok) logHeld(ctx, row.id, held);
		else ctx.log(`${prefix} ${released.code}`);
		return;
	} else {
		try {
			email = render(row, data);
			result = { outcome: 'accepted', smtpCode: null, reason: null };
		} catch (error) {
			result = refused(errorCode(error) === 'NO_TEMPLATE' ? 'no_template' : 'render_error');
		}
		if (email) {
			try {
				result = await ctx.mailer.send({
					rowId: row.id,
					kind: row.kind,
					attempt: row.attempts,
					to: data.email,
					replyTo: data.adminContact,
					email
				});
			} catch (error) {
				result = classifySendError(error);
			}
		}
	}

	const recorded = recordSendOutcome(row.id, result.outcome, result.reason, { now: ctx.now(), db: ctx.db });
	const due = 'dueAt' in recorded && recorded.dueAt ? ` due=${recorded.dueAt}` : '';
	ctx.log(`${prefix} ${recorded.code} smtp=${result.smtpCode ?? '-'}${due}`);
}

/**
 * One tick: release stale claims, drain every due row, log the newly held keybox rows (also when the
 * drain failed), then record the heartbeat if the drain succeeded. One instant for the release, the
 * claims and the held list. Never throws.
 */
export async function tick(deps: WorkerDeps = {}): Promise<void> {
	let ctx: Context;
	try {
		ctx = context(deps);
	} catch (error) {
		(deps.log ?? defaultLog)(`[worker] tick failed: ${errorCode(error)}`);
		return;
	}
	const at = ctx.now();
	let drained = true;
	try {
		const released = releaseStaleClaims({ now: at, db: ctx.db });
		if (released.released > 0 || released.superseded > 0) {
			ctx.log(`[worker] released ${released.released} stale claims, superseded ${released.superseded}`);
		}
		for (;;) {
			const claim = claimDueRow({ now: at, db: ctx.db });
			if (!claim.ok) break;
			await sendClaimedRow(claim.row, { ...deps, mailer: ctx.mailer });
		}
	} catch (error) {
		// No heartbeat: the worker runs but cannot drain, and an old heartbeat should say so.
		ctx.log(`[worker] tick failed: ${errorCode(error)}`);
		drained = false;
	}
	try {
		logHeldRows(ctx, at);
	} catch (error) {
		ctx.log(`[worker] held check failed: ${errorCode(error)}`);
	}
	if (!drained) return;
	try {
		recordHeartbeat({ now: ctx.now(), db: ctx.db });
	} catch (error) {
		ctx.log(`[worker] heartbeat failed: ${errorCode(error)}`);
	}
}

function globalState(): { [WORKER]?: WorkerState } {
	return globalThis as { [WORKER]?: WorkerState };
}

/**
 * Starts the worker once per process: a second call (e.g. after HMR) starts nothing and returns
 * false. Ticks right away (releasing stale claims first) and about every minute after each tick ends.
 */
export function startWorker(deps: WorkerDeps = {}): boolean {
	const g = globalState();
	if (g[WORKER]) return false;
	const state: WorkerState = { timer: null, stopped: false };
	g[WORKER] = state;

	const schedule = (delay: number) => {
		if (state.stopped) return;
		state.timer = setTimeout(run, delay);
		state.timer.unref();
	};
	// One transport for the life of the loop. Without one (SMTP_CONFIG), each tick retries creating
	// it and logs the code.
	let loopDeps = deps;
	try {
		loopDeps = { ...deps, mailer: deps.mailer ?? createMailer(getEnv()) };
	} catch (error) {
		(deps.log ?? defaultLog)(`[worker] mailer failed: ${errorCode(error)}`);
	}
	const run = async () => {
		try {
			await tick(loopDeps);
		} finally {
			schedule(TICK_INTERVAL_MS);
		}
	};
	schedule(0);
	return true;
}

/** Stops the loop, clears the guard and forgets the held rows. For tests; the app's worker runs until the process ends. */
export function stopWorker(): void {
	heldMemory().clear();
	const g = globalState();
	const state = g[WORKER];
	if (!state) return;
	state.stopped = true;
	if (state.timer) clearTimeout(state.timer);
	delete g[WORKER];
}
