import { describe, expect, it } from 'vitest'
import { discordWebhookRe, validateDiscordWebhookUrl } from './webhook-url.js'

describe('validateDiscordWebhookUrl', () => {
  it('accepts a real webhook URL on any Discord host', () => {
    expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc-DEF_456')).toBe(true)
    expect(validateDiscordWebhookUrl('https://canary.discord.com/api/webhooks/123/abc')).toBe(true)
    expect(validateDiscordWebhookUrl('https://ptb.discord.com/api/webhooks/123/abc')).toBe(true)
  })

  // The field is editable, so without this it could be pointed at an internal service - the cloud
  // metadata endpoint being the classic target.
  it.each([
    ['another host', 'https://evil.test/api/webhooks/123/abc'],
    ['plain http', 'http://discord.com/api/webhooks/123/abc'],
    ['no id or token', 'https://discord.com/api/webhooks/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data'],
    ['a lookalike host', 'https://discord.com.evil.test/api/webhooks/123/abc'],
    ['a subdomain trick', 'https://evil.test/discord.com/api/webhooks/123/abc'],
    ['a non-numeric id', 'https://discord.com/api/webhooks/abc/def'],
  ])('refuses %s', (_label, value) => {
    expect(typeof validateDiscordWebhookUrl(value)).toBe('string')
  })

  it('treats empty as somebody else’s problem', () => {
    expect(validateDiscordWebhookUrl('')).toBe(true)
    expect(validateDiscordWebhookUrl(null)).toBe(true)
    expect(validateDiscordWebhookUrl(undefined)).toBe(true)
  })
})

describe('discordWebhookRe', () => {
  // Exported so a send-time re-check can use the same rule the field was validated with, rather
  // than a second copy that could drift.
  it('is the same pattern the validator applies', () => {
    expect(discordWebhookRe.test('https://discord.com/api/webhooks/123/abc')).toBe(true)
    expect(discordWebhookRe.test('https://evil.test/x')).toBe(false)
  })

  // A `g`-flagged regex carries lastIndex between calls, so alternate tests would fail.
  it('gives the same answer on repeated calls', () => {
    const url = 'https://discord.com/api/webhooks/123/abc'

    expect([
      discordWebhookRe.test(url),
      discordWebhookRe.test(url),
      discordWebhookRe.test(url),
    ]).toEqual([true, true, true])
  })
})
