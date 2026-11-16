import { describe, expect, it } from 'vitest'
import { isDiscordInviteUrl } from './invite-url.js'

describe('isDiscordInviteUrl', () => {
  it('accepts both invite forms', () => {
    expect(isDiscordInviteUrl('https://discord.gg/abc123')).toBe(true)
    expect(isDiscordInviteUrl('https://discord.gg/abc-123/')).toBe(true)
    expect(isDiscordInviteUrl('https://discord.com/invite/abc123')).toBe(true)
    expect(isDiscordInviteUrl('https://discordapp.com/invite/abc123')).toBe(true)
    expect(isDiscordInviteUrl('https://www.discord.com/invite/abc123')).toBe(true)
    expect(isDiscordInviteUrl('http://DISCORD.GG/abc123')).toBe(true)
  })

  // A link that is on Discord but is not an invite sends a visitor somewhere they cannot join from.
  it('refuses Discord URLs that are not invites', () => {
    expect(isDiscordInviteUrl('https://discord.com/channels/1/2')).toBe(false)
    expect(isDiscordInviteUrl('https://discord.com/abc123')).toBe(false)
    expect(isDiscordInviteUrl('https://discord.gg/')).toBe(false)
    expect(isDiscordInviteUrl('https://discord.gg/abc/def')).toBe(false)
    expect(isDiscordInviteUrl('https://discord.com/invite/')).toBe(false)
  })

  // The trap: a host test that is a suffix or substring match lets a lookalike domain through.
  it('refuses lookalike hosts', () => {
    expect(isDiscordInviteUrl('https://discord.gg.example.test/abc123')).toBe(false)
    expect(isDiscordInviteUrl('https://notdiscord.gg/abc123')).toBe(false)
    expect(isDiscordInviteUrl('https://example.test/discord.gg/abc123')).toBe(false)
  })

  it('refuses anything that is not an http(s) URL', () => {
    expect(isDiscordInviteUrl('javascript:alert(1)//discord.gg/abc')).toBe(false)
    expect(isDiscordInviteUrl('discord.gg/abc123')).toBe(false)
    expect(isDiscordInviteUrl('')).toBe(false)
  })
})
