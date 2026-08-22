import { describe, expect, it } from 'vitest'
import { safeEqual } from './safe-equal.js'

describe('safeEqual', () => {
  it('compares equal secrets', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
    expect(safeEqual('', '')).toBe(true)
  })

  it('refuses a different value of the same length', () => {
    expect(safeEqual('secret', 'wrong!')).toBe(false)
    expect(safeEqual('a', 'b')).toBe(false)
  })

  // Node's timingSafeEqual THROWS on unequal lengths. Without the guard a short candidate would
  // crash the request handler instead of failing the check.
  it('refuses unequal lengths without throwing', () => {
    expect(safeEqual('secret', 'secrets')).toBe(false)
    expect(safeEqual('secret', '')).toBe(false)
    expect(safeEqual('', 'secret')).toBe(false)
  })

  // Compared as bytes, so a multi-byte character is not truncated into a false match.
  it('compares by byte, not by UTF-16 unit', () => {
    expect(safeEqual('é', 'é')).toBe(true)
    expect(safeEqual('é', 'e')).toBe(false)
    expect(safeEqual('😀', '😀')).toBe(true)
  })
})
