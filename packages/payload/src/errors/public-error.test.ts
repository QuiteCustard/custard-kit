import { describe, expect, it } from 'vitest'
import { APIError } from 'payload'
import { publicErrorMessage } from './public-error.js'

const fieldErrors = (...messages: string[]) => ({
  errors: messages.map((message) => ({ message })),
})

describe('publicErrorMessage', () => {
  it('prefers the per-field detail, which the project authored for the user', () => {
    const err = new APIError(
      'The following field is invalid: name',
      400,
      fieldErrors('Name is already taken'),
    )

    expect(publicErrorMessage(err, 'fallback')).toBe('Name is already taken')
  })

  // The top-level message of a ValidationError is only "The following field is invalid: …", which
  // tells the user nothing they can act on.
  it('joins several field messages rather than picking one', () => {
    const err = new APIError(
      'The following fields are invalid: name, slug',
      400,
      fieldErrors('Name taken', 'Slug required'),
    )

    expect(publicErrorMessage(err, 'fallback')).toBe('Name taken Slug required')
  })

  it('falls back to a public APIError’s own message, which is written for API consumers', () => {
    expect(
      publicErrorMessage(new APIError('Cannot delete a published page', 409), 'fallback'),
    ).toBe('Cannot delete a published page')
  })

  // The trap: Payload marks an APIError non-public when it is told to, and by default whenever the
  // status is 500. Its message - and any field detail riding on it - was not written for a user.
  it('collapses an APIError that is not public', () => {
    expect(
      publicErrorMessage(new APIError('private provider detail', 400, null, false), 'Oops'),
    ).toBe('Oops')

    expect(
      publicErrorMessage(
        new APIError('private', 500, fieldErrors('constraint users_email_idx'), false),
        'Oops',
      ),
    ).toBe('Oops')

    expect(publicErrorMessage(new APIError('Something went wrong'), 'Oops')).toBe('Oops')
  })

  // The trap: reading `data.errors` structurally would surface text from any object that happens
  // to carry that shape - a driver error, a parsed upstream response - as if a hook had authored it.
  it('does not read field detail off something that is not an APIError', () => {
    expect(publicErrorMessage(fieldErrors('relation "users" does not exist'), 'Oops')).toBe('Oops')
    expect(publicErrorMessage({ data: fieldErrors('internal detail') }, 'Oops')).toBe('Oops')
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
  })
})
