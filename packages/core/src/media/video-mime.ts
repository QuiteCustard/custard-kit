// Deliberately hand-rolled rather than `file-type` - see the note in `media/image-mime`, which this
// module pairs with: one upload validator picks between the two by kind.

/** The video types this module can verify from magic bytes. */
export type VideoMediaType = 'video/mp4' | 'video/webm' | 'video/quicktime'

const validVideoTypes: readonly VideoMediaType[] = ['video/mp4', 'video/webm', 'video/quicktime']

/** Narrows a Content-Type string to one of the supported video types. */
export const isVideoMediaType = (value: string): value is VideoMediaType =>
  validVideoTypes.some((type) => type === value)

// An `ftyp` box says only "ISO base media", which AVIF and HEIC are too - so the major brand is
// matched against a list rather than defaulting to MP4. `avif`/`heic` are the ones that matter:
// they are IMAGES, and an upload validator that picks between this module and `media/image-mime`
// by kind would otherwise accept one as a video.
const mp4Brands = new Set([
  '3g2a',
  '3gp4',
  '3gp5',
  'avc1',
  'dash',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'isom',
  'M4V ',
  'mmp4',
  'mp41',
  'mp42',
])

const quicktimeBrand = 'qt  '

const majorBrand = (bytes: Uint8Array): string =>
  String.fromCharCode(...Array.from(bytes.subarray(8, 12)))

/**
 * The real video type of an upload, read from its magic bytes rather than its filename or the
 * client-supplied Content-Type. Returns null for anything that isn't MP4, WebM or QuickTime -
 * including the ISO-base-media IMAGE formats (AVIF, HEIC), which share MP4's container.
 */
export const detectVideoMimeType = (bytes: Uint8Array): VideoMediaType | null => {
  // ISO Base Media (MP4 / MOV): "ftyp" box type at bytes 4-7, major brand at 8-11.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = majorBrand(bytes)

    if (brand === quicktimeBrand) return 'video/quicktime'

    return mp4Brands.has(brand) ? 'video/mp4' : null
  }

  // WebM / Matroska (EBML): 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'video/webm'

  return null
}
