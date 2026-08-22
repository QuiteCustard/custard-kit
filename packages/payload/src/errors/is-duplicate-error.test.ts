import { describe, expect, it } from 'vitest'
import { isDuplicateError } from './is-duplicate-error.js'

describe('isDuplicateError', () => {
  it('detects the raw driver violation', () => {
    expect(isDuplicateError(new Error('duplicate key value violates unique constraint'))).toBe(true)
    expect(isDuplicateError(new Error('error: 23505'))).toBe(true)
  })

  // Read structurally rather than by field name, so it holds for whichever column is unique.
  it('detects the wrapped ValidationError for any unique field', () => {
    expect(isDuplicateError({ data: { errors: [{ message: 'Value must be unique' }] } })).toBe(true)
    expect(isDuplicateError({ data: { errors: [{ message: 'This must be UNIQUE' }] } })).toBe(true)
    expect(
      isDuplicateError({ data: { errors: [{ message: 'Required' }, { message: 'not unique' }] } }),
    ).toBe(true)
  })

  // Swallowing an unrelated failure as "already exists" would retry forever against a database
  // that is simply down.
  it('lets unrelated failures through so they fail fast', () => {
    expect(isDuplicateError(new Error('connection refused'))).toBe(false)
    expect(isDuplicateError(new Error('permission denied'))).toBe(false)
    expect(isDuplicateError(new Error(''))).toBe(false)
    expect(isDuplicateError({ data: { errors: [{ message: 'Required' }] } })).toBe(false)
  })

  // ValidationError's top-level message names whichever field failed for ANY reason, not only
  // uniqueness - a slug left blank must not be retried as if the slug were already taken.
  it('does not read a non-uniqueness validation message as a duplicate', () => {
    expect(isDuplicateError(new Error('The following field is invalid: slug'))).toBe(false)
  })

  it('handles anything that is not an error at all', () => {
    expect(isDuplicateError(null)).toBe(false)
    expect(isDuplicateError(undefined)).toBe(false)
    expect(isDuplicateError({})).toBe(false)
    expect(isDuplicateError(23505)).toBe(true)
  })

  // A non-Error is stringified and matched, so a driver that rejects with a bare string is still
  // recognised. The cost is that any string SAYING "duplicate key" reads as one - fine for the
  // catch blocks this guards, worth knowing before reaching for it anywhere else.
  it('matches a stringified value, not only an Error instance', () => {
    expect(isDuplicateError('duplicate key value violates unique constraint')).toBe(true)
    expect(isDuplicateError('connection refused')).toBe(false)
  })
})
