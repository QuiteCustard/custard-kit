// Each channel as a number, with CSS percentage notation scaled to 0-255. Out-of-range values are
// clamped the way a browser clamps them, so a bad channel can't widen the hex past two digits.
const channelRe = /(-?\d*\.?\d+)(%?)/g

const toChannel = (value: string, isPercent: string): number => {
  const scaled = isPercent ? (Number(value) / 100) * 255 : Number(value)

  return Math.min(255, Math.max(0, Math.round(scaled)))
}

/**
 * `'rgb(255, 0, 128)'` → `'#ff0080'`, or null when three channels can't be read.
 *
 * Percentages (`rgb(100%, 0%, 50%)`) are scaled, and out-of-range channels clamp to 0-255. A
 * trailing alpha in `rgba()` is ignored - the result is always six hex digits.
 */
export const rgbToHex = (rgb: string): string | null => {
  const parts = [...rgb.matchAll(channelRe)].slice(0, 3)

  if (parts.length < 3) return null

  return (
    '#' +
    parts
      .map(([, value, percent]) => toChannel(value, percent).toString(16).padStart(2, '0'))
      .join('')
  )
}
