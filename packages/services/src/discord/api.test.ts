import { describe, expect, it } from 'vitest'
import { discordApiBase } from './api.js'

describe('discordApiBase', () => {
  // Pinned to a version: Discord's unversioned base redirects to whatever is current, so a silent
  // major bump would change response shapes under the clients built on it.
  it('names an explicit API version on Discord’s own host', () => {
    expect(discordApiBase).toBe('https://discord.com/api/v10')
    expect(new URL(discordApiBase).protocol).toBe('https:')
  })

  it('has no trailing slash, since every caller concatenates a rooted path', () => {
    expect(discordApiBase.endsWith('/')).toBe(false)
    expect(`${discordApiBase}/users/@me`).toBe('https://discord.com/api/v10/users/@me')
  })
})
