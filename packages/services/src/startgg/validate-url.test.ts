import { describe, expect, it } from 'vitest'
import { validateStartggTournamentUrl, validateStartggUrl } from './validate-url.js'

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

describe('validateStartggTournamentUrl', () => {
  it('parses a tournament URL into its slug', () => {
    expect(validateStartggTournamentUrl('https://start.gg/tournament/abc')).toEqual({
      tournamentSlug: 'abc',
    })
    expect(validateStartggTournamentUrl('https://www.start.gg/tournament/abc-2_x/')).toEqual({
      tournamentSlug: 'abc-2_x',
    })
  })

  it('reads any page beneath a tournament as that tournament', () => {
    expect(validateStartggTournamentUrl('https://start.gg/tournament/abc/details')).toEqual({
      tournamentSlug: 'abc',
    })
    expect(
      validateStartggTournamentUrl('https://start.gg/tournament/abc/event/singles/brackets/1/2'),
    ).toEqual({ tournamentSlug: 'abc' })
    expect(validateStartggTournamentUrl('https://start.gg/tournament/abc?tab=events#top')).toEqual({
      tournamentSlug: 'abc',
    })
  })

  // A URL that merely CONTAINS "start.gg/tournament/x" is not a start.gg URL: the host decides.
  it('refuses another host, however the path reads', () => {
    expect(validateStartggTournamentUrl('https://evil.test/start.gg/tournament/abc')).toBe(
      'Invalid Start.gg URL: domain must be start.gg',
    )
    expect(validateStartggTournamentUrl('https://start.gg.evil.test/tournament/abc')).toBe(
      'Invalid Start.gg URL: domain must be start.gg',
    )
  })

  it('refuses a URL that names no tournament', () => {
    expect(typeof validateStartggTournamentUrl('https://start.gg/tournament')).toBe('string')
    expect(typeof validateStartggTournamentUrl('https://start.gg/user/xyz')).toBe('string')
    expect(typeof validateStartggTournamentUrl('https://start.gg/')).toBe('string')
  })

  it('refuses malformed input', () => {
    expect(validateStartggTournamentUrl('not a url')).toBe('Invalid URL format')
    expect(validateStartggTournamentUrl(`https://start.gg/tournament/${'a'.repeat(600)}`)).toBe(
      'Invalid Start.gg URL: URL too long',
    )
  })

  // The slug is interpolated into an API query, so anything outside [\w-] is refused.
  it('refuses a slug with characters outside the allowlist', () => {
    expect(validateStartggTournamentUrl('https://start.gg/tournament/a b')).toBe(
      'Invalid Start.gg URL: slug contains invalid characters',
    )
  })
})
