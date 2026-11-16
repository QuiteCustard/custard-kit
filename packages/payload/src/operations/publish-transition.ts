import type { BasePayload, CollectionSlug, PayloadRequest } from 'payload'
import { isRecord } from '@quitecustard/core/utils/is-record'

type StatusDoc = { id: number | string; _status?: string | null }

const flagged = (value: unknown) => value === true || value === 'true'

/**
 * Payload's afterChange `previousDoc` is the LATEST VERSION, not the published one
 * (`updateByID` -> `getLatestCollectionVersion` queries `latest: true`), and a draft save forces
 * `data._status = 'draft'` (`collections/operations/utilities/update.ts`, `isSavingDraft`). So the FIRST
 * autosave tick on an already-published document reaches every afterChange hook as
 * `previousDoc._status === 'published'` + `doc._status === 'draft'` - byte-identical to an
 * unpublish. Ticks 2+ are draft->draft and look inert, so nothing self-heals.
 *
 * The unguarded test comes from Payload's own website template, where the only consequence is a
 * redundant `revalidatePath`. It is a bug wherever the transition drives a state MUTATION - a
 * cascade that hides a whole subtree, or one that unpublishes every child of the doc being saved.
 *
 * The admin PATCHes `?autosave=true&draft=true` (@payloadcms/ui Autosave). `createLocalReq` never
 * sets either flag - it seeds `req.query` from whatever it was handed and adds only `depth` - so
 * those flags, which are all this helper tests, are absent on a Local API call and a Local API
 * draft save always reads as a real transition here.
 *
 * The flags are a hint, not evidence, in the other direction too: `autosave=true` without
 * `draft=true` can still perform a real unpublish. Use this only where a wrong answer costs a
 * redundant cache purge; {@link isDraftSaveNotUnpublish} is the exact check.
 */
export const looksLikeAutosaveTick = (req: PayloadRequest, doc: StatusDoc): boolean => {
  if (doc._status === 'published') return false

  const query = isRecord(req?.query) ? req.query : {}
  return flagged(query.autosave) || flagged(query.draft)
}

/**
 * Whether the doc is published RIGHT NOW, read from the published row rather than the draft-latest
 * one. The same asymmetry `looksLikeAutosaveTick` above turns on: a draft save writes to `_versions` and
 * leaves the published row intact, so a find with `draft: true` reports `_status: 'draft'` for a
 * doc that is live - and where the collection autosaves, merely having the doc open in the admin is
 * enough to produce that.
 *
 * Use this wherever publish state decides what a write DOES (whether generated rows are visible,
 * whether a save goes live) rather than merely what it looks like. Reading it off a doc the caller
 * already fetched with `draft: true` is the bug this exists to prevent.
 */
export const isCurrentlyPublished = async (
  payload: BasePayload,
  collection: CollectionSlug,
  id: number | string,
): Promise<boolean> => {
  try {
    const published: unknown = await payload.findByID({ collection, id, depth: 0 })

    return isRecord(published) && published._status === 'published'
  } catch {
    // Undeterminable - treat as unpublished, which keeps generated rows hidden rather than exposing
    // a subtree the public shouldn't see yet.
    return false
  }
}

/**
 * Exact, caller-agnostic version of {@link looksLikeAutosaveTick}: a draft save writes to
 * `_versions` only and leaves the published row intact, while a real unpublish flips it. Costs one
 * indexed read, and only on the ambiguous (draft-direction) branch.
 *
 * The published row is the only evidence read. The request's query flags are never consulted:
 * a Local API call carries none, and `autosave=true` without `draft=true` can be a real unpublish.
 *
 * Use this wherever the answer drives a STATE MUTATION, an outbound side effect or a public cache
 * purge.
 */
export const isDraftSaveNotUnpublish = async (
  collection: CollectionSlug,
  doc: StatusDoc,
  req: PayloadRequest,
): Promise<boolean> => {
  // Publishing is always a genuine transition; only the draft direction is ambiguous.
  if (doc._status === 'published') return false

  try {
    // Threading `req` keeps this on the operation's own transaction (a req-less nested call would
    // open a second one and deadlock against it) and shows the row as this write left it.
    const persisted: unknown = await req.payload.findByID({
      collection,
      id: doc.id,
      depth: 0,
      // Explicit, because a request that arrived with `?draft=true` would otherwise read the latest
      // version - the very row this check must not be answered from.
      draft: false,
      select: { _status: true },
      req,
    })

    return isRecord(persisted) && persisted._status === 'published'
  } catch {
    // Undeterminable (doc gone mid-transaction, no request context) - fall back to the historical
    // behaviour and let the caller treat it as a real transition.
    return false
  }
}
