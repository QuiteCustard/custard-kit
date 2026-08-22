import { describe, expect, it } from 'vitest'
import { oneOf } from './one-of.js'

describe('oneOf', () => {
  const isColour = oneOf(['red', 'green'] as const)

  it('narrows a member of the union', () => {
    expect(isColour('red')).toBe(true)
    expect(isColour('green')).toBe(true)
    expect(isColour('blue')).toBe(false)
  })

  it('refuses non-strings without throwing', () => {
    expect(isColour(null)).toBe(false)
    expect(isColour(undefined)).toBe(false)
    expect(isColour(7)).toBe(false)
    expect(isColour({})).toBe(false)
    expect(isColour(['red'])).toBe(false)
  })

  it('is case-sensitive and exact', () => {
    expect(isColour('Red')).toBe(false)
    expect(isColour('red ')).toBe(false)
    expect(isColour('')).toBe(false)
  })

  it('refuses everything when given no members', () => {
    expect(oneOf([])('anything')).toBe(false)
  })
})
