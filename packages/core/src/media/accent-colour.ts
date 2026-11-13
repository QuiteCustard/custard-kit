// The colour a page, card or OG image borrows from a logo or hero image. It is NOT a dominant or
// modal colour, despite the name it carried where this came from (`dominantColour` on teams and
// users in rme-website): averaging or bucketing the pixels of a crest returns mud, because most of
// a crest is background. This picks the single most saturated pixel nearest mid-lightness, which is
// what reads as the brand's colour.
//
// Decoding is deliberately NOT here. The caller passes raw pixel bytes - from sharp's `.raw()`, a
// canvas `ImageData`, or a worker - so this package stays free of a native image dependency and
// runs in any runtime. Caching is the caller's too: this is a pure function over bytes.

/** A colour as 8-bit channels. */
export type Rgb = { r: number; g: number; b: number }

/** Channels per pixel in the buffer: 3 for RGB, 4 for RGBA. */
export type PixelChannels = 3 | 4

export type AccentColourOptions = {
  /**
   * The lightness the score is centred on, 0-1. The default keeps the pick off white and off
   * black, which is what makes the result usable as a foreground or a band.
   */
  targetLightness?: number
  /**
   * Alpha at or below this (0-255) counts as no colour at all. Only read when `channels` is 4.
   * Transparent pixels can still carry saturated RGB in unassociated-alpha buffers, so without
   * this a fully transparent corner can win.
   */
  maxTransparentAlpha?: number
}

/**
 * The most saturated pixel near mid-lightness, or null when the buffer holds no complete pixel.
 *
 * A grey image returns a grey: every pixel scores zero and the first one wins, which is faithful to
 * the original and better than inventing a colour.
 */
export const pickAccentColour = (
  pixels: ArrayLike<number>,
  channels: PixelChannels,
  options: AccentColourOptions = {},
): Rgb | null => {
  const { targetLightness = 0.45, maxTransparentAlpha = 0 } = options
  if (pixels.length < channels) return null

  let best: Rgb | null = null
  let bestScore = -1

  for (let i = 0; i + channels <= pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] <= maxTransparentAlpha) continue

    const r = pixels[i] / 255
    const g = pixels[i + 1] / 255
    const b = pixels[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const saturation =
      max === min ? 0 : lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)

    // Saturation is the signal; the lightness term penalises near-white and near-black, which are
    // the two things a crest has most of.
    const score = saturation * (1 - Math.abs(lightness - targetLightness))
    if (score > bestScore) {
      bestScore = score
      best = { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
    }
  }

  return best
}

/** `rgb(31, 41, 55)` - the form a CSS custom property or an inline style wants. */
export const formatRgb = ({ r, g, b }: Rgb): string => 'rgb(' + r + ', ' + g + ', ' + b + ')'

/** `#1f2937`, lower case and always six digits. */
export const rgbToHex = ({ r, g, b }: Rgb): string =>
  '#' + [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')

/**
 * Reads the first three integers out of a colour string, so a stored `rgb(31, 41, 55)` can be
 * turned back into channels. Null when there are not three of them.
 */
export const parseRgb = (value: string): Rgb | null => {
  const parts = value.match(/\d+/g)
  if (!parts || parts.length < 3) return null
  const [r, g, b] = parts.map(Number)
  return { r, g, b }
}
