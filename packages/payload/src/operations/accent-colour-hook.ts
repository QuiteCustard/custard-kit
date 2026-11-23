import type { BasePayload, CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { relId } from '../documents/resolve-ref.js'
import { runAfterResponse } from './after-response.js'
import { withSuppressedContext } from './suppress-context.js'

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

/** A media doc's url, or null when it has none. */
const urlOf = (doc: unknown): string | null =>
  isRecord(doc) && typeof doc.url === 'string' && doc.url.length > 0 ? doc.url : null

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
    const docId = relId(doc.id)
    if (imageId === null || docId === null) return doc
    if (imageId === previousImageId && doc[field]) return doc

    const tag = '[' + field + '] ' + collection.slug + '#' + String(docId)
    await deferredWrite({
      payload,
      req,
      picked,
      imageId,
      tag,
      field,
      extract,
      docId,
      collection,
      suppressContextKey,
    })

    return doc
  }
}

/** The follow-up half: resolve a url, extract a colour, write it back. */
const deferredWrite = async (args: {
  payload: BasePayload
  req: PayloadRequest
  picked: AccentColourSource
  imageId: number | string
  tag: string
  field: string
  extract: (url: string) => Promise<string | null>
  docId: number | string
  collection: { slug: string }
  suppressContextKey: string
}): Promise<void> => {
  const { payload, req, picked, imageId, tag, field, extract, docId, collection } = args
  const { suppressContextKey } = args
  const known = urlOf(picked.ref)

  await runAfterResponse(payload, async (deferred) => {
    // Deferred, the save has committed and its transaction is closed, so the work runs on its own
    // and reads the committed document. Inline (a script or a seed, outside a Next request), the
    // save's transaction is still open and holds this document's row: work on another connection
    // would wait on that lock, so it runs on the save's own `req` instead.
    const own = deferred ? undefined : req

    const image = known
      ? null
      : await payload.findByID({
          collection: picked.collection,
          id: imageId,
          depth: 0,
          disableErrors: true,
          ...(own ? { req: own } : {}),
        })
    const url = known ?? urlOf(image)

    if (!url) {
      payload.logger.warn(tag + ' no url for ' + picked.collection + '#' + String(imageId))
      return
    }

    const colour = await extract(url)
    if (!colour) {
      payload.logger.warn(tag + ' nothing extracted from ' + url)
      return
    }

    // Suppressed so this write does not re-enter the hook. Revalidation is left ENABLED on purpose:
    // the triggering save revalidated before this colour existed, so this write has to purge again
    // for it to show.
    const write = () =>
      payload.update({
        collection: collection.slug,
        id: docId,
        data: { [field]: colour },
        ...(own ? { req: own } : { context: { [suppressContextKey]: true } }),
      })

    if (own) await withSuppressedContext(own, [suppressContextKey], write)
    else await write()
  })
}
