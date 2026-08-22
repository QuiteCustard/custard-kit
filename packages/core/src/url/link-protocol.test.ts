import { describe, expect, it } from 'vitest'
import { isHttpUrl, sanitiseHttpUrl, validateLinkUrl } from './link-protocol.js'

describe('validateLinkUrl', () => {
  it('allows the protocols an href may carry', () => {
    expect(validateLinkUrl('https://example.test/x')).toBe(true)
    expect(validateLinkUrl('http://example.test')).toBe(true)
    expect(validateLinkUrl('mailto:someone@example.test')).toBe(true)
    expect(validateLinkUrl('tel:+441234567890')).toBe(true)
  })

  it('allows root-relative paths and anchors', () => {
    expect(validateLinkUrl('/about')).toBe(true)
    expect(validateLinkUrl('/blog/2026/post?a=1#x')).toBe(true)
    expect(validateLinkUrl('#section')).toBe(true)
  })

  it('treats an empty value as somebody else’s problem', () => {
    expect(validateLinkUrl('')).toBe(true)
    expect(validateLinkUrl(null)).toBe(true)
    expect(validateLinkUrl(undefined)).toBe(true)
  })

  it('refuses executable protocols', () => {
    expect(typeof validateLinkUrl('javascript:alert(1)')).toBe('string')
    expect(typeof validateLinkUrl('data:text/html,<script>alert(1)</script>')).toBe('string')
    expect(typeof validateLinkUrl('vbscript:msgbox(1)')).toBe('string')
  })

  // A root-relative value that a browser resolves to another ORIGIN is an open redirect, and every
  // one of these has shipped in real applications behind a `startsWith('//')` check.
  it.each([
    ['scheme-relative', '//evil.test'],
    ['backslash', '/\\evil.test'],
    ['double backslash', '/\\\\evil.test'],
    ['tab smuggled', '/\t/evil.test'],
    ['newline smuggled', '/\n/evil.test'],
    ['backslash then slash', '/\\/evil.test'],
  ])('refuses an off-origin redirect: %s', (_label, value) => {
    expect(validateLinkUrl(value)).toBe('Invalid URL')
  })

  it('honours a caller’s protocol allowlist', () => {
    expect(validateLinkUrl('mailto:a@b.test', ['https:'])).not.toBe(true)
    expect(validateLinkUrl('https://a.test', ['https:'])).toBe(true)
  })
})

describe('isHttpUrl', () => {
  it('accepts only absolute http(s)', () => {
    expect(isHttpUrl('https://example.test')).toBe(true)
    expect(isHttpUrl('http://example.test')).toBe(true)
    expect(isHttpUrl('/about')).toBe(false)
    expect(isHttpUrl('mailto:a@b.test')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
  })
})

describe('sanitiseHttpUrl', () => {
  it('keeps an http(s) URL and collapses everything else', () => {
    expect(sanitiseHttpUrl('https://example.test/x')).toBe('https://example.test/x')
    expect(sanitiseHttpUrl('javascript:alert(1)')).toBe('')
    expect(sanitiseHttpUrl('@handle')).toBe('')
    expect(sanitiseHttpUrl(null)).toBe('')
    expect(sanitiseHttpUrl(undefined)).toBe('')
  })
})
