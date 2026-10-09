import { format, isBefore, isValid } from 'date-fns'
import type { Locale as DateFnsLocale } from 'date-fns/locale'

/** True for anything `new Date()` can parse. */
export const isValidDate = (value: string | null | undefined): boolean =>
  value != null && isValid(new Date(value))

/**
 * True when the end instant precedes the start - the one ordering rule every date-range form
 * shares. Equal instants are NOT reversed (a zero-length window is legal).
 */
export const dateRangeReversed = (start: string, end: string): boolean =>
  isBefore(new Date(end), new Date(start))

/**
 * The `<input type="datetime-local">` ↔ stored-ISO pair.
 *
 * Not symmetric with `toISOString` alone: the input works in the viewer's WALL CLOCK, so reading a
 * stored instant back has to re-compose the LOCAL parts - `toISOString().slice(0, 16)` would show
 * the time shifted by the viewer's offset. Both directions return the field's empty value rather
 * than throwing, since `new Date('nonsense').toISOString()` is a RangeError.
 *
 * ```ts
 * dateInputToIso('2026-08-21T14:30')   // -> '2026-08-21T13:30:00.000Z' (in UTC+1)
 * isoToDateInput('2026-08-21T13:30:00.000Z')  // -> '2026-08-21T14:30'
 * ```
 */
export const dateInputToIso = (value: string): string | null => {
  if (!value) return null

  const date = new Date(value)

  return isValid(date) ? date.toISOString() : null
}

/**
 * The other direction: a stored ISO instant as the LOCAL `datetime-local` value, so the input shows
 * the wall-clock time the editor typed. Empty string for anything unparseable, which is the field's
 * own empty value.
 */
export const isoToDateInput = (iso: string | null | undefined): string => {
  if (!iso) return ''

  const date = new Date(iso)

  if (!isValid(date)) return ''

  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Locale-aware wrapper over date-fns `format`. Pass the date-fns `Locale` object for the language
 * in scope (e.g. from `date-fns/locale`) so month/weekday tokens (MMM, EEE) render in that
 * language; omit it for date-fns's own default (US English).
 *
 * A `Date` instance reaches `format` unchanged, so a zone-carrying subclass such as `UTCDate` from
 * `@date-fns/utc` or `TZDate` from `@date-fns/tz` renders in its own zone rather than the
 * machine's. Strings and epochs are parsed as `new Date` would.
 *
 * ```ts
 * import { enGB } from 'date-fns/locale'
 * formatDate(new Date(), 'd MMM yyyy', enGB)
 * ```
 */
export const formatDate = (
  date: Date | string | number,
  pattern: string,
  locale?: DateFnsLocale,
): string => format(date, pattern, locale ? { locale } : undefined)
