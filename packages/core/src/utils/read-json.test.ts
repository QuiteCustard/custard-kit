import { describe, expect, it } from 'vitest'
import { field, filled, finite, list } from './read-json.js'

describe('field', () => {
  it("reads an object's property", () => {
    expect(field({ a: 1 }, 'a')).toBe(1)
    expect(field({ a: 1 }, 'b')).toBeUndefined()
  })

  it('reads nothing from a value that is not an object', () => {
    expect(field(null, 'a')).toBeUndefined()
    expect(field('text', 'length')).toBeUndefined()
    expect(field(undefined, 'a')).toBeUndefined()
  })

  it('reads through nested calls without a guard between them', () => {
    expect(field(field({ team: { name: 'Northgate' } }, 'team'), 'name')).toBe('Northgate')
    expect(field(field({ team: null }, 'team'), 'name')).toBeUndefined()
  })
})

describe('list', () => {
  it('passes an array through and replaces anything else with an empty one', () => {
    expect(list([1, 2])).toEqual([1, 2])
    expect(list({ 0: 'a', length: 1 })).toEqual([])
    expect(list(null)).toEqual([])
  })
})

describe('finite', () => {
  it('accepts real numbers only', () => {
    expect(finite(0)).toBe(true)
    expect(finite(-1.5)).toBe(true)
    expect(finite(Number.NaN)).toBe(false)
    expect(finite(Number.POSITIVE_INFINITY)).toBe(false)
    expect(finite('1')).toBe(false)
  })
})

describe('filled', () => {
  it('keeps a non-empty string and gives null otherwise', () => {
    expect(filled('a')).toBe('a')
    expect(filled('')).toBeNull()
    expect(filled(1)).toBeNull()
  })
})
