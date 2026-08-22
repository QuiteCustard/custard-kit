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
