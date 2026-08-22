import { after } from 'next/server'
import type { BasePayload } from 'payload'

/**
 * Run non-critical follow-up work *after* the HTTP response has been sent, via
 * Next.js `after` (backed by Vercel's `waitUntil`, so the serverless invocation
 * stays alive until the work settles). Keeps heavy, self-correcting reconciliation
 * - recomputing derived aggregates, posting webhooks - off the save's critical path
 * so the editor's save returns immediately instead of blocking on a fan-out of DB
 * queries (which in production could exceed the function timeout).
 *
 * `after` is only available inside a request scope (route handlers, server
 * actions); outside one - e.g. local-API scripts or seeding - it throws, so the work is awaited
 * inline instead, preserving correctness everywhere.
 *
 * `work` receives whether it was genuinely DEFERRED. That distinction is load-bearing for anything
 * reconciling against a DELETE:
 * - deferred (`true`): runs post-commit, so it must NOT reuse the triggering `req` - that
 *   transaction is closed. Pass `payload` and let each nested operation open its own, which reads
 *   the just-committed data and so sees this operation's changes.
 * - inline (`false`): the caller's transaction is still OPEN, so work without `req` runs on a
 *   separate connection and is MVCC-isolated from it - a recompute would read the rows as though
 *   the delete never happened and persist pre-delete totals. Callers that care must thread `req`
 *   here so the work sees the uncommitted state it is reconciling against.
 */
export const runAfterResponse = async (
  payload: BasePayload,
  work: (deferred: boolean) => Promise<void>,
): Promise<void> => {
  const guarded = async (deferred: boolean) => {
    try {
      await work(deferred)
    } catch (err) {
      payload.logger.error({ err }, 'Deferred after-response work failed')
    }
  }

  try {
    after(() => guarded(true))
  } catch {
    // Not inside a Next.js request (scripts/seeding): run it inline instead.
    await guarded(false)
  }
}
