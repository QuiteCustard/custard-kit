import { describe, expect, it } from 'vitest'
import { rgbToHex } from './rgb-to-hex.js'

describe('rgbToHex', () => {
  it('converts and pads each channel', () => {
    expect(rgbToHex('rgb(255, 0, 128)')).toBe('#ff0080')
    expect(rgbToHex('rgb(0,0,0)')).toBe('#000000')
    expect(rgbToHex('rgb(255 255 255)')).toBe('#ffffff')
  })

  it('scales percentages', () => {
    expect(rgbToHex('rgb(100%, 0%, 50%)')).toBe('#ff0080')
    expect(rgbToHex('rgb(100%, 100%, 100%)')).toBe('#ffffff')
  })

  // An unclamped channel would render as more than two hex digits and corrupt the whole string.
  it('clamps out-of-range channels the way a browser does', () => {
    expect(rgbToHex('rgb(300, 0, 0)')).toBe('#ff0000')
    expect(rgbToHex('rgb(-20, 0, 0)')).toBe('#000000')
    expect(rgbToHex('rgb(999%, 0, 0)')).toBe('#ff0000')
  })

  it('rounds a fractional channel', () => {
    expect(rgbToHex('rgb(0.4, 0.6, 127.5)')).toBe('#000180')
  })

  it('ignores a trailing alpha, so the result is always six digits', () => {
    expect(rgbToHex('rgba(255, 0, 128, 0.5)')).toBe('#ff0080')
    expect(rgbToHex('rgb(255 0 128 / 50%)')).toBe('#ff0080')
  })

  it('returns null when three channels cannot be read', () => {
    expect(rgbToHex('not a colour')).toBeNull()
    expect(rgbToHex('rgb(1, 2)')).toBeNull()
    expect(rgbToHex('')).toBeNull()
    expect(rgbToHex('#ff0080')).toBeNull()
  })
})
