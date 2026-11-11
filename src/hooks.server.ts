import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { applyMigrations } from '#lib/server/db/migrate.ts';
import { htmlLang } from '#lib/i18n/locale-switch.ts';

/** Runs once before the server handles its first request. */
export const init: ServerInit = () => {
	applyMigrations();
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
