// Code points, not graphemes: `Intl.Segmenter` is missing from browsers a project may still target,
// and a server/client capability split would produce a different string on each side.
const firstCodePoint = (word: string): string => {
  const codePoint = word.codePointAt(0)

  return codePoint === undefined ? '' : String.fromCodePoint(codePoint)
}

/**
 * Up to two uppercase initials from a name: `'ada lovelace'` → `'AL'`.
 *
 * `max` caps the count at one or two (two by default): `getInitials('ada lovelace', 1)` → `'A'`,
 * for an avatar too small to hold a pair.
 *
 * Total by design. Callers type the name as a string but the data disagrees - a row with a null
 * name arrives as undefined - and a throwing helper turns one bad row into a failed page, so a
 * missing name yields `''` rather than an error.
 *
 * Initials are taken and capped by code point, never by UTF-16 unit. A name leading with an astral
 * character (an emoji, a mathematical alphanumeric) would otherwise yield a lone surrogate, which a
 * server render serialises as U+FFFD while the client renders the surrogate itself - a hydration
 * mismatch rather than a wrong letter.
 */
export const getInitials = (name: string | null | undefined, max: 1 | 2 = 2): string =>
  Array.from((name ?? '').split(' ').map(firstCodePoint).join(''))
    .slice(0, max)
    .join('')
    .toUpperCase()
