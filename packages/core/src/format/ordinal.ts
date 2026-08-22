/**
 * The suffix alone - `'st'`, `'nd'`, `'rd'`, `'th'` - for when the number is rendered separately,
 * e.g. as a superscript. For the whole `'3rd'` string use `ordinal`.
 */
export const ordinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

/** A number with its ordinal suffix: `3` → `'3rd'`. */
export const ordinal = (n: number): string => `${n}${ordinalSuffix(n)}`
