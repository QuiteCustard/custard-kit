import type { BasePayload, CollectionAfterChangeHook } from 'payload'
import { relId } from '../documents/resolve-ref.js'
import { runAfterResponse } from './after-response.js'

/**
 * Keeps a colour field on a document in step with the document's picture - a crest, a hero image, a
 * banner - by reading the image once after the save and writing the colour back.
 *
 * Two things are deliberately NOT in here, because they are what made the original unportable:
 *
 * - **Decoding.** The caller passes `extract`, a function from a media URL to a colour string. The
 *   decode wants `sharp` or a canvas and usually a cache around it, and none of that belongs in a
 *   helpers package. `@quitecustard/core/media/accent-colour` holds the pixel maths if you want it.
 * - **Which field holds the picture.** `source` answers that per collection, because a team reads
 *   its logo while a page reads a hero block's image or a video's poster.
 *
 * The work is deferred with {@link runAfterResponse}: fetching and decoding an image is a network
 * round-trip plus a CPU-bound decode, and an editor's save should not wait for it.
 */
export type AccentColourSource = {
  /** Media collection the image ref points into. */
  collection: string
  /** The image on the saved doc: an id, a populated doc, or null. */
  ref: unknown
  /** The same image on the previous doc, used to skip a save that did not change the picture. */
  previousRef?: unknown
}

export type AccentColourHookOptions = {
  /** Document field the colour is written to. */
  field: string
  /** Picks the picture to read, or null when this document has none. */
  source: (args: {
    doc: Record<string, unknown>
    previousDoc?: Record<string, unknown>
    collection: string
  }) => AccentColourSource | null
  /** The app's decode: a media URL in, a colour string out, null when it cannot be read. */
  extract: (url: string) => Promise<string | null>
  /**
   * Context flag that suppresses the hook. The write-back sets it so the hook does not re-enter on
   * its own update, and callers can set it to silence the hook on a bulk import.
   */
  suppressContextKey?: string
}

/** A url already on a populated relationship saves a lookup in the deferred work. */
const inlineUrl = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object') return null
  const url = (ref as { url?: unknown }).url
  return typeof url === 'string' && url.length > 0 ? url : null
}

export const accentColourHook = (options: AccentColourHookOptions): CollectionAfterChangeHook => {
  const { field, source, extract, suppressContextKey = 'disableHook' } = options

  return async ({ doc, previousDoc, collection, req }) => {
    const { payload, context } = req
    if (context[suppressContextKey]) return doc

    const picked = source({ doc, previousDoc, collection: collection.slug })
    if (!picked) return doc

    const imageId = relId(picked.ref)
    const previousImageId = relId(picked.previousRef)

    // Nothing to do without a picture, and nothing to do when the picture is unchanged and a
    // colour is already stored. Both checks are cheap and stay on the save's critical path.
    if (imageId === null) return doc
    if (imageId === previousImageId && doc[field]) return doc

    const tag = '[' + field + '] ' + collection.slug + '#' + String(doc.id)
    await deferredWrite({
      payload,
      picked,
      imageId,
      tag,
      field,
      extract,
      doc,
      collection,
      suppressContextKey,
    })

    return doc
  }
}

/** The post-commit half: resolve a url, extract a colour, write it back. */
const deferredWrite = async (args: {
  payload: BasePayload
  picked: AccentColourSource
  imageId: number | string
  tag: string
  field: string
  extract: (url: string) => Promise<string | null>
  doc: Record<string, unknown>
  collection: { slug: string }
  suppressContextKey: string
}): Promise<void> => {
  const { payload, picked, imageId, tag, field, extract, doc, collection, suppressContextKey } =
    args
  const known = inlineUrl(picked.ref)
  const collectionSlug = collection.slug
  const docId = doc.id as number | string

  // Runs post-commit in its own transaction, so it must not reuse `req`, and it reads the
  // just-committed document.
  await runAfterResponse(payload, async () => {
    let url = known
    if (!url) {
      const image = await payload.findByID({
        collection: picked.collection,
        id: imageId,
        depth: 0,
      })
      const resolved = (image as { url?: unknown } | null)?.url
      url = typeof resolved === 'string' ? resolved : null
    }

    if (!url) {
      payload.logger.warn(tag + ' no url for ' + picked.collection + '#' + String(imageId))
      return
    }

    const colour = await extract(url)
    if (!colour) {
      payload.logger.warn(tag + ' nothing extracted from ' + url)
      return
    }

    await payload.update({
      collection: collectionSlug,
      id: docId,
      data: { [field]: colour },
      // Suppressed so this write does not re-enter the hook. Revalidation is left ENABLED on
      // purpose: the triggering save revalidated before this colour existed, so this write has to
      // purge again for it to show.
      context: { [suppressContextKey]: true },
    })
  })
}
