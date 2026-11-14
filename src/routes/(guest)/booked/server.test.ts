// The token lookup's I/O matrix rows (A1): resume, unknown or deleted, malformed body.
import { beforeAll, describe, expect, it, vi } from 'vitest';
// The test migrates its own in-memory database; routes never touch the db layer.
// eslint-disable-next-line no-restricted-imports
import { applyMigrations } from '#lib/server/db/migrate.ts';
// The test writes the booking rows it looks up.
// eslint-disable-next-line no-restricted-imports
import { getDb } from '#lib/server/db/index.ts';
import * as endpoint from './+server.ts';
import { POST } from './+server.ts';

vi.mock('#lib/server/env.ts', () => ({
	getEnv: () => ({
		production: false,
		databasePath: ':memory:',
		guestKeySecret: 'test-only',
		mailTransport: 'sink',
		smtp: null,
		devNow: '2027-01-12T08:00:00Z'
	})
}));

const LIVE = { publicId: 'PUBLICLIVE000000000000', token: 'TOKENLIVE0000000000000' };
const DELETED = { publicId: 'PUBLICGONE000000000000', token: 'TOKENGONE0000000000000' };

beforeAll(() => {
	applyMigrations();
	const insert = getDb().$client.prepare(
		"insert into booking (start_at, duration_min, changeover_min, created_at, season_id, deleted_at, party_size, locale, public_id, submit_token) values ('2027-01-12T13:00:00Z', 90, 15, '2027-01-12T08:00:00Z', 1, ?, 3, 'de', ?, ?)"
	);
	insert.run(null, LIVE.publicId, LIVE.token);
	insert.run('2027-01-12T09:00:00Z', DELETED.publicId, DELETED.token);
});

async function post(body: string) {
	const request = new Request('http://x/booked', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body
	});
	const res = await (POST as (e: unknown) => Promise<Response>)({ request });
	return { status: res.status, cache: res.headers.get('cache-control'), text: await res.text() };
}

describe('POST /booked', () => {
	it('answers a live booking with its confirmation href, without the changed flag', async () => {
		const res = await post(JSON.stringify({ submitToken: LIVE.token }));
		expect(res.status).toBe(200);
		expect(JSON.parse(res.text)).toEqual({ href: `/booked/${LIVE.publicId}?new=1` });
		expect(res.cache).toBe('private, no-store');
	});

	it.each([
		['an unknown token', 'TOKENNONE0000000000000'],
		['a deleted booking', DELETED.token]
	])('answers %s with a bare 404', async (_label, submitToken) => {
		expect(await post(JSON.stringify({ submitToken }))).toEqual({ status: 404, cache: 'private, no-store', text: '' });
	});

	it.each([
		['not JSON', '{'],
		['JSON null', 'null'],
		['no token', '{}'],
		['a number', '{"submitToken":42}'],
		['a short token', '{"submitToken":"abc"}'],
		['a token with other characters', '{"submitToken":"TOKENLIVE000000000000!"}']
	])('answers %s with a bare 400', async (_label, body) => {
		expect(await post(body)).toEqual({ status: 400, cache: 'private, no-store', text: '' });
	});

	it('handles only POST: GET and the rest are not answered by this handler', () => {
		expect(Object.keys(endpoint)).toEqual(['POST']);
	});
});
