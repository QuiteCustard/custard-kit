import { describe, expect, it } from 'vitest'
import { APIError } from 'payload'
import { publicErrorMessage } from './public-error.js'

describe('publicErrorMessage', () => {
  it('prefers the per-field detail, which the project authored for the user', () => {
    const err = { data: { errors: [{ message: 'Name is already taken' }] } }

    expect(publicErrorMessage(err, 'fallback')).toBe('Name is already taken')
  })

  // The top-level message of a ValidationError is only "The following field is invalid: …", which
  // tells the user nothing they can act on.
  it('joins several field messages rather than picking one', () => {
    const err = { data: { errors: [{ message: 'Name taken' }, { message: 'Slug required' }] } }

    expect(publicErrorMessage(err, 'fallback')).toBe('Name taken Slug required')
  })

  it('falls back to an APIError’s own message, which is written for API consumers', () => {
    expect(publicErrorMessage(new APIError('Cannot delete a published page'), 'fallback')).toBe(
      'Cannot delete a published page',
    )
  })

  // A driver or network failure can carry SQL fragments and constraint names, so anything that is
  // not one of Payload's own errors collapses rather than reaching the user.
  it('collapses anything else to the fallback', () => {
    expect(publicErrorMessage(new Error('relation "users_sessions" does not exist'), 'Oops')).toBe(
      'Oops',
    )
    expect(publicErrorMessage('ECONNREFUSED 127.0.0.1:5432', 'Oops')).toBe('Oops')
    expect(publicErrorMessage(null, 'Oops')).toBe('Oops')
    expect(publicErrorMessage(undefined, 'Oops')).toBe('Oops')
    expect(publicErrorMessage({ data: { errors: [] } }, 'Oops')).toBe('Oops')
  })
})
