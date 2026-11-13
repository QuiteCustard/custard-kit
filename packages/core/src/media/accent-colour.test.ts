import { describe, expect, it } from 'vitest'
import { formatRgb, parseRgb, pickAccentColour, rgbToHex, type Rgb } from './accent-colour.js'

const rgb = (...values: number[]) => new Uint8Array(values)

describe('pickAccentColour', () => {
  it('prefers a saturated mid-light pixel over a pale one', () => {
    // near-white, then a mid red
    const pixels = rgb(250, 248, 245, 200, 40, 40)
    expect(pickAccentColour(pixels, 3)).toEqual({ r: 200, g: 40, b: 40 })
  })

  it('penalises near-black as well as near-white', () => {
    // a very dark saturated blue, then a mid saturated blue of the same hue
    const pixels = rgb(0, 0, 40, 40, 80, 200)
    expect(pickAccentColour(pixels, 3)).toEqual({ r: 40, g: 80, b: 200 })
  })

  it('ignores fully transparent pixels, which can still carry colour', () => {
    // a saturated magenta behind zero alpha, then an opaque mid green
    const pixels = rgb(255, 0, 255, 0, 60, 160, 90, 255)
    expect(pickAccentColour(pixels, 4)).toEqual({ r: 60, g: 160, b: 90 })
  })

  it('counts a transparent pixel when the caller allows it', () => {
    const pixels = rgb(255, 0, 255, 0, 60, 160, 90, 255)
    expect(pickAccentColour(pixels, 4, { maxTransparentAlpha: -1 })).toEqual({
      r: 255,
      g: 0,
      b: 255,
    })
  })

  it('returns a grey for a grey image rather than inventing a colour', () => {
    const pixels = rgb(120, 120, 120, 90, 90, 90)
    expect(pickAccentColour(pixels, 3)).toEqual({ r: 120, g: 120, b: 120 })
  })

  it('is null when there is no complete pixel', () => {
    expect(pickAccentColour(rgb(), 3)).toBeNull()
    expect(pickAccentColour(rgb(255, 0), 3)).toBeNull()
  })

  it('ignores a trailing partial pixel', () => {
    const pixels = rgb(200, 40, 40, 250, 250)
    expect(pickAccentColour(pixels, 3)).toEqual({ r: 200, g: 40, b: 40 })
  })

  it('moves the pick when the target lightness moves', () => {
    const pixels = rgb(255, 170, 170, 140, 0, 0)
    expect(pickAccentColour(pixels, 3, { targetLightness: 0.85 })).toEqual({
      r: 255,
      g: 170,
      b: 170,
    })
  })
})

describe('formatting', () => {
  const colour: Rgb = { r: 31, g: 41, b: 55 }

  it('formats and parses the same string', () => {
    expect(formatRgb(colour)).toBe('rgb(31, 41, 55)')
    expect(parseRgb(formatRgb(colour))).toEqual(colour)
  })

  it('pads every hex channel to two digits', () => {
    expect(rgbToHex({ r: 0, g: 10, b: 255 })).toBe('#000aff')
    expect(rgbToHex(colour)).toBe('#1f2937')
  })

  it('is null for a string without three numbers', () => {
    expect(parseRgb('rgb(31, 41)')).toBeNull()
    expect(parseRgb('rebeccapurple')).toBeNull()
  })
})
