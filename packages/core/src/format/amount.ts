/**
 * Locale-aware money formatting for a currency symbol you control (not necessarily a valid ISO
 * 4217 code `Intl`'s currency style would accept). The number grouping follows `intlLocale`
 * (1,000 vs 1 000 vs 1.000); the symbol is placed in front verbatim.
 *
 * A whole amount renders without decimals and a fractional one to exactly two, so a column of
 * prices lines up instead of running `1,500` / `1,500.5` / `1,500.456`. Pass `fractionDigits` to
 * force a fixed number either way.
 *
 * ```ts
 * formatAmount(1500, '£', 'en-GB')     // -> '£1,500'
 * formatAmount(1500.5, '£', 'en-GB')   // -> '£1,500.50'
 * formatAmount(1500, '€', 'fr-FR')     // -> '€1 500'  (grouped with U+202F, not a plain space)
 * formatAmount(1500, '£', 'en-GB', 2)  // -> '£1,500.00'
 * ```
 */
export const formatAmount = (
  amount: number | null | undefined,
  symbol: string,
  intlLocale: string,
  fractionDigits?: number,
): string | null => {
  if (amount == null) return null

  const digits = fractionDigits ?? (Number.isInteger(amount) ? 0 : 2)

  return `${symbol}${amount.toLocaleString(intlLocale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}
