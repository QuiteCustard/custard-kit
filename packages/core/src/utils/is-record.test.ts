import { describe, expect, it } from 'vitest'
import { isPlainObject, isRecord } from './is-record.js'

describe('isRecord', () => {
  it('accepts indexable objects', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord({})).toBe(true)
    expect(isRecord([])).toBe(true)
    expect(isRecord(new Date())).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
  })

  // typeof null is 'object', which is the whole reason the null check is not optional.
  it('rejects null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('rejects primitives and functions', () => {
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(7)).toBe(false)
    expect(isRecord(false)).toBe(false)
    expect(isRecord(() => 1)).toBe(false)
  })
})

describe('isPlainObject', () => {
  it('is isRecord minus arrays', () => {
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject([{ a: 1 }])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('x')).toBe(false)
  })
})
