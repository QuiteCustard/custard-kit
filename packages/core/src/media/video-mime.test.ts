import { describe, expect, it } from 'vitest'
import { detectVideoMimeType, isVideoMediaType } from './video-mime.js'

/** An ISO-base-media header: a box length, the `ftyp` box type, then the major brand. */
const isoBaseMedia = (brand: string) => {
  const bytes = new Uint8Array(16)

  bytes.set([0x00, 0x00, 0x00, 0x20], 0)
  bytes.set(
    [...'ftyp'].map((c) => c.charCodeAt(0)),
    4,
  )
  bytes.set(
    [...brand].map((c) => c.charCodeAt(0)),
    8,
  )

  return bytes
}

const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00])

describe('detectVideoMimeType', () => {
  it.each(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', '3gp4'])(
    'reads the MP4-family brand %s',
    (brand) => {
      expect(detectVideoMimeType(isoBaseMedia(brand))).toBe('video/mp4')
    },
  )

  it('reads QuickTime, whose brand is padded with spaces', () => {
    expect(detectVideoMimeType(isoBaseMedia('qt  '))).toBe('video/quicktime')
  })

  it('reads WebM from its EBML signature', () => {
    expect(detectVideoMimeType(webm)).toBe('video/webm')
  })

  // AVIF and HEIC are ISO base media too - same `ftyp` box, an IMAGE inside. Treating any ftyp as
  // MP4 lets one through an upload validator that picks between this module and `media/image-mime`
  // by kind, so the major brand has to be matched rather than assumed.
  it.each(['avif', 'avis', 'heic', 'heix', 'mif1', 'msf1'])(
    'refuses the ISO-base-media IMAGE brand %s',
    (brand) => {
      expect(detectVideoMimeType(isoBaseMedia(brand))).toBeNull()
    },
  )

  it('refuses an unknown brand rather than defaulting to MP4', () => {
    expect(detectVideoMimeType(isoBaseMedia('xxxx'))).toBeNull()
    expect(detectVideoMimeType(isoBaseMedia('jp2 '))).toBeNull()
  })

  it('refuses anything without a signature it knows', () => {
    expect(detectVideoMimeType(new TextEncoder().encode('hello there'))).toBeNull()
    expect(detectVideoMimeType(new Uint8Array())).toBeNull()
    expect(detectVideoMimeType(new Uint8Array([0x1a, 0x45]))).toBeNull()
  })

  // A truncated header must read as "unknown", not index past the end into a match.
  it('refuses an ftyp box with no room for a brand', () => {
    expect(detectVideoMimeType(isoBaseMedia('isom').subarray(0, 8))).toBeNull()
    expect(detectVideoMimeType(isoBaseMedia('isom').subarray(0, 10))).toBeNull()
  })

  it('accepts a Buffer as readily as a Uint8Array', () => {
    expect(detectVideoMimeType(Buffer.from(isoBaseMedia('mp42')))).toBe('video/mp4')
  })
})

describe('isVideoMediaType', () => {
  it('narrows a content-type string', () => {
    expect(isVideoMediaType('video/mp4')).toBe(true)
    expect(isVideoMediaType('video/webm')).toBe(true)
    expect(isVideoMediaType('video/quicktime')).toBe(true)
    expect(isVideoMediaType('video/x-msvideo')).toBe(false)
    expect(isVideoMediaType('image/png')).toBe(false)
    expect(isVideoMediaType('')).toBe(false)
  })
})
