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
 * Only a PUBLIC Payload error is surfaced: an `APIError` whose `isPublic` is not `false`. A
 * ValidationError's per-field messages are authored by the project's own hooks for the user, and
 * an APIError carries a message written for API consumers. The field detail is preferred over a
 * ValidationError's top-level message, which is only "The following field is invalid: …".
 *
 * Anything else collapses to the fallback: a DB driver or network failure can leak internals like
 * SQL fragments and constraint names, an APIError marked `isPublic: false` says so itself, and a
 * plain object that merely has a `data.errors` array was not authored by anyone for a user.
 */
export const publicErrorMessage = (err: unknown, fallback: string): string => {
  if (!(err instanceof APIError) || err.isPublic === false) return fallback

  const detail = fieldErrorMessages(err)

  return detail.length > 0 ? detail.join(' ') : err.message
}
