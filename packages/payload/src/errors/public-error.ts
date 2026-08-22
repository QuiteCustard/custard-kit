import { APIError } from 'payload'
import { fieldErrorMessages } from './field-errors.js'

/**
 * A message safe to show a user after a failed write, or `fallback` when the error isn't one of
 * Payload's own.
 *
 * ```ts
 * catch (err) {
 *   return { error: publicErrorMessage(err, 'Could not save your changes') }
 * }
 * ```
 *
 * Payload's errors are safe to surface: a ValidationError's per-field messages are authored by the
 * project's own hooks for the user, and an APIError carries a message written for API consumers.
 * The field detail is preferred over a ValidationError's top-level message, which is only "The
 * following field is invalid: …". Anything else - a DB driver or network failure - can leak
 * internals like SQL fragments and constraint names, so it collapses to the fallback.
 */
export const publicErrorMessage = (err: unknown, fallback: string): string => {
  const detail = fieldErrorMessages(err)

  if (detail.length > 0) return detail.join(' ')
  if (err instanceof APIError) return err.message

  return fallback
}
