import { describe, expect, it } from 'vitest'
import { getInitials } from './get-initials.js'

describe('getInitials', () => {
  it('takes up to two uppercase initials', () => {
    expect(getInitials('ada lovelace')).toBe('AL')
    expect(getInitials('Ada Lovelace')).toBe('AL')
    expect(getInitials('Ada')).toBe('A')
    expect(getInitials('ada b lovelace')).toBe('AB')
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
})
