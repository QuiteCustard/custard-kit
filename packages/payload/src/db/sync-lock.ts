import { type BasePayload } from 'payload'
import { sql } from 'drizzle-orm'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { rowCount } from './sql-result.js'

const defaultStaleMs = 60 * 60 * 1000

// The lock lives in a Payload global, so its fields are narrowed structurally - a consumer's
// generated global types never reach this package.
const readLock = (doc: unknown): { isRunning: boolean; startedBy?: string; startedAt?: string } => {
  if (!isRecord(doc)) return { isRunning: false }

  return {
    isRunning: doc.isRunning === true,
    startedBy: typeof doc.startedBy === 'string' ? doc.startedBy : undefined,
    startedAt: typeof doc.startedAt === 'string' ? doc.startedAt : undefined,
  }
}

/** Where the lock lives and how long a held one stays valid. */
export type SyncLockOptions = {
  /** Slug of the global holding the lock. Defaults to `sync-lock`. */
  slug?: string
  /** Physical table backing that global - its `dbName` where one is set. Defaults to `sync_lock`. */
  table?: string
  /** How long a held lock stays valid before another run may reclaim it. Defaults to 60 minutes. */
  staleMs?: number
}

/**
 * A single-flight lock for a long job - an import, a sync, a rebuild - so two invocations can't run
 * it at once. Serverless has no process memory to lock in, so the lock is a row.
 *
 * ```ts
 * const syncLock = createSyncLock()
 *
 * const held = await syncLock.acquire(payload, user.username)
 * if (held) return conflict(`Already running, started by ${held.startedBy}`)
 *
 * try { await runSync() } finally { await syncLock.release(payload, user.username) }
 * ```
 *
 * Requires a global whose fields are `isRunning` (checkbox), `startedBy` (text) and `startedAt`
 * (date). Point `slug` and `table` at it if you name it something other than `sync-lock`.
 */
export const createSyncLock = ({
  slug = 'sync-lock',
  table = 'sync_lock',
  staleMs = defaultStaleMs,
}: SyncLockOptions = {}) => {
  const lockTable = sql.raw(`"${table}"`)

  // A row with no `startedAt` at all cannot be timed, so it reads as stale (reclaimable) rather
  // than eternally held.
  const isStale = (startedAt: string | Date | null | undefined): boolean => {
    if (!startedAt) return true

    return Date.now() - new Date(startedAt).getTime() > staleMs
  }

  /**
   * Claims the lock for `startedBy`. Returns null on success, or `{ startedBy }` naming the run
   * that already holds it.
   *
   * The claim is a single conditional UPDATE, so it is atomic: only the request whose UPDATE
   * matched the free-or-stale row gets a row back. A read-then-write cannot do this - two
   * concurrent requests both pass the isRunning check and run overlapping jobs - and a global has
   * no unique key to lean on, which is why this is raw SQL.
   *
   * A lock older than `staleMs` is reclaimable, so a run killed mid-flight cannot block every later
   * one. So is a held lock carrying no `startedAt`: it has no age to be judged by, and treating
   * that as fresh would hold the lock forever.
   */
  const acquire = async (
    payload: BasePayload,
    startedBy: string,
  ): Promise<null | { startedBy?: string }> => {
    const staleBefore = new Date(Date.now() - staleMs).toISOString()

    const res = await payload.db.drizzle.execute(sql`
      UPDATE ${lockTable}
      SET is_running = true, started_by = ${startedBy}, started_at = now(), updated_at = now()
      WHERE is_running IS NOT TRUE OR started_at IS NULL OR started_at < ${staleBefore}
      RETURNING id`)

    if (rowCount(res) > 0) return null

    // Nothing matched, which means one of two things: another run holds a fresh lock (the ordinary
    // contended case), or the global's row doesn't exist yet - Payload creates it lazily on first
    // write, so before the first-ever run there is nothing for the UPDATE to hit.
    //
    // Only the second needs seeding, and seeding is a read-then-write (updateGlobal) that two
    // concurrent first-ever callers could both pass through undetected. The two cases are
    // indistinguishable from here without reading, so the advisory lock is taken for both and the
    // UPDATE retried inside it: whoever lost the race to seed finds the row on the retry. Losing the
    // lock therefore costs two extra statements - the advisory lock and the retry - plus a read of
    // the global, against the one statement an uncontended claim returns on.
    return await payload.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${slug}))`)

      const retry = await tx.execute(sql`
        UPDATE ${lockTable}
        SET is_running = true, started_by = ${startedBy}, started_at = now(), updated_at = now()
        WHERE is_running IS NOT TRUE OR started_at IS NULL OR started_at < ${staleBefore}
        RETURNING id`)

      if (rowCount(retry) > 0) return null

      const lock = readLock(await payload.findGlobal({ slug }))

      if (lock.isRunning && !isStale(lock.startedAt)) return { startedBy: lock.startedBy }

      await payload.updateGlobal({
        slug,
        data: { isRunning: true, startedBy, startedAt: new Date().toISOString() },
      })

      return null
    })
  }

  /**
   * Releases the lock, matching on `startedBy` so a caller can only release its own.
   *
   * A run that outlives `staleMs` can have its lock reclaimed by another; an unconditional release
   * in that first run's `finally` would then free the second run's lock from under it. Two
   * overlapping runs started by the SAME name would have to straddle the threshold first.
   */
  const release = async (payload: BasePayload, startedBy: string): Promise<void> => {
    await payload.db.drizzle.execute(sql`
      UPDATE ${lockTable}
      SET is_running = false, updated_at = now()
      WHERE started_by = ${startedBy}`)
  }

  /**
   * Whether a run currently holds the lock, and who started it - for a status endpoint or a
   * disabled "run now" button. A lock older than `staleMs` reads as free.
   */
  const status = async (
    payload: BasePayload,
  ): Promise<{ isRunning: boolean; startedBy?: string }> => {
    const lock = readLock(await payload.findGlobal({ slug }))

    if (lock.isRunning && !isStale(lock.startedAt))
      return { isRunning: true, startedBy: lock.startedBy }

    return { isRunning: false }
  }

  return { acquire, release, status }
}
