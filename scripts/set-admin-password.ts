// Sets the shared admin password (AD-10; Story 3.1). Run from the app's root folder:
//   npm run set-admin-password              → asks for it (twice), or reads it from stdin when piped
//   npm run set-admin-password -- --reset   → replaces an existing one and signs out every admin
// The password is read from stdin only: never an argument or env value, never echoed, logged or
// printed. Only its argon2id hash is stored, through the setAdminPassword command. The database is
// DATABASE_PATH (as for the app); migrations are applied first, so it also works before the first start.
import { validateNewPassword, PASSWORD_MIN } from '#lib/schemas/index.ts';
import { setAdminPassword, type SetAdminPasswordResult } from '#lib/server/commands/admin-session.ts';
import { isLockTimeout } from '#lib/server/commands/create-booking.ts';
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { hashPassword } from '#lib/server/password.ts';
import { EMPTY_INPUT, feedHiddenInput } from './hidden-input.ts';

function fail(message: string): never {
	process.stderr.write(`${message}\nNothing was stored.\n`);
	process.exit(1);
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--reset');
if (unknown.length > 0) fail(`Unknown argument. The only option is --reset; the password is read from stdin, never from an argument.`);
const reset = args.includes('--reset');

/** All of stdin, without one trailing line break (piped input). */
async function readPiped(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** One line from the terminal with echo off: nothing is shown while typing. */
function readHidden(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		process.stderr.write(prompt);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		let state = EMPTY_INPUT;
		const done = (result: string | null) => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener('data', onData);
			process.stderr.write('\n');
			if (result === null) fail('Cancelled.');
			resolve(result);
		};
		const onData = (input: string) => {
			state = feedHiddenInput(state, input);
			if (state.result === 'done') done(state.value);
			else if (state.result === 'cancelled') done(null);
		};
		stdin.on('data', onData);
	});
}

async function readPassword(): Promise<string> {
	if (!process.stdin.isTTY) return readPiped();
	const first = await readHidden(`New admin password (at least ${PASSWORD_MIN} characters): `);
	const again = await readHidden('Again: ');
	if (first !== again) fail('The two entries do not match.');
	return first;
}

const password = await readPassword();
// eslint-disable-next-line no-control-regex
if (/[\u0000-\u001f\u007f-\u009f]/u.test(password)) {
	fail('The password must not contain a line break or other control character.');
}
const problem = validateNewPassword(password);
switch (problem) {
	case null:
		break;
	case 'password_too_short':
		fail(`The password needs at least ${PASSWORD_MIN} characters.`);
		break;
	case 'password_too_long':
		fail('The password is too long.');
		break;
	default:
		fail('The password cannot be used.');
}

let result: SetAdminPasswordResult;
try {
	applyMigrations();
	result = setAdminPassword({ hash: await hashPassword(password), reset });
} catch (error) {
	// A short line, never a stack trace (and never the password).
	fail(isLockTimeout(error) ? 'The database is busy. Try again in a moment.' : 'The password could not be stored.');
}
if (!result.ok) {
	if (result.code === 'conflict') {
		fail('An admin password is already set. To replace it, run again with --reset (this signs out every admin).');
	}
	fail('The password could not be stored.');
}
process.stdout.write(
	result.replaced ? `Admin password replaced. Signed out sessions: ${result.sessionsDeleted}.\n` : 'Admin password set.\n'
);
