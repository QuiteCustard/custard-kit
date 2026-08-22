import { isRecord } from '@quitecustard/core/utils/is-record'

/**
 * The per-field messages inside a Payload `ValidationError`, or an empty array for any other error.
 *
 * ```ts
 * const detail = fieldErrorMessages(err).join(' ')
 * ```
 *
 * Read structurally rather than by instanceof: the same shape arrives wrapped by the local API, by
 * a REST response and by a driver error Payload re-threw, and only the payload is dependable.
 */
export const fieldErrorMessages = (err: unknown): string[] => {
  if (!isRecord(err) || !isRecord(err.data) || !Array.isArray(err.data.errors)) return []

  return err.data.errors.flatMap((entry) =>
    isRecord(entry) && typeof entry.message === 'string' && entry.message ? [entry.message] : [],
  )
}
