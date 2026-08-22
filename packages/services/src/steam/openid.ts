import { isSteamID } from './id.js'

// Steam authenticates via OpenID 2.0 ("Sign in through Steam"), not OAuth2. The user is redirected
// to Steam, approves, and is sent back to the caller's return_to URL with a signed assertion whose
// `openid.claimed_id` carries their SteamID64.
const steamOpenidEndpoint = 'https://steamcommunity.com/openid/login'
const openidNs = 'http://specs.openid.net/auth/2.0'
// Ask Steam to pick the identity (the user's own account) rather than the caller asserting one.
const identifierSelect = 'http://specs.openid.net/auth/2.0/identifier_select'

/**
 * Builds the Steam OpenID authorization URL to redirect the user to.
 * @param returnTo The absolute callback URL Steam sends the user back to (must be host-allowlisted).
 * @param realm The origin the request is trusted for (usually the scheme+host of `returnTo`).
 */
export const buildAuthUrl = (returnTo: string, realm: string): string => {
  const params = new URLSearchParams({
    'openid.ns': openidNs,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': identifierSelect,
    'openid.claimed_id': identifierSelect,
  })

  return `${steamOpenidEndpoint}?${params}`
}

// Steam answers check_authentication quickly; a stalled endpoint must not hang the callback route
// (same cap as the persona API in ./api).
const verifyTimeoutMs = 5000

// The OpenID 2.0 §10.1 mandatory signed set. check_authentication only vouches for the fields listed
// in `openid.signed`, so a field acted on that ISN'T signed would verify yet be attacker-
// substitutable. The whole mandatory set is required - most importantly `claimed_id`, the SteamID
// that gets linked, and `return_to`, which `expectedReturnTo` below compares against.
const requiredSignedFields = [
  'op_endpoint',
  'return_to',
  'response_nonce',
  'assoc_handle',
  'claimed_id',
  'identity',
]

/**
 * Verifies a Steam OpenID assertion by echoing its parameters back to Steam with
 * `openid.mode=check_authentication`. This is MANDATORY: without it the return_to parameters are
 * trivially forgeable, so `claimed_id` must never be trusted until Steam confirms `is_valid:true`.
 * Throws on a Steam timeout - callers treat that as a failed link.
 *
 * ```ts
 * const ok = await verifyAssertion(params, { expectedReturnTo: callbackUrl })
 * ```
 *
 * Pass `expectedReturnTo` - the exact `returnTo` given to {@link buildAuthUrl}. Steam signs
 * `return_to` but has no idea which relying party is entitled to the assertion, so an assertion
 * minted for a DIFFERENT site's callback verifies here just as happily as one minted for this one.
 * Comparing it is what refuses a replay from somewhere else.
 */
export const verifyAssertion = async (
  params: URLSearchParams,
  { expectedReturnTo }: { expectedReturnTo?: string } = {},
): Promise<boolean> => {
  // Structural checks before the round-trip: the assertion must be a positive response naming
  // Steam's own endpoint, and every field acted on must be covered by the signature.
  if (params.get('openid.mode') !== 'id_res') return false
  if (params.get('openid.op_endpoint') !== steamOpenidEndpoint) return false

  const signedFields = params.get('openid.signed')?.split(',') ?? []

  if (!requiredSignedFields.every((field) => signedFields.includes(field))) return false

  // Compared before the round-trip, so a foreign assertion costs nothing to reject.
  if (expectedReturnTo !== undefined && params.get('openid.return_to') !== expectedReturnTo)
    return false

  const body = new URLSearchParams(params)
  body.set('openid.mode', 'check_authentication')

  const response = await fetch(steamOpenidEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(verifyTimeoutMs),
  })

  if (!response.ok) return false

  // Steam replies with a key-value plain-text body containing `is_valid:true` or `is_valid:false`.
  const text = await response.text()
  return /^is_valid\s*:\s*true$/m.test(text)
}

// A verified assertion's claimed_id is always https://steamcommunity.com/openid/id/{steamid64}.
const claimedIdPattern = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

/**
 * Extracts and validates the SteamID64 from an OpenID `claimed_id`. Returns null if the shape is
 * unexpected or the id fails {@link isSteamID}. Only call this on a claimed_id that has already
 * passed {@link verifyAssertion}.
 */
export const extractSteamId64 = (claimedId: string | null | undefined): string | null => {
  if (!claimedId) return null

  const match = claimedId.match(claimedIdPattern)

  if (!match) return null

  return isSteamID(match[1]) ? match[1] : null
}
