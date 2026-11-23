import { describe, expect, it } from 'vitest'
import { base64urlToBytes, bytesToBase64url } from './base64url.js'

describe('bytesToBase64url and base64urlToBytes', () => {
  it('round-trip every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)

    expect(base64urlToBytes(bytesToBase64url(bytes))).toEqual(bytes)
  })

  // 0xfb 0xff encodes to `+/8=` in plain base64: all three characters a URL mangles.
  it('use url-safe characters and drop the padding', () => {
    expect(bytesToBase64url(Uint8Array.from([0xfb, 0xff]))).toBe('-_8')
  })

  it('read text with or without padding at every length', () => {
    for (const length of [0, 1, 2, 3, 4]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i + 200)

      expect(base64urlToBytes(bytesToBase64url(bytes))).toEqual(bytes)
    }
  })

  // Plain base64's `+` and `/`, and padding, are refused rather than read as something else.
  it('refuse anything that is not base64url', () => {
    expect(base64urlToBytes('+/8=')).toBeNull()
    expect(base64urlToBytes('ab cd')).toBeNull()
    expect(base64urlToBytes('a')).toBeNull()
  })
})
