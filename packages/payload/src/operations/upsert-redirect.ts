import { isRecord } from '@quitecustard/core/utils/is-record'
import type { CollectionSlug, PayloadRequest } from 'payload'
import { relId } from '../documents/resolve-ref.js'

/** The document a redirect points at, stored as a reference rather than a URL. */
export type RedirectTarget = { relationTo: CollectionSlug; value: number | string }

/** The reference a `@payloadcms/plugin-redirects` row points at, or null for a URL row. */
const referenceOf = (row: unknown): { relationTo: unknown; value: unknown } | null => {
  if (!isRecord(row) || !isRecord(row.to) || !isRecord(row.to.reference)) return null

  return { relationTo: row.to.reference.relationTo, value: row.to.reference.value }
}

/**
 * Deletes every redirect out of `path`, for a path a page has just started answering on. A
 * redirect row outranks the page at its `from` wherever the site follows redirects before
 * rendering, so whatever the row was for, it now hides a real page.
 *
 * Call it wherever an address comes alive: a first publish, a republish, or a rename into a path
 * something else once redirected away from. `redirects` is the `@payloadcms/plugin-redirects`
 * collection, `redirects` unless the site renamed it.
 */
export const claimRedirectPath = async (
  path: string,
  req: PayloadRequest,
  redirects: CollectionSlug = 'redirects',
): Promise<void> => {
  const { docs } = await req.payload.find({
    collection: redirects,
    where: { from: { equals: path } },
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })

  for (const row of docs) await req.payload.delete({ collection: redirects, id: row.id, req })
}

/**
 * Points an old address at the document that used to live there, for a
 * `@payloadcms/plugin-redirects` collection.
 *
 * The target is stored as a reference, not a URL, and resolved to the document's current address
 * when the redirect is followed, so a document renamed twice leaves both old addresses pointing
 * straight at its page rather than building a chain.
 *
 * `current` is where the document lives after the change. Passing it is what stops a live address
 * from being a redirect source, the shape that redirects a page to itself forever: renaming back
 * to an earlier slug, or an admin autosave, both arrive with `from` equal to `current`. Then
 * nothing is written, and any row at that address pointing back at this document is cleared; a
 * row pointing elsewhere is an editor's override and stays.
 *
 * ```ts
 * await upsertRedirect({
 *   from: '/teams/old-name',
 *   current: '/teams/new-name',
 *   to: { relationTo: 'teams', value: team.id },
 *   req,
 * })
 * ```
 */
export const upsertRedirect = async ({
  current,
  from,
  req,
  to,
  redirects = 'redirects',
}: {
  current: string
  from: string
  req: PayloadRequest
  to: RedirectTarget
  redirects?: CollectionSlug
}): Promise<void> => {
  const { payload } = req

  if (from === current) {
    const { docs } = await payload.find({
      collection: redirects,
      where: { from: { equals: current } },
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    })

    for (const row of docs) {
      const reference = referenceOf(row)
      const pointsHere =
        reference?.relationTo === to.relationTo && relId(reference.value) === to.value

      if (pointsHere) await payload.delete({ collection: redirects, id: row.id, req })
    }

    return
  }

  // The document is about to answer on `current`, so nothing may redirect away from it, not even
  // an override, which was written when no page lived there.
  await claimRedirectPath(current, req, redirects)

  const existing = await payload.find({
    collection: redirects,
    where: { from: { equals: from } },
    limit: 1,
    depth: 0,
    req,
  })

  const data = { from, to: { type: 'reference', reference: to } }
  const row = existing.docs[0]

  if (row) await payload.update({ collection: redirects, id: row.id, data, req })
  else await payload.create({ collection: redirects, data, req })
}
