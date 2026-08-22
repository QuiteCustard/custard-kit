import { commitTransaction, initTransaction, killTransaction } from 'payload'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

/**
 * Bulk-deletes rows AND their draft-version snapshots.
 *
 * `payload.db.deleteMany` removes a collection's own rows, plus whatever its FKs cascade, but not
 * its versions: a draft-enabled collection's `_<coll>_v.parent_id -> <coll>` FK is ON DELETE SET
 * NULL, so the version rows survive with a NULL parent and then surface in the admin's draft-aware
 * `join` fields as phantom relations to a doc that no longer exists.
 *
 * Only for the raw DB path - a cascade's bulk delete, a migration or a script - where no hooks
 * fire; `payload.delete` already purges a doc's versions itself. Versions go first, then the main
 * rows. Passing `req` runs both inside the caller's already-open transaction; omitting it opens and
 * commits (or rolls back) one of its own, on adapters that support transactions. On a version-free
 * collection this is exactly `db.deleteMany`.
 */
export const deleteManyWithVersions = async ({
  payload,
  collection,
  ids,
  req,
}: {
  payload: Payload
  collection: CollectionSlug
  ids: (number | string)[]
  req?: PayloadRequest
}): Promise<void> => {
  if (ids.length === 0) return

  const ownReq: Partial<PayloadRequest> & { payload: Payload } = req ?? { payload }
  const ownsTransaction = req ? false : await initTransaction(ownReq)

  try {
    if (payload.collections[collection]?.config.versions) {
      await payload.db.deleteVersions({ collection, where: { parent: { in: ids } }, req: ownReq })
    }

    await payload.db.deleteMany({ collection, where: { id: { in: ids } }, req: ownReq })

    if (ownsTransaction) await commitTransaction(ownReq)
  } catch (error) {
    if (ownsTransaction) await killTransaction(ownReq)
    throw error
  }
}
