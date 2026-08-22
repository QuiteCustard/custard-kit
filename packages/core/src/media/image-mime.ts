// Not `file-type`, and not by accident: that package states it detects binary formats only, "not
// text-based formats like .txt, .csv, .svg", and declines pull requests for them. SVG sniffing is
// half of what an upload validator needs here, so swapping this module for file-type would silently
// drop it. The narrow unions below are the second reason - callers want the three types an upload
// route and a vision API accept, not 150 types to narrow again afterwards.

/** The image types this module can verify from magic bytes. */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const validMediaTypes: readonly ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp']

/** Narrows a Content-Type string to one of the supported image types. */
export const isImageMediaType = (value: string): value is ImageMediaType =>
  validMediaTypes.some((type) => type === value)

/** Extensions matching the supported image types, for an upload accept list. */
export const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])

/** A starting point for a screenshot-upload cap; each route is free to enforce a smaller one. */
export const screenshotUploadMaxBytes = 5 * 1024 * 1024 // 5 MB

/** The canonical extension to store a detected image under. */
export const mimeToExtension: Record<ImageMediaType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

/**
 * The real image type of an upload, read from its magic bytes rather than its filename or the
 * client-supplied Content-Type - both of which a caller controls. Returns null for anything that
 * isn't JPEG, PNG or WebP; SVG is text and needs `detectSvgMimeType` instead.
 *
 * ```ts
 * const mime = detectImageMimeType(buffer)
 * if (!mime) return badRequest('Not a supported image')
 * ```
 */
export const detectImageMimeType = (bytes: Uint8Array): ImageMediaType | null => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp'

  return null
}

// An XML prolog, a doctype and comments may legally precede the root element, so they are skipped
// rather than counted as content. Anything else before `<svg` means the root is something else.
const xmlPreamble = /^(?:<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|\s+)+/i

/**
 * SVG is text (XML), so it has no magic-byte signature - the check is that `<svg` is the document's
 * ROOT element, not merely present somewhere in it.
 *
 * An HTML page containing an inline `<svg>` is rejected: it would otherwise be stored and served as
 * `image/svg+xml`, and browsers execute script in an SVG served that way. This proves the file IS
 * an SVG; it does not sanitise script inside the SVG itself.
 */
export const detectSvgMimeType = (bytes: Uint8Array): 'image/svg+xml' | null => {
  // TextDecoder drops a leading UTF-8 BOM itself, so the markup check sees `<` either way.
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart()
  const root = head.replace(xmlPreamble, '')

  return /^<svg[\s/>]/i.test(root) ? 'image/svg+xml' : null
}
