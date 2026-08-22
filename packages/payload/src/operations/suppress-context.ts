import type { PayloadRequest } from 'payload'
import { isRecord } from '@quitecustard/core/utils/is-record'

// Where the per-flag depth counters and the value each flag held before the outermost suppression
// live. Both hang off req.context so they share the request's lifetime.
const countsKey = 'suppressedContextCounts'
const baseKey = 'suppressedContextBase'

// req.context is open storage keyed by string, so a bag is read back structurally - anything else
// in the request could have written that key.
const contextBag = (req: PayloadRequest, key: string): Record<string, unknown> => {
  const existing = req.context[key]

  if (isRecord(existing)) return existing

  const created: Record<string, unknown> = {}
  req.context[key] = created

  return created
}

const depthOf = (counts: Record<string, unknown>, flag: string): number =>
  typeof counts[flag] === 'number' ? counts[flag] : 0

/**
 * Set boolean `req.context` flags for the duration of `work`, safely under concurrency.
 *
 * The obvious version - capture the current values, set true, restore in a `finally` - is broken on
 * any hook that a BULK operation can reach. Payload builds every document's hook chain up front with
 * an eager `docs.map(async …)` and runs them against ONE shared `req.context`, so with 2+ documents
 * the second chain's capture reads the first's mid-flight `true`, and whichever `finally` lands last
 * restores that `true` permanently - silently suppressing every remaining hook in the operation.
 *
 * Reference counting removes the race: the base value is recorded only on the outermost entry
 * (0 -> 1) and restored only on the outermost exit (1 -> 0), so N interleaved chains raise the count
 * to N and lower it back to 0 with the original value intact. Increment and decrement are
 * synchronous, so they cannot interleave with each other.
 */
export const withSuppressedContext = async <T>(
  req: PayloadRequest,
  flags: readonly string[],
  work: () => Promise<T>,
): Promise<T> => {
  const counts = contextBag(req, countsKey)
  const base = contextBag(req, baseKey)

  for (const flag of flags) {
    const depth = depthOf(counts, flag)

    if (depth === 0) base[flag] = req.context[flag]

    counts[flag] = depth + 1
    req.context[flag] = true
  }

  try {
    return await work()
  } finally {
    for (const flag of flags) {
      const depth = depthOf(counts, flag) || 1
      counts[flag] = depth - 1

      if (depth - 1 <= 0) {
        delete counts[flag]
        req.context[flag] = base[flag]
        delete base[flag]
      }
    }
  }
}
