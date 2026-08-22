/**
 * An inclusive bound, so a field's range is declared once and shared by the input that offers it
 * and the validator that enforces it.
 */
export type NumberRange = { min: number; max: number }

/**
 * Integer and in range. For any numeric field arriving from a client that can send anything -
 * counts, limits, positions - checked on the server before the write.
 */
export const isWholeNumber = (value: number, { min, max }: NumberRange): boolean =>
  Number.isInteger(value) && value >= min && value <= max

/** Finite and in range, for decimal fields like money where integer-ness is not the rule. */
export const isFiniteNumber = (value: number, { min, max }: NumberRange): boolean =>
  Number.isFinite(value) && value >= min && value <= max

/**
 * A number input's raw value as a stored integer, or null.
 *
 * Null rather than 0 for the empty case: a field being retyped is briefly empty, and `Number('')`
 * is 0, so coercing directly would snap a cleared field to zero mid-keystroke. Non-integer and
 * unparseable values also read as null - the range rules live server-side, this only decides
 * whether there is a value at all.
 */
export const parseOptionalInt = (value: string): number | null => {
  if (value.trim() === '') return null

  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : null
}
