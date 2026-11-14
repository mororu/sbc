import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { htmlLang } from '#lib/i18n/locale-switch.ts';
import { startWorker } from '#lib/server/worker/index.ts';

/** Runs once before the server handles its first request: migrate, then start the outbox worker. */
export const init: ServerInit = () => {
	applyMigrations();
	if (!building) startWorker();
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', htmlLang(locale))
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

export const handle: Handle = handleParaglide;
