import { describe, expect, it } from 'vitest'
import { maxProfileTextLength, sanitiseProfileText } from './sanitise-text.js'

// Stripped characters are composed from their code point rather than pasted in. A literal control
// or zero-width character is invisible in the file, so a test can silently assert on the wrong one
// - or, once an editor has normalised it away, on no character at all.
const between = (code: number) => `Ada${String.fromCodePoint(code)}Lovelace`

const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

describe('sanitiseProfileText', () => {
  it('leaves ordinary text alone', () => {
    expect(sanitiseProfileText('Ada Lovelace')).toBe('Ada Lovelace')
  })

  it('collapses space runs and trims', () => {
    expect(sanitiseProfileText('  Ada   Lovelace  ')).toBe('Ada Lovelace')
  })

  // Tab and newline are C0 controls, but they are whitespace to whoever typed them - dropping one
  // outright would read as "AdaLovelace".
  it('folds tabs and newlines into a space rather than dropping them', () => {
    expect(sanitiseProfileText('Ada\tLovelace')).toBe('Ada Lovelace')
    expect(sanitiseProfileText('Ada\nLovelace')).toBe('Ada Lovelace')
    expect(sanitiseProfileText('Ada\r\nLovelace')).toBe('Ada Lovelace')
    expect(sanitiseProfileText('  Ada \t\n Lovelace  ')).toBe('Ada Lovelace')
  })

  it.each([0x00, 0x01, 0x08, 0x0b, 0x0c, 0x1b, 0x1f])(
    'drops the non-whitespace C0 control %s',
    (code) => {
      expect(sanitiseProfileText(between(code))).toBe('AdaLovelace')
    },
  )

  // Both ends of the DEL + C1 range, which is the half of `isStrippableChar` that a "controls are
  // stripped" test reaching only for NUL never touches.
  it.each([0x7f, 0x80, 0x85, 0x9e, 0x9f])('drops DEL/C1 %s', (code) => {
    expect(sanitiseProfileText(between(code))).toBe('AdaLovelace')
  })

  it.each([0x200b, 0x200c, 0x200d, 0x2060, 0x2064, 0xfeff])(
    'strips the zero-width/invisible character %s',
    (code) => {
      expect(sanitiseProfileText(between(code))).toBe('AdaLovelace')
    },
  )

  it.each([0x200e, 0x200f, 0x202a, 0x202d, 0x202e])(
    'strips the bidi control %s, which is what spoofs a name',
    (code) => {
      expect(sanitiseProfileText(between(code))).toBe('AdaLovelace')
    },
  )

  // The boundary either side of each stripped range: an off-by-one in `isStrippableChar` would
  // start eating ordinary text, and space is the one C0-adjacent character that must survive.
  it.each([0x20, 0x21, 0x7e, 0xa0, 0xe9, 0x200a, 0x2010, 0x2065, 0x205f, 0xfefe])(
    'keeps the printable character %s',
    (code) => {
      expect(sanitiseProfileText(between(code))).toBe(between(code).replace(/\s+/g, ' '))
    },
  )

  // The whole stripped set, restated independently of the implementation. Sweeping the BMP is what
  // catches a range widening by accident - a spot check only ever proves the characters it names.
  it('strips exactly the declared ranges and nothing else', () => {
    const declared = [
      [0x00, 0x1f],
      [0x7f, 0x9f],
      [0x200b, 0x200f],
      [0x202a, 0x202e],
      [0x2060, 0x2064],
      [0xfeff, 0xfeff],
    ]

    // Folded to a space rather than dropped, so they are in the ranges but not in the outcome.
    const whitespaceControls = [0x09, 0x0a, 0x0d]

    const expected = declared
      .flatMap(([start = 0, end = 0]) =>
        Array.from({ length: end - start + 1 }, (_, i) => start + i),
      )
      .filter((code) => !whitespaceControls.includes(code))

    const actual: number[] = []

    for (let code = 0; code <= 0xffff; code++) {
      // Surrogate halves are not characters on their own and never round-trip; skip the block.
      if (code >= 0xd800 && code <= 0xdfff) continue

      if (sanitiseProfileText(between(code)) === 'AdaLovelace') actual.push(code)
    }

    expect(actual.map(hex)).toEqual(expected.map(hex))
  })

  it('caps length', () => {
    expect(sanitiseProfileText('a'.repeat(200))).toHaveLength(maxProfileTextLength)
    expect(sanitiseProfileText('abcdef', 3)).toBe('abc')
  })

  // Slicing by UTF-16 unit can cut an emoji in half, leaving a lone surrogate that no longer
  // round-trips through JSON or a database.
  it('never cuts a surrogate pair in half', () => {
    const cut = sanitiseProfileText(`${'a'.repeat(99)}😀`)

    expect(cut.isWellFormed()).toBe(true)
    expect([...cut].length).toBeLessThanOrEqual(maxProfileTextLength)
  })

  it('keeps emoji that fit', () => {
    expect(sanitiseProfileText('hi 😀')).toBe('hi 😀')
  })

  it('handles input that sanitises away to nothing', () => {
    expect(sanitiseProfileText('')).toBe('')
    expect(sanitiseProfileText('   ')).toBe('')
    expect(sanitiseProfileText(String.fromCodePoint(0x200b, 0x00, 0x9f))).toBe('')
  })
})
