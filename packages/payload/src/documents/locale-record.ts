import { isRecord } from '@quitecustard/core/utils/is-record'
import { oneOf } from '@quitecustard/core/utils/one-of'

/**
 * Flattens a `locale: 'all'` read of a localised field - which arrives as a record keyed by locale
 * even though Payload's generated types still describe it in its single-locale shape - into
 * `Partial<Record<L, string>>`. Unknown keys and non-string values are dropped, and an empty
 * string is treated as absent: Payload stores `''` for a cleared field, and a caller asking "which
 * locales have text" wants that to read as no.
 *
 * ```ts
 * localeRecord(doc.title, ['en', 'fr', 'es'] as const)
 * ```
 */
export const localeRecord = <L extends string>(
  value: unknown,
  knownLocales: readonly L[],
): Partial<Record<L, string>> => {
  if (!isRecord(value)) return {}

  const isKnownLocale = oneOf(knownLocales)
  const record: Partial<Record<L, string>> = {}

  for (const [key, text] of Object.entries(value)) {
    if (isKnownLocale(key) && typeof text === 'string' && text !== '') record[key] = text
  }

  return record
}
