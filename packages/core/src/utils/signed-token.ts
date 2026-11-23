import { base64urlToBytes, bytesToBase64url } from './base64url.js'
import { isRecord } from './is-record.js'

const minimumSecretLength = 32
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const hmacKey = async (secret: string) => {
  if (secret.length < minimumSecretLength)
    throw new Error(`Token secret must be at least ${minimumSecretLength} characters`)

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Signs a JSON value until `expiresAt` with HMAC-SHA256, for state a client carries between server
 * calls. The client can read the value but not change it, so nothing secret belongs in it. The same
 * value, expiry and secret always sign to the same token, so an expiry worked out from the value
 * rather than the clock gives a stable, cacheable token. Web Crypto only: runs on Node, edge
 * runtimes and in the browser. The secret must be at least 32 characters.
 */
export const signToken = async (
  value: unknown,
  expiresAt: Date,
  secret: string,
): Promise<string> => {
  const envelope = { v: value, exp: Math.floor(expiresAt.getTime() / 1000) }
  const body = bytesToBase64url(encoder.encode(JSON.stringify(envelope)))
  const key = await hmacKey(secret)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))

  return `${body}.${bytesToBase64url(signature)}`
}

/** What `readToken` checks a token against. */
export interface ReadTokenOptions {
  /** The secret the token was signed with. */
  secret: string
  /** The time to check the expiry against. */
  now: Date
}

/**
 * The value `signToken` signed, or null when the token is not a string, is malformed, was signed
 * with another secret, was changed after signing, or has expired. The value comes back as
 * `unknown`: narrow it before use.
 */
export const readToken = async (
  token: unknown,
  { secret, now }: ReadTokenOptions,
): Promise<unknown> => {
  if (typeof token !== 'string') return null

  const [body, signatureText, extra] = token.split('.')
  if (body === undefined || signatureText === undefined || extra !== undefined) return null

  const signature = base64urlToBytes(signatureText)
  const bodyBytes = base64urlToBytes(body)
  if (!signature || !bodyBytes) return null

  const key = await hmacKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(body))
  if (!valid) return null

  let envelope: unknown

  try {
    envelope = JSON.parse(decoder.decode(bodyBytes))
  } catch {
    return null
  }

  if (!isRecord(envelope) || typeof envelope.exp !== 'number') return null
  if (envelope.exp <= Math.floor(now.getTime() / 1000)) return null

  return envelope.v ?? null
}
