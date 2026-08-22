// True for characters that have no place in a display name and only serve abuse: C0/C1 controls
// and DEL, zero-width and invisible formatting chars, and the bidi controls used for name spoofing.
const isStrippableChar = (code: number): boolean =>
  (code >= 0x00 && code <= 0x1f) || // C0 controls
  (code >= 0x7f && code <= 0x9f) || // DEL + C1 controls
  (code >= 0x200b && code <= 0x200f) || // zero-width + LTR/RTL marks
  (code >= 0x202a && code <= 0x202e) || // bidi embedding/override controls
  (code >= 0x2060 && code <= 0x2064) || // word joiner + invisible operators
  code === 0xfeff // zero-width no-break space / BOM

/**
 * Default storage cap for user-facing profile text (display names, aliases). Give a collection's
 * field `maxLength` this same constant so the schema and the sanitiser can't drift apart; a form
 * is free to enforce a stricter cap of its own on top.
 */
export const maxProfileTextLength = 100

/**
 * Strips control, zero-width and bidi-override characters from user-supplied text, collapses
 * whitespace runs, trims, and caps the length.
 *
 * The escape below is the point: a literal zero-width space would be invisible here, making the
 * example look like it only trims.
 *
 * ```ts
 * sanitiseProfileText('  Ana\u200bLyst  ') // 'AnaLyst'
 * ```
 *
 * Defence-in-depth for what gets STORED - RTL-override spoofing, invisible padding, layout-breaking
 * controls - not an XSS boundary. Output encoding is still the renderer's job.
 */
export const sanitiseProfileText = (value: string, maxLength = maxProfileTextLength): string => {
  let out = ''

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0

    // Tab, newline and carriage return are C0 controls, but they are whitespace to whoever typed
    // them: dropping one outright would join the words either side ("Ada\tLovelace" reading as
    // "AdaLovelace"). They become a space, which the collapse below then folds into any run.
    if (code === 0x09 || code === 0x0a || code === 0x0d) out += ' '
    else if (!isStrippableChar(code)) out += char
  }

  // Sliced by code point, not UTF-16 unit: cutting mid-surrogate would leave a lone half that no
  // longer round-trips through JSON or a database.
  return [...out.replace(/\s+/g, ' ').trim()].slice(0, maxLength).join('')
}
