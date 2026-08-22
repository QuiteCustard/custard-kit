import { describe, expect, it } from 'vitest'
import {
  allowedExtensions,
  detectImageMimeType,
  detectSvgMimeType,
  isImageMediaType,
  mimeToExtension,
  screenshotUploadMaxBytes,
} from './image-mime.js'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0)
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)

describe('detectImageMimeType', () => {
  it('reads the type from magic bytes, not a filename', () => {
    expect(detectImageMimeType(jpeg)).toBe('image/jpeg')
    expect(detectImageMimeType(png)).toBe('image/png')
    expect(detectImageMimeType(webp)).toBe('image/webp')
  })

  it('accepts a Buffer as readily as a Uint8Array', () => {
    expect(detectImageMimeType(Buffer.from(png))).toBe('image/png')
  })

  it('rejects anything else', () => {
    expect(detectImageMimeType(text('hello'))).toBeNull()
    expect(detectImageMimeType(bytes())).toBeNull()
    expect(detectImageMimeType(text('<svg></svg>'))).toBeNull()
  })

  it('does not mistake a RIFF container that is not WebP', () => {
    expect(
      detectImageMimeType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20)),
    ).toBeNull()
  })
})

describe('detectSvgMimeType', () => {
  it('accepts an SVG document', () => {
    expect(detectSvgMimeType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      'image/svg+xml',
    )
    expect(detectSvgMimeType(text('  <svg viewBox="0 0 1 1"></svg>'))).toBe('image/svg+xml')
  })

  it('accepts the preamble that may legally precede a root element', () => {
    expect(detectSvgMimeType(text('<?xml version="1.0"?>\n<svg></svg>'))).toBe('image/svg+xml')
    expect(detectSvgMimeType(text('<!-- a note --><svg></svg>'))).toBe('image/svg+xml')
    expect(
      detectSvgMimeType(text('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd"><svg/>')),
    ).toBe('image/svg+xml')
    expect(detectSvgMimeType(text('﻿  <svg></svg>'))).toBe('image/svg+xml')
  })

  // Serving an HTML page as image/svg+xml executes its script. `<svg` being PRESENT is not enough;
  // it has to be the root element.
  it('refuses a document that merely contains an svg', () => {
    expect(
      detectSvgMimeType(
        text('<!doctype html><html><body><script>alert(1)</script><svg/></body></html>'),
      ),
    ).toBeNull()
    expect(detectSvgMimeType(text('<html><svg></svg></html>'))).toBeNull()
    expect(detectSvgMimeType(text('not markup at all'))).toBeNull()
  })

  it('is not fooled by a tag that merely starts with svg', () => {
    expect(detectSvgMimeType(text('<svgfoo></svgfoo>'))).toBeNull()
  })
})

describe('supporting values', () => {
  it('narrows a content-type string', () => {
    expect(isImageMediaType('image/png')).toBe(true)
    expect(isImageMediaType('image/gif')).toBe(false)
  })

  it('maps every supported type to an extension the accept list allows', () => {
    for (const [mime, extension] of Object.entries(mimeToExtension)) {
      expect(isImageMediaType(mime)).toBe(true)
      expect(allowedExtensions.has(extension)).toBe(true)
    }
  })

  it('offers a screenshot cap in bytes', () => {
    expect(screenshotUploadMaxBytes).toBe(5 * 1024 * 1024)
  })
})
