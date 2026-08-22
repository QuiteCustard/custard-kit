import { describe, expect, it } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { sizeField } from './size-field.js'

const optionValues = (field: { options?: unknown }): string[] =>
  Array.isArray(field.options)
    ? field.options.flatMap((option) =>
        isRecord(option) && typeof option.value === 'string' ? [option.value] : [],
      )
    : []

describe('sizeField', () => {
  it('offers the fractional widths and defaults to one-third', () => {
    const field = sizeField()

    expect(field.name).toBe('size')
    expect(optionValues(field)).toEqual(['quarter', 'one-third', 'half', 'two-thirds', 'full'])
    expect(field.defaultValue).toBe('one-third')
    expect(field.required).toBe(true)
  })

  // buildConfig sanitises fields in place, so two collections must never share one object.
  it('returns a new object each call', () => {
    expect(sizeField()).not.toBe(sizeField())
    expect(sizeField().options).not.toBe(sizeField().options)
  })

  it('does not leak a mutation from one caller to the next', () => {
    const first = sizeField()

    first.required = false

    expect(sizeField().required).toBe(true)
  })
})
