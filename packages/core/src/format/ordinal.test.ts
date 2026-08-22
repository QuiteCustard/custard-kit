import { describe, expect, it } from 'vitest'
import { ordinal, ordinalSuffix } from './ordinal.js'

describe('ordinal', () => {
  it('suffixes the regular cases', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(0)).toBe('0th')
  })

  // 11/12/13 are the trap: they end in 1/2/3 but take "th", and every naive last-digit rule gets
  // them wrong.
  it('handles the teens, which are all th', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(14)).toBe('14th')
  })

  it('handles the twenties and beyond', () => {
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(101)).toBe('101st')
    expect(ordinal(112)).toBe('112th')
  })

  // The teen rule repeats every century, so 111 is "th" while 121 is "st".
  it('re-applies the teen rule in every hundred', () => {
    expect(ordinal(111)).toBe('111th')
    expect(ordinal(113)).toBe('113th')
    expect(ordinal(121)).toBe('121st')
    expect(ordinal(1011)).toBe('1011th')
  })
})

describe('ordinalSuffix', () => {
  it('exposes the suffix alone, for rendering it separately', () => {
    expect(ordinalSuffix(1)).toBe('st')
    expect(ordinalSuffix(2)).toBe('nd')
    expect(ordinalSuffix(3)).toBe('rd')
    expect(ordinalSuffix(4)).toBe('th')
    expect(ordinalSuffix(11)).toBe('th')
  })

  it('always returns one of the four suffixes', () => {
    for (let n = 0; n <= 200; n++) expect(['st', 'nd', 'rd', 'th']).toContain(ordinalSuffix(n))
  })
})
