import { describe, expect, it } from 'vitest'
import { validateStartggUrl } from './validate-url.js'

describe('validateStartggUrl', () => {
  it('parses an event URL into its two slugs', () => {
    expect(validateStartggUrl('https://start.gg/tournament/abc/event/singles')).toEqual({
      tournamentSlug: 'abc',
      eventSlug: 'tournament/abc/event/singles',
    })
  })

  it('accepts the www host', () => {
    expect(validateStartggUrl('https://www.start.gg/tournament/abc/event/singles')).toMatchObject({
      tournamentSlug: 'abc',
    })
  })

  it('ignores trailing path segments beyond the event', () => {
    expect(
      validateStartggUrl('https://start.gg/tournament/abc/event/singles/overview'),
    ).toMatchObject({ eventSlug: 'tournament/abc/event/singles' })
  })

  it('refuses another host', () => {
    expect(validateStartggUrl('https://evil.test/tournament/abc/event/singles')).toBe(
      'Invalid Start.gg URL: domain must be start.gg',
    )
  })

  it('refuses a URL that is not an event', () => {
    expect(typeof validateStartggUrl('https://start.gg/tournament/abc')).toBe('string')
    expect(typeof validateStartggUrl('https://start.gg/user/xyz')).toBe('string')
  })

  it('refuses malformed input', () => {
    expect(validateStartggUrl('not a url')).toBe('Invalid URL format')
    expect(validateStartggUrl(`https://start.gg/${'a'.repeat(600)}`)).toBe(
      'Invalid Start.gg URL: URL too long',
    )
  })

  // The slugs are interpolated into an API query, so anything outside [\w-] is refused.
  it('refuses slugs with characters outside the allowlist', () => {
    expect(validateStartggUrl('https://start.gg/tournament/a b/event/singles')).toBe(
      'Invalid Start.gg URL: slug contains invalid characters',
    )
  })

  it('applies a caller’s blocklist with a caller’s message', () => {
    const options = {
      blockedEventSlugs: new Set(['tournament/abc/event/singles']),
      blockedMessage: 'That event cannot be synced.',
    }

    expect(validateStartggUrl('https://start.gg/tournament/abc/event/singles', options)).toBe(
      'That event cannot be synced.',
    )
    expect(
      validateStartggUrl('https://start.gg/tournament/abc/event/doubles', options),
    ).toMatchObject({
      tournamentSlug: 'abc',
    })
  })

  it('has no blocklist of its own', () => {
    expect(validateStartggUrl('https://start.gg/tournament/abc/event/singles')).toMatchObject({
      tournamentSlug: 'abc',
    })
  })
})
