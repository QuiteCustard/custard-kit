import { isRecord } from '@quitecustard/core/utils/is-record'

// start.gg OAuth 2.0 (authorization-code, confidential client) used to VERIFY that a logged-in user
// actually owns a start.gg account, and to read the identity an import can be keyed on.
// Docs: https://developer.start.gg/docs/oauth/oauth-overview/
//   authorize:  https://start.gg/oauth/authorize
//   token:      https://api.start.gg/oauth/access_token
//   scope:      user.identity (enables the `currentUser` query + all public fields)
// Unlike the personal-access-token helper (fetch-start-gg-graphql), every call here is made AS the
// user, with the short-lived access token minted for them by the token exchange below.

/** Where to send the user to approve the app. */
export const startggAuthorizeUrl = 'https://start.gg/oauth/authorize'
/** Where the authorization code is exchanged for an access token. */
export const startggTokenUrl = 'https://api.start.gg/oauth/access_token'
/** The GraphQL endpoint both the user-scoped and token-scoped clients call. */
export const startggGraphQLUrl = 'https://api.start.gg/gql/alpha'

/**
 * The only scope requested: read-only access to the user's own identity. Not `user.email`, not the
 * `tournament.*` scopes - proving account ownership and reading the player id and slug needs
 * neither, and asking for more is a consent screen the user can refuse.
 */
export const startggScope = 'user.identity'

/** The part of a start.gg identity worth storing: the global player id + user slug. */
export interface StartggIdentity {
  /** Global start.gg player id - the stable key to store and match an imported entrant on. */
  playerId: number
  /** start.gg user slug in `user/xxxx` form, or undefined if start.gg omits it. */
  slug: string | undefined
  /** The user's current gamerTag, or undefined where start.gg omits it. */
  gamerTag: string | undefined
}

/**
 * OAuth app credentials, each falling back to its environment variable when omitted.
 */
export type StartggOauthAuth = { clientId?: string; clientSecret?: string }

/**
 * Exchanges an authorization code for the user's access token. Throws on any failure so a callback
 * route can bounce to its error page - a failed exchange must never read as a successful link.
 */
export const exchangeStartggCode = async (
  code: string,
  redirectUri: string,
  auth: StartggOauthAuth = {},
): Promise<string> => {
  const clientId = auth.clientId ?? process.env.STARTGG_OAUTH_CLIENT_ID
  const clientSecret = auth.clientSecret ?? process.env.STARTGG_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret || !redirectUri)
    throw new Error(
      'No start.gg OAuth credentials: pass `clientId`/`clientSecret` or set STARTGG_OAUTH_CLIENT_ID / STARTGG_OAUTH_CLIENT_SECRET',
    )

  const response = await fetch(startggTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope: startggScope,
    }),
    // This call sits in the middle of a login, so a hung socket strands the user on the redirect
    // until the platform timeout kills the function.
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok)
    throw new Error(`start.gg token exchange failed: ${response.status} ${response.statusText}`)

  const data: unknown = await response.json()

  if (
    !data ||
    typeof data !== 'object' ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token
  )
    throw new Error('start.gg token exchange returned unexpected response shape')

  return data.access_token
}

/**
 * Reads the authenticated user's identity via the `currentUser` GraphQL query, called with THEIR
 * access token (so the returned player id/slug provably belongs to whoever completed the OAuth flow -
 * this is the ownership proof). Throws unless a usable player id comes back.
 */
export const fetchStartggIdentity = async (accessToken: string): Promise<StartggIdentity> => {
  const response = await fetch(startggGraphQLUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { currentUser { id slug player { id gamerTag } } }`,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok)
    throw new Error(`start.gg currentUser fetch failed: ${response.status} ${response.statusText}`)

  const json: unknown = await response.json()

  const data = isRecord(json) ? json.data : undefined
  const current = isRecord(data) ? data.currentUser : undefined
  const player = isRecord(current) && isRecord(current.player) ? current.player : undefined
  const playerId = player?.id

  // No linked player means there is nothing an import could ever match on - treat as a failed link
  // rather than storing a useless slug.
  if (typeof playerId !== 'number') throw new Error('start.gg currentUser returned no player id')

  return {
    playerId,
    slug: isRecord(current) && typeof current.slug === 'string' ? current.slug : undefined,
    gamerTag: typeof player?.gamerTag === 'string' ? player.gamerTag : undefined,
  }
}
