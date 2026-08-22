import { describe, expect, it } from 'vitest'
import { fieldErrorMessages } from './field-errors.js'

describe('fieldErrorMessages', () => {
  it('reads the per-field messages out of a ValidationError shape', () => {
    const err = { data: { errors: [{ message: 'Value must be unique' }, { message: 'Required' }] } }

    expect(fieldErrorMessages(err)).toEqual(['Value must be unique', 'Required'])
  })

  it('skips entries with no usable message', () => {
    const err = { data: { errors: [{ message: 'Kept' }, {}, { message: '' }, null, 'nope'] } }

    expect(fieldErrorMessages(err)).toEqual(['Kept'])
  })

  it('returns nothing for any other error', () => {
    expect(fieldErrorMessages(new Error('boom'))).toEqual([])
    expect(fieldErrorMessages({ data: {} })).toEqual([])
    expect(fieldErrorMessages({ data: { errors: 'not an array' } })).toEqual([])
    expect(fieldErrorMessages({ errors: [{ message: 'x' }] })).toEqual([])
    expect(fieldErrorMessages(null)).toEqual([])
    expect(fieldErrorMessages(undefined)).toEqual([])
    expect(fieldErrorMessages('string')).toEqual([])
  })

  it('is empty rather than undefined for an empty error list', () => {
    expect(fieldErrorMessages({ data: { errors: [] } })).toEqual([])
  })
})
