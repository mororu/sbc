// The analytics guest key (AD-22): HMAC-SHA256 of the trimmed, lowercased email, keyed with
// GUEST_KEY_SECRET. No plain hash of an email is stored anywhere.
import { createHmac } from 'node:crypto';

/** 64 hex characters; the same for an email in another case or with surrounding spaces. */
export function guestKey(email: string, secret: string): string {
	return createHmac('sha256', secret).update(email.trim().toLowerCase(), 'utf8').digest('hex');
}
