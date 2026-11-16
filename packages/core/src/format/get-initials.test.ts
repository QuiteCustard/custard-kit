import { describe, expect, it } from 'vitest'
import { getInitials } from './get-initials.js'

describe('getInitials', () => {
  it('takes up to two uppercase initials', () => {
    expect(getInitials('ada lovelace')).toBe('AL')
    expect(getInitials('Ada Lovelace')).toBe('AL')
    expect(getInitials('Ada')).toBe('A')
    expect(getInitials('ada b lovelace')).toBe('AB')
  })

  it('stops at one initial when asked', () => {
    expect(getInitials('ada lovelace', 1)).toBe('A')
    expect(getInitials('ada', 1)).toBe('A')
    expect(getInitials('ada lovelace', 2)).toBe('AL')
    expect(getInitials(null, 1)).toBe('')
  })

  // A row whose name is null arrives as undefined however the caller typed it, and a throwing
  // helper turns one bad record into a failed page.
  it('is total, so a missing name yields an empty string', () => {
    expect(getInitials(null)).toBe('')
    expect(getInitials(undefined)).toBe('')
    expect(getInitials('')).toBe('')
    expect(getInitials('   ')).toBe('')
  })

  it('handles non-Latin and emoji initials without cutting a character in half', () => {
    expect(getInitials('Ада Лавлейс')).toBe('АЛ')
    expect(getInitials('ünïcode näme')).toBe('ÜN')
  })

  // The trap: indexing a string reads UTF-16 units, so the first "character" of an astral one is
  // half a surrogate pair. A server render serialises that half as U+FFFD and the client does not,
  // which surfaces as a hydration mismatch.
  it('keeps an astral leading character whole', () => {
    const boldA = String.fromCodePoint(0x1d400)
    const boldB = String.fromCodePoint(0x1d401)
    const rocket = String.fromCodePoint(0x1f680)

    expect(getInitials(`${boldA}da ${boldB}yron`)).toBe(`${boldA}${boldB}`)
    expect(getInitials(`${rocket} crew`)).toBe(`${rocket}C`)
    expect(getInitials(`${rocket} crew`, 1)).toBe(rocket)
    expect(getInitials(`${boldA}da`).isWellFormed()).toBe(true)
  })
})
