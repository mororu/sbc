// The admin password hash (AD-10; Story 3.1): argon2id with the library defaults. Only the hash is
// stored (`setting.admin_password_hash`); the password itself is never logged, stored or echoed.
import { argon2id, hash, verify } from 'argon2';

/** The PHC prefix every stored hash starts with. */
export const ARGON2ID_PREFIX = '$argon2id$';

/**
 * Unicode NFC before hashing and verifying: a terminal may send "ü" decomposed (NFD), a browser
 * composed (NFC); both must be the same password.
 */
const normalise = (password: string) => password.normalize('NFC');

/** The argon2id hash of `password` (NFC), in PHC string form (`$argon2id$v=19$…`). */
export function hashPassword(password: string): Promise<string> {
	return hash(normalise(password), { type: argon2id });
}

/** True when `password` matches `digest`. A malformed digest is a mismatch, never a throw. */
export async function verifyPassword(digest: string, password: string): Promise<boolean> {
	try {
		return await verify(digest, normalise(password));
	} catch {
		return false;
	}
}
