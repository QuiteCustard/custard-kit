import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { verifyInteractionSignature } from './verify-interaction.js'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')

/** The app's public key as Discord publishes it: bare 32-byte hex, not SPKI. */
const publicKeyHex = Buffer.from(
  publicKey.export({ format: 'der', type: 'spki' }).subarray(12),
).toString('hex')

const signBody = (timestamp: string, rawBody: string) =>
  sign(null, Buffer.from(timestamp + rawBody), privateKey).toString('hex')

const timestamp = '1755777600'
const rawBody = JSON.stringify({ type: 1 })
const signature = signBody(timestamp, rawBody)

const verify = (over: { body?: string; sig?: string; ts?: string; key?: string } = {}) =>
  verifyInteractionSignature(over.body ?? rawBody, over.sig ?? signature, over.ts ?? timestamp, {
    publicKey: over.key ?? publicKeyHex,
  })

describe('verifyInteractionSignature', () => {
  it('accepts a genuine signature', () => {
    expect(verify()).toBe(true)
  })

  it('accepts a second, different payload signed with the same key', () => {
    const body = JSON.stringify({ type: 2, data: { name: 'ping' } })

    expect(verify({ body, sig: signBody(timestamp, body) })).toBe(true)
  })

  // The signed payload is timestamp + body. Either half changing must invalidate it, or a captured
  // signature could be replayed against different content.
  it('refuses a tampered body', () => {
    expect(verify({ body: JSON.stringify({ type: 2 }) })).toBe(false)
  })

  it('refuses a tampered timestamp', () => {
    expect(verify({ ts: '1755777601' })).toBe(false)
  })

  it('refuses a signature from a different key', () => {
    const other = generateKeyPairSync('ed25519')
    const otherSig = sign(null, Buffer.from(timestamp + rawBody), other.privateKey).toString('hex')

    expect(verify({ sig: otherSig })).toBe(false)
  })

  it('refuses a valid signature checked against the wrong app key', () => {
    const other = generateKeyPairSync('ed25519')
    const otherHex = Buffer.from(
      other.publicKey.export({ format: 'der', type: 'spki' }).subarray(12),
    ).toString('hex')

    expect(verify({ key: otherHex })).toBe(false)
  })

  // Buffer.from(x, 'hex') silently DROPS invalid characters rather than throwing, so without the
  // length and charset checks a junk signature would be truncated into a short buffer and compared
  // instead of rejected outright.
  it.each([
    ['empty', ''],
    ['too short', 'ab'],
    ['too long', `${'a'.repeat(129)}`],
    ['non-hex of the right length', 'z'.repeat(128)],
    ['hex with junk mixed in', `${'a'.repeat(127)}!`],
  ])('refuses a malformed signature: %s', (_label, sig) => {
    expect(verify({ sig })).toBe(false)
  })

  // Saving the Interactions Endpoint URL sends deliberately INVALID signatures, and Discord only
  // accepts the endpoint if every one is rejected. Failing open here fails the setup outright.
  it('fails closed when the app key is missing or malformed', () => {
    expect(verify({ key: '' })).toBe(false)
    expect(verify({ key: 'not-hex' })).toBe(false)
    expect(verify({ key: 'ab'.repeat(16) })).toBe(false)
    expect(verify({ key: 'z'.repeat(64) })).toBe(false)
  })

  it('returns false rather than throwing on any of it', () => {
    expect(() => verify({ sig: 'z'.repeat(128), key: 'q'.repeat(64) })).not.toThrow()
  })

  // The key is cached per hex string, so a second app's key must not be answered from the first's
  // slot - and a repeat call with a good key must still verify.
  it('caches per key without crossing two apps over', () => {
    const other = generateKeyPairSync('ed25519')
    const otherHex = Buffer.from(
      other.publicKey.export({ format: 'der', type: 'spki' }).subarray(12),
    ).toString('hex')
    const otherSig = sign(null, Buffer.from(timestamp + rawBody), other.privateKey).toString('hex')

    expect(verify()).toBe(true)
    expect(verify({ key: otherHex, sig: otherSig })).toBe(true)
    expect(verify()).toBe(true)
    expect(verify({ key: otherHex })).toBe(false)
  })

  it('keeps failing closed on a repeat call with a bad key', () => {
    expect(verify({ key: 'bad' })).toBe(false)
    expect(verify({ key: 'bad' })).toBe(false)
  })

  // The cache is keyed by the key STRING, not held in one slot, so a malformed key cached as a
  // failure does not poison the next call once the key is corrected - no restart needed.
  it('accepts a corrected key straight after a malformed one', () => {
    expect(verify({ key: 'z'.repeat(64) })).toBe(false)
    expect(verify()).toBe(true)
  })

  it('accepts a key supplied after a missing one, which is never cached', () => {
    expect(verify({ key: '' })).toBe(false)
    expect(verify()).toBe(true)
  })

  it('handles an empty body, which a malformed request can send', () => {
    expect(verify({ body: '', sig: signBody(timestamp, '') })).toBe(true)
    expect(verify({ body: '' })).toBe(false)
  })
})
