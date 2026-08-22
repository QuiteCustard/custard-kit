import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison for secrets - an API key, a webhook signature - so the check
 * can't leak the expected value through response timing. Node's `timingSafeEqual` throws on
 * unequal lengths, which the length guard here absorbs.
 */
export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
