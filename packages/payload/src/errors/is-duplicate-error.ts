import { fieldErrorMessages } from './field-errors.js'

/**
 * Detects Postgres unique constraint violations (code 23505) caused by concurrent writes.
 * Only these warrant a recovery lookup - other errors (network, permissions, etc.) should fail fast.
 *
 * Payload surfaces the violation in two shapes: the raw driver error during a concurrent INSERT
 * race, or a wrapped `ValidationError` whose field error reads "Value must be unique" when its
 * pre-insert check catches an already-committed row. The ValidationError is detected structurally
 * so every unique field is covered, not only one hardcoded field name.
 *
 * `ValidationError`'s top-level message ("The following field is invalid: <field>") names whichever
 * field failed for ANY reason, not only uniqueness - matching on it here would misclassify an
 * unrelated failure (a required field left blank, say) as a duplicate.
 */
export const isDuplicateError = (e: unknown): boolean => {
  if (fieldErrorMessages(e).some((message) => message.toLowerCase().includes('unique'))) return true

  const message = e instanceof Error ? e.message : String(e)
  return (
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('23505')
  )
}
