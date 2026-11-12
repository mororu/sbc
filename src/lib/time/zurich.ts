// Europe/Zurich wall-clock time (AD-9). The only module that converts between instants and local
// dates or clock times. Pure: never reads the clock; `now` is always a parameter.
// Server-only in practice: client code must not import it (it would ship Temporal to the browser).

/** A UTC instant as ISO 8601 text with seconds and `Z`, e.g. `2027-01-12T17:00:00Z`. */
export type Instant = string;
/** A Zurich calendar date, `yyyy-mm-dd`. */
export type LocalDate = string;
export type Locale = 'de' | 'en';

const ZONE = 'Europe/Zurich';
const MINUTES_PER_DAY = 24 * 60;

function instantOf(value: Instant): Temporal.Instant {
	return Temporal.Instant.from(value);
}

function text(instant: Temporal.Instant): Instant {
	return instant.toString({ smallestUnit: 'second' });
}

function zoned(value: Instant): Temporal.ZonedDateTime {
	return instantOf(value).toZonedDateTimeISO(ZONE);
}

/** True for a real calendar date written as `yyyy-mm-dd`. */
export function isValidDate(value: string): value is LocalDate {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	try {
		Temporal.PlainDate.from(value, { overflow: 'reject' });
		return true;
	} catch {
		return false;
	}
}

/**
 * The instant of a Zurich wall-clock time: `minuteOfDay` minutes after local midnight of `date`
 * (1440 is the next midnight). A time skipped by the spring switch resolves to the later offset.
 */
export function toInstant(date: LocalDate, minuteOfDay: number): Instant {
	const day = Temporal.PlainDate.from(date).add({ days: Math.floor(minuteOfDay / MINUTES_PER_DAY) });
	const minute = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
	const local = day.toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 });
	return text(local.toZonedDateTime(ZONE, { disambiguation: 'compatible' }).toInstant());
}

/** The Zurich calendar date of an instant. */
export function localDate(value: Instant): LocalDate {
	return zoned(value).toPlainDate().toString();
}

/** Minutes after local midnight in Zurich (0–1439). */
export function localMinuteOfDay(value: Instant): number {
	const z = zoned(value);
	return z.hour * 60 + z.minute;
}

export function addMinutes(value: Instant, minutes: number): Instant {
	return text(instantOf(value).add({ minutes }));
}

/** Real elapsed minutes from `a` to `b` (negative if `b` is earlier). */
export function minutesBetween(a: Instant, b: Instant): number {
	return (instantOf(b).epochMilliseconds - instantOf(a).epochMilliseconds) / 60_000;
}

/** Orders instants: negative if `a` is earlier, 0 if equal, positive if later. */
export function compareInstants(a: Instant, b: Instant): number {
	return Temporal.Instant.compare(instantOf(a), instantOf(b));
}

/** Calendar-day arithmetic on Zurich dates. */
export function addDays(date: LocalDate, days: number): LocalDate {
	return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function compareDates(a: LocalDate, b: LocalDate): number {
	return Temporal.PlainDate.compare(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b));
}

/** Today's Zurich date at `now`. */
export function today(now: Instant): LocalDate {
	return localDate(now);
}

/** The last day guests can book: the horizon is counted in calendar days (26 Dec + 14 = 9 Jan). */
export function lastBookableDay(now: Instant, horizonDays: number): LocalDate {
	return addDays(today(now), horizonDays);
}

/** Hours in a Zurich day: 23 on the spring switch, 25 on the autumn switch, else 24. */
export function hoursInDay(date: LocalDate): number {
	return Temporal.PlainDate.from(date).toZonedDateTime(ZONE).hoursInDay;
}

const INTL_LOCALE: Record<Locale, string> = { de: 'de-CH', en: 'en-GB' };

function dateParts(date: LocalDate, locale: Locale, weekday: 'long' | 'short') {
	const noon = toInstant(date, 12 * 60);
	const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
		weekday,
		day: 'numeric',
		month: 'long',
		timeZone: ZONE
	}).formatToParts(instantOf(noon).epochMilliseconds);
	const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return { weekday: part('weekday').replace(/\.$/, ''), day: part('day'), month: part('month') };
}

/** "Dienstag, 12. Januar" / "Tuesday, 12 January". */
export function formatDateLong(date: LocalDate, locale: Locale): string {
	const { weekday, day, month } = dateParts(date, locale, 'long');
	return locale === 'de' ? `${weekday}, ${day}. ${month}` : `${weekday}, ${day} ${month}`;
}

/** "Di 12. Januar" / "Tue 12 January". */
export function formatDateShort(date: LocalDate, locale: Locale): string {
	const { weekday, day, month } = dateParts(date, locale, 'short');
	return locale === 'de' ? `${weekday} ${day}. ${month}` : `${weekday} ${day} ${month}`;
}

/** "12. Januar" / "12 January": the date heading without the weekday. */
export function formatDayMonth(date: LocalDate, locale: Locale): string {
	const { day, month } = dateParts(date, locale, 'long');
	return locale === 'de' ? `${day}. ${month}` : `${day} ${month}`;
}

/** "Dienstag" / "Tuesday": the date heading's eyebrow. */
export function formatWeekday(date: LocalDate, locale: Locale): string {
	return dateParts(date, locale, 'long').weekday;
}

/** "Di, 12. Januar" / "Tue, 12 January": the day view's `<title>`. */
export function formatDateTitle(date: LocalDate, locale: Locale): string {
	const { weekday, day, month } = dateParts(date, locale, 'short');
	return locale === 'de' ? `${weekday}, ${day}. ${month}` : `${weekday}, ${day} ${month}`;
}

/** Zurich clock time "18:15" (24-hour, both languages). */
export function formatTime(value: Instant): string {
	const z = zoned(value);
	return `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
}
