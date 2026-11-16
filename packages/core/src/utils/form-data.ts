/**
 * The JSON blob a form field carries, read leniently: a missing field, a blank one and malformed
 * JSON all come back `undefined`.
 *
 * Callers validate shape.
 */
export const jsonFormField = (raw: FormDataEntryValue | null): unknown => {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined

  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * The integer a form field carries - a hidden id input, typically. A missing field, a file entry
 * and anything that is not a whole number all come back `null`.
 */
export const numberFormField = (raw: FormDataEntryValue | null): number | null => {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  const value = Number(raw)

  return Number.isInteger(value) ? value : null
}
