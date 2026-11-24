import type { BasePayload } from 'payload'
import { sql, type SQL } from 'drizzle-orm'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { resultRows } from './sql-result.js'
import { transactionDb } from './transaction-db.js'

const waitMs = 120_000
const maxBackoffMs = 2_000

const lockId = (key: string) => sql`hashtextextended(${key}, 0)`

/**
 * The statement holding an advisory lock on `key` until its transaction ends, for a raw drizzle
 * transaction (`payload.db.drizzle.transaction`). Inside a Payload transaction, use
 * `holdAdvisoryLock`.
 */
export const advisoryLockSql = (key: string): SQL =>
  sql`SELECT pg_advisory_xact_lock(${lockId(key)})`

/**
 * Holds a Postgres advisory lock on `key` until the transaction `transactionID` ends. A second
 * caller with the same key waits until the first commits or rolls back, so a read-then-write
 * under the lock never interleaves with another. Name the key after what it guards and its id
 * (`team-record:12`); unrelated keys never block each other.
 *
 * ```ts
 * await holdAdvisoryLock(payload, await req.transactionID, `team-record:${teamId}`)
 * ```
 *
 * Throws without an open transaction: on the pooled root handle the lock would release as soon as
 * it was taken.
 */
export const holdAdvisoryLock = async (
  payload: BasePayload,
  transactionID: number | string | null | undefined,
  key: string,
): Promise<void> => {
  const open = transactionID != null && payload.db.sessions?.[transactionID] !== undefined

  if (!open) throw new Error(`Advisory lock "${key}" needs an open transaction`)

  await transactionDb(payload, transactionID).execute(advisoryLockSql(key))
}

/**
 * Runs `run` while holding an advisory lock on `key`, in a transaction of its own that only scopes
 * the lock: `run`'s own writes go wherever it sends them. Without transaction support, `run` runs
 * unlocked.
 *
 * A busy lock is retried with backoff until it is free, never skipped. Throws when it is still
 * held after two minutes.
 *
 * Note: a try-lock in a retry loop, not a blocking wait. A blocked waiter keeps a pooled connection
 * while it waits, and a burst of them can leave the holder's `run` none to finish with. Between
 * attempts a waiter holds no connection.
 *
 * For work already inside a transaction, `holdAdvisoryLock` locks on that one instead.
 */
export const withAdvisoryLock = async <Result>(
  payload: BasePayload,
  key: string,
  run: () => Promise<Result>,
): Promise<Result> => {
  const deadline = Date.now() + waitMs

  for (let attempt = 0; ; attempt++) {
    const outcome = await runIfLockFree(payload, key, run)
    const timedOut = Date.now() >= deadline

    if (outcome) return outcome.result
    if (timedOut) throw new Error(`Advisory lock "${key}" still held after ${waitMs}ms`)

    const backoffMs = Math.min(maxBackoffMs, 50 * 2 ** attempt) + Math.random() * 50

    await new Promise((resolve) => setTimeout(resolve, backoffMs))
  }
}

/** One attempt: `run` under the lock when it is free; null, with no connection held, when not. */
const runIfLockFree = async <Result>(
  payload: BasePayload,
  key: string,
  run: () => Promise<Result>,
): Promise<{ result: Result } | null> => {
  const transactionID = await payload.db.beginTransaction()

  if (transactionID == null) return { result: await run() }

  let outcome: { result: Result } | null

  try {
    const [row] = resultRows(
      await transactionDb(payload, transactionID).execute(
        sql`SELECT pg_try_advisory_xact_lock(${lockId(key)}) AS acquired`,
      ),
    )

    outcome = isRecord(row) && row.acquired === true ? { result: await run() } : null
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)

    throw error
  }

  if (outcome) await payload.db.commitTransaction(transactionID)
  else await payload.db.rollbackTransaction(transactionID)

  return outcome
}
