import { describe, expect, it } from 'vitest'
import { bytesToBase64url } from './base64url.js'
import { readToken, signToken } from './signed-token.js'

const secret = 'test-secret-that-is-long-enough-to-pass'
const now = new Date('2026-11-19T12:00:00.000Z')
const inAMinute = new Date(now.getTime() + 60_000)

const encode = (value: unknown) => bytesToBase64url(new TextEncoder().encode(JSON.stringify(value)))

describe('signToken and readToken', () => {
  it('round-trip a value', async () => {
    const token = await signToken({ streak: 3, left: 'a' }, inAMinute, secret)

    expect(await readToken(token, { secret, now })).toEqual({ streak: 3, left: 'a' })
  })

  it('sign the same value and expiry to the same token', async () => {
    expect(await signToken({ a: 1 }, inAMinute, secret)).toBe(
      await signToken({ a: 1 }, inAMinute, secret),
    )
  })

  it('refuse a token signed with another secret', async () => {
    const token = await signToken({ streak: 3 }, inAMinute, secret)

    expect(await readToken(token, { secret: `${secret}-other`, now })).toBeNull()
  })

  // The value is readable by the client; only the signature stops it being rewritten.
  it('refuse a body changed after signing', async () => {
    const token = await signToken({ streak: 3 }, inAMinute, secret)
    const [, signature] = token.split('.')
    const forged = encode({ v: { streak: 99 }, exp: 9_999_999_999 })

    expect(await readToken(`${forged}.${signature}`, { secret, now })).toBeNull()
  })

  it('expire', async () => {
    const token = await signToken({ streak: 3 }, inAMinute, secret)
    const later = new Date(now.getTime() + 61_000)

    expect(await readToken(token, { secret, now: later })).toBeNull()
  })

  it('refuse malformed input', async () => {
    expect(await readToken(undefined, { secret, now })).toBeNull()
    expect(await readToken('a.b.c', { secret, now })).toBeNull()
    expect(await readToken('not base64!.x', { secret, now })).toBeNull()
  })

  it('refuse a short secret', async () => {
    await expect(signToken(1, inAMinute, 'short')).rejects.toThrow('at least 32')
  })
})
