import type { BasePayload, PayloadRequest } from 'payload'
import { sql } from 'drizzle-orm'
import { transactionDb } from './transaction-db.js'

/**
 * Add a session row for `userId` on an auth collection's `sessions` array field, dropping any that
 * have already expired on the way past.
 *
 * 🔴 NOT `payload.update`. Payload stores an array field as a FULL REPLACE - delete every child
 * row, reinsert the array it was handed. Two logins in the same moment (two devices, or a
 * double-tap) each read `[A]`, then one writes `[A, B]` while the other writes `[A, C]` from its
 * own stale snapshot; the loser's device is left holding a JWT whose `sid` is no longer on the
 * row. A single-row INSERT commutes with any other login's INSERT, so there is no window to lose.
 *
 * No lock is taken and none should be: the FK from this table to the auth collection means every
 * INSERT here already holds KEY SHARE on the parent row, which is exactly what a `SELECT … FOR
 * UPDATE` on that row blocks against.
 *
 * Going through SQL also skips the auth collection's hook chain, which `payload.update` would run
 * on every sign-in, and leaves its `updated_at` alone.
 *
 * ⚠️ This closes the race on the path that calls it only. Payload's own `addSessionToUser`,
 * `logout` and `refresh` still read-modify-write the whole array.
 *
 * ```ts
 * await appendUserSession({ payload, userId: user.id, sid, createdAt, expiresAt, req })
 * ```
 *
 * Pass `req` wherever one exists: the statement then runs on the operation's own transaction
 * instead of the pooled root handle.
 */
export const appendUserSession = async ({
  payload,
  userId,
  sid,
  createdAt,
  expiresAt,
  req,
  table = 'users_sessions',
}: {
  payload: BasePayload
  /** Id of the row owning the session - a string on a uuid-id project. */
  userId: number | string
  sid: string
  createdAt: Date
  expiresAt: Date
  /**
   * The operation's request, when there is one. Without it the INSERT runs on the pooled root
   * handle: inside an open transaction that is a DIFFERENT connection, so it cannot see the
   * uncommitted parent row (foreign key violation) and can deadlock against locks the outer
   * transaction already holds.
   */
  req?: PayloadRequest
  /** Physical table backing the auth collection's `sessions` array field. Defaults to Payload's
   * own naming for a `users` collection - `<collection>_sessions` for any other slug. */
  table?: string
}): Promise<void> => {
  const sessionsTable = sql.raw(`"${table}"`)

  // One statement, one round trip. A data-modifying CTE always runs to completion whether or not
  // the outer query reads it, and both halves see the same snapshot - so `max(_order)` counts the
  // rows being pruned. `_order` is a plain index here, not a unique one.
  // Awaited because Payload leaves `transactionID` as a promise while the transaction is still
  // being opened.
  const transactionID = await req?.transactionID

  await transactionDb(payload, transactionID).execute(sql`
    WITH pruned AS (
      DELETE FROM ${sessionsTable} WHERE _parent_id = ${userId} AND expires_at <= now()
    )
    INSERT INTO ${sessionsTable} (id, _parent_id, _order, created_at, expires_at)
    VALUES (
      ${sid},
      ${userId},
      COALESCE((SELECT max(_order) FROM ${sessionsTable} WHERE _parent_id = ${userId}), 0) + 1,
      ${createdAt.toISOString()}::timestamptz,
      ${expiresAt.toISOString()}::timestamptz
    )`)
}
