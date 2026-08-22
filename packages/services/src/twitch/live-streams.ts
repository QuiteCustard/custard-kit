import { isRecord } from '@quitecustard/core/utils/is-record'

// Not `@twurple`: its api client carries its own auth-provider abstraction and token store, which
// is the wrong shape for a serverless function whose whole job is one Helix `streams` call per
// render. This module is that call plus a token cache.
//
// Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET. App tokens last ~60 days and are cached in
// module scope, so a warm serverless instance mints one token rather than one per request.

/** One currently-live channel, as Helix reports it. */
export type LiveStream = {
  /** Lower-cased Twitch login (matches what the editor typed, case-insensitively). */
  login: string
  /** Channel display name, e.g. "ExampleStreamer". */
  displayName: string
  /** Current stream title. */
  title: string
  /** Live viewer count. */
  viewers: number
  /** Category/game being streamed, when set. */
  game: string
  /** Stream thumbnail template URL (contains {width}/{height} placeholders). */
  thumbnailUrl: string
}

const tokenEndpoint = 'https://id.twitch.tv/oauth2/token'
const streamsEndpoint = 'https://api.twitch.tv/helix/streams'

// Twitch caps `user_login` at 100 per request, so the list is clamped rather than passed through -
// a caller is free to hand over more channels than one request can carry. Nothing here pages beyond
// the first hundred: the extras are dropped, not fetched in a second call.
const maxLogins = 100

type CachedToken = { value: string; expiresAt: number }

// Keyed by client id: an app token belongs to the app that minted it, so two callers using
// different credentials must not share a slot.
const cachedTokens = new Map<string, CachedToken>()

// Warn about absent credentials only once per process so a page full of these blocks doesn't spam
// logs.
let warnedMissingCredentials = false

/** Twitch app credentials. Each falls back to its environment variable when omitted. */
export type TwitchAuth = { clientId?: string; clientSecret?: string }

const credentials = (auth: TwitchAuth): { clientId: string; clientSecret: string } | null => {
  const clientId = auth.clientId ?? process.env.TWITCH_CLIENT_ID
  const clientSecret = auth.clientSecret ?? process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    if (!warnedMissingCredentials) {
      console.warn(
        '[twitch] no credentials: pass clientId/clientSecret or set TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET - returning no streams.',
      )
      warnedMissingCredentials = true
    }

    return null
  }

  return { clientId, clientSecret }
}

const mintToken = async (clientId: string, clientSecret: string): Promise<CachedToken | null> => {
  try {
    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error(`[twitch] token request failed: ${res.status} ${res.statusText}`)
      return null
    }

    const json: unknown = await res.json()

    if (!isRecord(json) || typeof json.access_token !== 'string' || !json.access_token) {
      console.error('[twitch] token response missing access_token')
      return null
    }

    // Refresh a minute early so an in-flight request never races the expiry.
    const ttlMs = (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000
    return { value: json.access_token, expiresAt: Date.now() + ttlMs - 60_000 }
  } catch (e) {
    console.error(`[twitch] token request errored: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

const getToken = async (
  clientId: string,
  clientSecret: string,
  forceRefresh = false,
): Promise<string | null> => {
  const cached = cachedTokens.get(clientId)

  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value

  const minted = await mintToken(clientId, clientSecret)

  if (minted) cachedTokens.set(clientId, minted)
  else cachedTokens.delete(clientId)

  return minted?.value ?? null
}

const queryStreams = async (
  logins: string[],
  clientId: string,
  token: string,
): Promise<Response | null> => {
  const params = new URLSearchParams()

  for (const login of logins) params.append('user_login', login)

  try {
    return await fetch(`${streamsEndpoint}?${params.toString()}`, {
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error(`[twitch] streams request errored: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// Helix rows are read field by field: a stream missing an optional field still renders, and a row
// with no login at all is dropped rather than surfacing an unlinkable card.
const parseStream = (row: unknown): LiveStream | null => {
  if (!isRecord(row) || row.type !== 'live') return null

  const login = typeof row.user_login === 'string' ? row.user_login.toLowerCase() : ''

  if (!login) return null

  return {
    login,
    displayName: typeof row.user_name === 'string' ? row.user_name : login,
    title: typeof row.title === 'string' ? row.title : '',
    viewers: typeof row.viewer_count === 'number' ? row.viewer_count : 0,
    game: typeof row.game_name === 'string' ? row.game_name : '',
    thumbnailUrl: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : '',
  }
}

/**
 * Which of `channels` are live right now. Helix only returns live channels, so an empty array means
 * nobody is streaming - render nothing.
 *
 * ```ts
 * const live = await getLiveStreams(['examplestreamer', 'anotherexample'])
 * ```
 *
 * Auth is the app-access-token flow: no user context, just a token minted from the client id and
 * secret, cached per client id and re-minted near expiry or on a 401. Pass `auth` to use explicit
 * credentials; each field falls back to `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`.
 *
 * ```ts
 * await getLiveStreams(channels, { clientId, clientSecret })
 * ```
 *
 * Never throws. Missing credentials, a failed token mint, a non-200 or a network error all return
 * `[]`, since the caller is decorative UI. Callers own the caching cadence.
 */
export const getLiveStreams = async (
  channels: string[],
  auth: TwitchAuth = {},
): Promise<LiveStream[]> => {
  const logins = Array.from(
    new Set(channels.map((c) => c.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, maxLogins)

  if (logins.length === 0) return []

  const creds = credentials(auth)

  if (!creds) return []

  const { clientId, clientSecret } = creds

  let token = await getToken(clientId, clientSecret)

  if (!token) return []

  let res = await queryStreams(logins, clientId, token)

  // A cached token can be revoked or expire server-side before the cached expiry; on 401 re-mint once.
  if (res?.status === 401) {
    token = await getToken(clientId, clientSecret, true)

    if (!token) return []

    res = await queryStreams(logins, clientId, token)
  }

  if (!res) return []

  if (!res.ok) {
    console.error(`[twitch] streams request failed: ${res.status} ${res.statusText}`)
    return []
  }

  const json: unknown = await res.json()
  const rows = isRecord(json) && Array.isArray(json.data) ? json.data : []

  return rows.flatMap((row) => parseStream(row) ?? [])
}
