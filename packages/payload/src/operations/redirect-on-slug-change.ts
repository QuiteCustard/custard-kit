import { isRecord } from '@quitecustard/core/utils/is-record'
import type { CollectionAfterChangeHook, CollectionSlug, PayloadRequest } from 'payload'
import { upsertRedirect } from './upsert-redirect.js'

const slugOf = (doc: unknown): string | null =>
  isRecord(doc) && typeof doc.slug === 'string' && doc.slug !== '' ? doc.slug : null

/**
 * An afterChange hook that keeps a page's old address alive when its document's `slug` changes:
 * `path(oldSlug)` becomes a redirect to the document (see `upsertRedirect`), so links to a
 * renamed team or profile still land. For a page whose address is its own slug under a fixed
 * base; a page nested under another document's slug moves whenever its parent does, and needs a
 * hook that knows the tree.
 *
 * - `path` builds the page's address from a slug.
 * - `hasPage` leaves out documents with no page of their own, whose redirect would only dangle.
 * - `skip` leaves out writes that shouldn't redirect, such as a bulk import's.
 * - `redirects` is the `@payloadcms/plugin-redirects` collection, `redirects` by default.
 *
 * ```ts
 * hooks: {
 *   afterChange: [redirectOnSlugChange({ path: (slug) => `/teams/${slug}` })],
 * }
 * ```
 */
export const redirectOnSlugChange =
  ({
    path,
    hasPage = () => true,
    skip = () => false,
    redirects = 'redirects',
  }: {
    path: (slug: string) => string
    hasPage?: (doc: unknown) => boolean
    skip?: (req: PayloadRequest) => boolean
    redirects?: CollectionSlug
  }): CollectionAfterChangeHook =>
  async ({ collection, doc, operation, previousDoc, req }) => {
    if (operation !== 'update' || skip(req)) return doc

    const oldSlug = slugOf(previousDoc)
    const newSlug = slugOf(doc)
    const moved = oldSlug !== null && newSlug !== null && oldSlug !== newSlug

    if (!moved || !hasPage(doc)) return doc

    await upsertRedirect({
      current: path(newSlug),
      from: path(oldSlug),
      req,
      to: { relationTo: collection.slug, value: doc.id },
      redirects,
    })

    return doc
  }
