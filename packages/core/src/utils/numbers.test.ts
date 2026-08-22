import { describe, expect, it } from 'vitest'
import { isFiniteNumber, isWholeNumber, parseOptionalInt } from './numbers.js'

const range = { min: 1, max: 10 }

describe('isWholeNumber', () => {
  it('checks integer-ness and range together', () => {
    expect(isWholeNumber(5, range)).toBe(true)
    expect(isWholeNumber(5.5, range)).toBe(false)
    expect(isWholeNumber(0, range)).toBe(false)
    expect(isWholeNumber(11, range)).toBe(false)
  })

  it('treats the bounds as inclusive', () => {
    expect(isWholeNumber(1, range)).toBe(true)
    expect(isWholeNumber(10, range)).toBe(true)
  })

  it('refuses NaN and the infinities', () => {
    expect(isWholeNumber(Number.NaN, range)).toBe(false)
    expect(isWholeNumber(Number.POSITIVE_INFINITY, range)).toBe(false)
    expect(isWholeNumber(Number.NEGATIVE_INFINITY, range)).toBe(false)
  })

  // Where the explicit check earns its place. Inside a bounded range a plain `>= min && <= max`
  // already rejects both - every comparison against NaN is false, and Infinity fails the upper
  // bound. Open the range and that stops being true: `Infinity <= Infinity` passes.
  it('still refuses them when the range cannot exclude them', () => {
    const unbounded = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }

    expect(isWholeNumber(Number.POSITIVE_INFINITY, unbounded)).toBe(false)
    expect(isWholeNumber(Number.NaN, unbounded)).toBe(false)
    expect(isWholeNumber(7, unbounded)).toBe(true)
  })
})

describe('isFiniteNumber', () => {
  it('allows decimals where integer-ness is not the rule', () => {
    expect(isFiniteNumber(5.5, range)).toBe(true)
    expect(isFiniteNumber(1, range)).toBe(true)
    expect(isFiniteNumber(10.0001, range)).toBe(false)
  })

  it('refuses NaN and the infinities', () => {
    expect(isFiniteNumber(Number.NaN, range)).toBe(false)
    expect(isFiniteNumber(Number.POSITIVE_INFINITY, range)).toBe(false)
  })

  // `Number.isFinite` is the whole guard here: an open range cannot reject an infinity by
  // comparison, so without it "any finite number" would happily accept one.
  it('still refuses them when the range cannot exclude them', () => {
    const unbounded = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }

    expect(isFiniteNumber(Number.POSITIVE_INFINITY, unbounded)).toBe(false)
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY, unbounded)).toBe(false)
    expect(isFiniteNumber(Number.NaN, unbounded)).toBe(false)
    expect(isFiniteNumber(7.5, unbounded)).toBe(true)
  })
})

describe('parseOptionalInt', () => {
  // Number('') is 0, so coercing directly would snap a field being retyped to zero mid-keystroke.
  it('reads an empty input as null rather than zero', () => {
    expect(parseOptionalInt('')).toBeNull()
    expect(parseOptionalInt('   ')).toBeNull()
  })

  it('parses an integer', () => {
    expect(parseOptionalInt('7')).toBe(7)
    expect(parseOptionalInt(' 7 ')).toBe(7)
    expect(parseOptionalInt('-7')).toBe(-7)
    expect(parseOptionalInt('0')).toBe(0)
  })

  it('refuses anything that is not a whole number', () => {
    expect(parseOptionalInt('7.5')).toBeNull()
    expect(parseOptionalInt('abc')).toBeNull()
    expect(parseOptionalInt('7abc')).toBeNull()
    expect(parseOptionalInt('Infinity')).toBeNull()
  })
})
