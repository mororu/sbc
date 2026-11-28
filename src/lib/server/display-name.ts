// The guest's full name as a heading or row text in the admin views (Story 3.9, retro D5): the day
// rows and the detail, the admin home, the call list and the reply reminders, with one fallback for
// a name that is erased (null) or blank. The delete dialog keeps its own no-name sentence, and the
// first-name helpers (`firstName`) are separate.
import { m } from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/time/index.ts';

/** The trimmed name, or "(ohne Name)" / "(no name)" when it is null or blank. */
export function displayName(name: string | null | undefined, locale: Locale): string {
	return name?.trim() || m.admin_no_name({}, { locale });
}
