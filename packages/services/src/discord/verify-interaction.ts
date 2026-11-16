import { createPublicKey, verify, type KeyObject } from 'node:crypto'

// Discord signs every interaction request with the application's Ed25519 key. The signed payload is
// the X-Signature-Timestamp header concatenated with the RAW request body, and the signature arrives
// hex-encoded in X-Signature-Ed25519 - so the route must verify before parsing, and must hand this
// the untouched body text (a re-serialised JSON.parse would not match byte for byte).
//
// This must never fail open: saving the Interactions Endpoint URL in the Developer Portal sends
// deliberately INVALID signatures, and Discord only accepts the endpoint if every one of them is
// rejected with a 401.
//
// DISCORD_APP_PUBLIC_KEY is the bare 32-byte key, while createPublicKey wants SPKI DER - hence the
// fixed 12-byte Ed25519 SPKI header (RFC 8410: SEQUENCE -> AlgorithmIdentifier id-Ed25519
// 1.3.101.112 -> BIT STRING). Web Crypto can import the raw key directly, but this path is
// synchronous and doesn't depend on the runtime's Ed25519 support in webcrypto.
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')
const hexRe = /^[0-9a-f]+$/i

// Unix seconds as Discord sends them: digits only, so `Number` cannot read a sign, an exponent or
// whitespace into a value that passes the age check.
const timestampRe = /^\d{1,12}$/

// Keyed by the raw hex so two apps' keys can't share a slot, and cached because a key is fixed for
// the life of an app. `null` records a MALFORMED key, so it fails closed without being re-parsed on
// every request. A missing key returns before this map is touched - there is no string to key a
// slot on - so correcting either one takes effect on the next call rather than at a restart.
const cachedKeys = new Map<string, KeyObject | null>()

const getPublicKey = (raw: string | undefined): KeyObject | null => {
  if (!raw) return null

  const cached = cachedKeys.get(raw)

  if (cached !== undefined) return cached

  const key =
    raw.length === 64 && hexRe.test(raw)
      ? createPublicKey({
          key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(raw, 'hex')]),
          format: 'der',
          type: 'spki',
        })
      : null

  cachedKeys.set(raw, key)

  return key
}

/**
 * Verifies a Discord interaction signature. Returns false rather than throwing on any malformed
 * input, so the caller can answer every bad request with a flat 401.
 *
 * `publicKey` is the app's hex Ed25519 key from the Developer Portal, falling back to
 * `DISCORD_APP_PUBLIC_KEY`. A missing or malformed key fails every request closed.
 *
 * A request whose timestamp is more than `maxAgeSeconds` (300 by default) from this machine's
 * clock is refused before the signature is looked at. The signature covers the timestamp, so
 * without the window a captured request stays valid forever.
 */
export const verifyInteractionSignature = (
  rawBody: string,
  signature: string,
  timestamp: string,
  {
    publicKey = process.env.DISCORD_APP_PUBLIC_KEY,
    maxAgeSeconds = 300,
  }: { publicKey?: string; maxAgeSeconds?: number } = {},
): boolean => {
  if (!timestampRe.test(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > maxAgeSeconds) return false

  const key = getPublicKey(publicKey)

  // The length/charset check is load-bearing, not belt-and-braces: Buffer.from(x, 'hex') silently
  // drops invalid characters instead of throwing, so a junk signature would otherwise be truncated
  // into a short buffer and compared rather than rejected outright.
  if (!key || signature.length !== 128 || !hexRe.test(signature)) return false

  try {
    // `null` is the required algorithm for Ed25519 - the hash is part of the scheme.
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
