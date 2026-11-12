// Public ids and submit tokens (AD-13): random, URL-safe, 128 bits. Row ids never reach a guest page.
import { randomBytes } from 'node:crypto';
import { RANDOM_ID } from '#lib/schemas/index.ts';

/** 16 random bytes as base64url: 22 characters. */
export function randomId(): string {
	return randomBytes(16).toString('base64url');
}

/** True for something shaped like a public id or submit token; anything else is never looked up. */
export function isRandomId(value: string): boolean {
	return RANDOM_ID.test(value);
}
