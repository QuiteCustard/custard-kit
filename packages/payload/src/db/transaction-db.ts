import type { BasePayload } from 'payload'
import type { BasePostgresAdapter } from '@payloadcms/drizzle/postgres'

// Every Payload Postgres adapter augments core's `DatabaseAdapter` with `drizzle` and `sessions`,
// and the augmentation only loads if the adapter is imported. This package must not depend on one,
// so it borrows the declaration from a devDependency to compile: a consumer's own adapter supplies
// the identical augmentation in their build, whichever Postgres adapter that is.
import type {} from '@payloadcms/db-vercel-postgres'

/** The drizzle handle bound to one open transaction session. */
export type SessionDb = BasePostgresAdapter['sessions'][string]['db']

/**
 * The raw-SQL handle for an open Payload transaction, so a statement commits or rolls back with the
 * local-API writes on the same `transactionID`. Without one, the pooled root handle - a statement
 * there runs in autocommit.
 *
 * Payload core erases `sessions[id].db` to `unknown` (it doesn't know the ORM); the adapter's own
 * declaration is the real type, so the assertion is to that rather than a hand-rolled shape.
 */
export const transactionDb = (
  payload: BasePayload,
  transactionID?: number | string | null,
): SessionDb | BasePayload['db']['drizzle'] => {
  const session =
    typeof transactionID === 'string' || typeof transactionID === 'number'
      ? payload.db.sessions?.[transactionID]
      : undefined

  return session ? (session.db as SessionDb) : payload.db.drizzle
}
