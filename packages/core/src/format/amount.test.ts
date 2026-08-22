import { describe, expect, it } from 'vitest'
import { formatAmount } from './amount.js'

describe('formatAmount', () => {
  it('groups by locale and prefixes the caller’s symbol', () => {
    expect(formatAmount(1500, '£', 'en-GB')).toBe('£1,500')
    expect(formatAmount(1500, '€', 'fr-FR')).toBe('€1 500')
    expect(formatAmount(1500, '$', 'en-US')).toBe('$1,500')
  })

  // Bare toLocaleString allows 0-3 fraction digits, which renders a column of prices as
  // 1,500 / 1,500.5 / 1,500.456. Money needs one rule.
  it('renders whole amounts bare and fractional ones to exactly two places', () => {
    expect(formatAmount(1500, '£', 'en-GB')).toBe('£1,500')
    expect(formatAmount(1500.5, '£', 'en-GB')).toBe('£1,500.50')
    expect(formatAmount(1500.456, '£', 'en-GB')).toBe('£1,500.46')
    expect(formatAmount(0.5, '£', 'en-GB')).toBe('£0.50')
  })

  it('honours an explicit digit count either way', () => {
    expect(formatAmount(1500, '£', 'en-GB', 2)).toBe('£1,500.00')
    expect(formatAmount(1500.75, '£', 'en-GB', 0)).toBe('£1,501')
  })

  it('handles zero and negatives', () => {
    expect(formatAmount(0, '£', 'en-GB')).toBe('£0')
    expect(formatAmount(-25.5, '£', 'en-GB')).toBe('£-25.50')
  })

  it('passes null through so a missing amount is not rendered as zero', () => {
    expect(formatAmount(null, '£', 'en-GB')).toBeNull()
    expect(formatAmount(undefined, '£', 'en-GB')).toBeNull()
  })
})
