// Setting read queries for guest pages. Selects only the column the caller needs.
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '../index.ts';
import { setting } from '../schema.ts';

/** The admin contact address shown in the guest footer, or null when none is set. */
export function getAdminContact(db: Db = getDb()): string | null {
	const row = db.select({ adminContact: setting.adminContact }).from(setting).where(eq(setting.id, 1)).get();
	const value = row?.adminContact?.trim();
	return value ? value : null;
}
