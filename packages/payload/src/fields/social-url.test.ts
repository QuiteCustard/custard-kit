import { describe, expect, it } from 'vitest'
import { normaliseSocialUrl, validateSocialUrl } from './social-url.js'
import { fieldHookArgs } from '@quitecustard/payload/payload.fixture.js'

const normalise = (value: unknown) => normaliseSocialUrl(fieldHookArgs({ value }))

describe('normaliseSocialUrl', () => {
  // Next's <Link> treats a bare host as a RELATIVE path, so an un-prefixed value would navigate to
  // /x.test/abc on the site's own domain.
  it('prefixes a bare host so it is not read as a relative path', () => {
    expect(normalise('x.test/abc')).toBe('https://x.test/abc')
    expect(normalise('www.x.test')).toBe('https://www.x.test')
  })

  it('leaves an absolute URL alone, whatever the scheme’s case', () => {
    expect(normalise('https://x.test/abc')).toBe('https://x.test/abc')
    expect(normalise('http://x.test/abc')).toBe('http://x.test/abc')
    expect(normalise('HTTPS://x.test')).toBe('HTTPS://x.test')
  })

  // Prefixing one would produce https://ftp://x.test - a valid https URL pointing at host `ftp`.
  // The validator is what refuses these; the hook must not quietly launder them first.
  it('does not prefix a value that already carries a scheme', () => {
    expect(normalise('ftp://x.test')).toBe('ftp://x.test')
  })

  // A port is not a scheme, so this still needs prefixing.
  it('prefixes a bare host carrying a port', () => {
    expect(normalise('x.test:8080/abc')).toBe('https://x.test:8080/abc')
  })

  it('trims, and keeps an empty value empty', () => {
    expect(normalise('  x.test  ')).toBe('https://x.test')
    expect(normalise('')).toBe('')
    expect(normalise('   ')).toBe('')
  })

  it('passes a non-string straight through', () => {
    expect(normalise(42)).toBe(42)
    expect(normalise(null)).toBeNull()
    expect(normalise(undefined)).toBeUndefined()
  })
})

describe('validateSocialUrl', () => {
  // `validate` runs BEFORE `beforeChange`, so it has to trim exactly as the hook does - otherwise a
  // pasted value is rejected for whitespace the hook would have fixed.
  it('accepts what the hook would store, whitespace included', () => {
    expect(validateSocialUrl('  https://x.test/abc  ')).toBe(true)
    expect(validateSocialUrl('  x.test/abc  ')).toBe(true)
  })

  it('treats empty as somebody else’s problem', () => {
    expect(validateSocialUrl('')).toBe(true)
    expect(validateSocialUrl('   ')).toBe(true)
    expect(validateSocialUrl(null)).toBe(true)
    expect(validateSocialUrl(undefined)).toBe(true)
  })

  it('refuses a value that is not a URL at all', () => {
    expect(typeof validateSocialUrl('not a url at all')).toBe('string')
    expect(typeof validateSocialUrl('http://')).toBe('string')
  })

  // `https://` + `ftp://x.test` parses as a perfectly good https URL whose HOST is `ftp`, so a
  // scheme-bearing value has to be judged on its own scheme rather than after prefixing.
  it('refuses a non-http(s) scheme instead of prefixing one', () => {
    expect(validateSocialUrl('ftp://x.test')).toBe('Must be an http(s) URL')
    expect(validateSocialUrl('file:///etc/passwd')).toBe('Must be an http(s) URL')
    expect(validateSocialUrl('  ftp://x.test  ')).toBe('Must be an http(s) URL')
  })

  it('refuses a scheme that does not survive prefixing either', () => {
    expect(validateSocialUrl('javascript:alert(1)')).toBe('Must be a valid URL')
  })

  // A port is not a scheme; testing for a bare colon would refuse a legitimate host.
  it('still accepts a bare host carrying a port', () => {
    expect(validateSocialUrl('x.test:8080/abc')).toBe(true)
  })
})
