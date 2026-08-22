import { describe, expect, it } from 'vitest'
import { validateTwitchChannel } from './channel.js'

describe('validateTwitchChannel', () => {
  it('accepts a bare login', () => {
    expect(validateTwitchChannel('examplestreamer')).toBe(true)
    expect(validateTwitchChannel('abc')).toBe(true)
    expect(validateTwitchChannel('a_b_1')).toBe(true)
    expect(validateTwitchChannel('a'.repeat(25))).toBe(true)
  })

  // The field holds a login, not a link - a pasted URL would be sent to Helix as a channel name and
  // silently match nothing.
  it('refuses a URL rather than accepting the whole thing as a name', () => {
    expect(typeof validateTwitchChannel('https://twitch.tv/abc')).toBe('string')
    expect(typeof validateTwitchChannel('twitch.tv/abc')).toBe('string')
  })

  it('refuses names outside Twitch’s own length limits', () => {
    expect(typeof validateTwitchChannel('ab')).toBe('string')
    expect(typeof validateTwitchChannel('a'.repeat(26))).toBe('string')
  })

  it('refuses characters a Twitch login cannot contain', () => {
    expect(typeof validateTwitchChannel('a-b')).toBe('string')
    expect(typeof validateTwitchChannel('a b')).toBe('string')
    expect(typeof validateTwitchChannel('a.b')).toBe('string')
    expect(typeof validateTwitchChannel('@abc')).toBe('string')
  })

  it('asks for a value when there is none', () => {
    expect(validateTwitchChannel('')).toBe('Channel name required')
    expect(validateTwitchChannel(null)).toBe('Channel name required')
    expect(validateTwitchChannel(undefined)).toBe('Channel name required')
  })
})
