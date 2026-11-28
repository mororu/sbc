// Setting read queries. Selects only the columns the caller needs.
import { eq } from 'drizzle-orm';
import type { KeyboxSettings } from '#lib/domain/index.ts';
import { getDb, type Db } from '../index.ts';
import { setting } from '../schema.ts';

const trimmedOrNull = (value: string | null | undefined): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

/** The admin contact address shown in the guest footer, or null when none is set. */
export function getAdminContact(db: Db = getDb()): string | null {
	const row = db.select({ adminContact: setting.adminContact }).from(setting).where(eq(setting.id, 1)).get();
	return trimmedOrNull(row?.adminContact);
}

/**
 * The keybox code and the instructions per locale, each trimmed, or null when unset or blank.
 * For the worker and the admin pages (the old-code tag, Story 3.2): the code never reaches a guest
 * page or a log line.
 */
export function getKeyboxSettings(db: Db = getDb()): KeyboxSettings {
	const row = db
		.select({
			code: setting.keyboxCode,
			de: setting.keyboxInstructionsDe,
			en: setting.keyboxInstructionsEn
		})
		.from(setting)
		.where(eq(setting.id, 1))
		.get();
	return {
		code: trimmedOrNull(row?.code),
		instructions: { de: trimmedOrNull(row?.de), en: trimmedOrNull(row?.en) }
	};
}
