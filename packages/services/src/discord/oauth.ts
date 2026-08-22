import { sleep } from '@quitecustard/core/utils/sleep'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { discordApiBase } from './api.js'

/** OAuth app credentials, each falling back to its environment variable when omitted. */
export type DiscordAppAuth = { appId?: string; clientSecret?: string }

/** Bot credentials. `botToken` falls back to `DISCORD_APP_TOKEN` when omitted. */
export type DiscordBotAuth = { botToken?: string }

/** The subset of a Discord user this client parses out and guarantees the shape of. */
export interface DiscordUser {
  id: string
  username: string
  global_name: string | null
}

const parseDiscordUser = (data: unknown): DiscordUser => {
  if (
    !data ||
    typeof data !== 'object' ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !data.id ||
    !('username' in data) ||
    typeof data.username !== 'string'
  )
    throw new Error('Discord user fetch returned unexpected response shape')

  return {
    id: data.id,
    username: data.username,
    global_name:
      'global_name' in data && typeof data.global_name === 'string' ? data.global_name : null,
  }
}

/**
 * Exchanges a Discord OAuth authorization code for an access token.
 * Throws if the exchange fails.
 */
export const exchangeCode = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
  auth: DiscordAppAuth = {},
): Promise<string> => {
  const clientId = auth.appId ?? process.env.DISCORD_APP_ID
  const clientSecret = auth.clientSecret ?? process.env.DISCORD_CLIENT_SECRET

  if (!clientId || !clientSecret || !redirectUri)
    throw new Error(
      'No Discord OAuth credentials: pass `appId`/`clientSecret` or set DISCORD_APP_ID / DISCORD_CLIENT_SECRET',
    )

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  // Same 10s ceiling as the bot lane: this call sits in the middle of a login, so a hung socket
  // strands the user on Discord's redirect until the platform timeout kills the function.
  const response = await fetch(`${discordApiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok)
    throw new Error(`Discord token exchange failed: ${response.status} ${response.statusText}`)

  const data: unknown = await response.json()

  if (
    !data ||
    typeof data !== 'object' ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token
  )
    throw new Error('Discord token exchange returned unexpected response shape')

  return data.access_token
}

// Retry-After is seconds by HTTP spec but may be an HTTP-date, which parseFloat reads as NaN - and
// a NaN slips past both the excessive-backoff refusal and the sleep, turning the whole policy into
// an immediate retry storm. Anything unreadable falls back to one second.
const retryAfterSeconds = (header: string | null): number => {
  const asNumber = parseFloat(header ?? '')

  if (Number.isFinite(asNumber)) return Math.max(0, asNumber)

  const asDate = Date.parse(header ?? '')

  if (Number.isFinite(asDate)) return Math.max(0, (asDate - Date.now()) / 1000)

  return 1
}

// Fail fast on a hung socket, and refuse outsized Retry-After backoffs, instead of stalling
// silently: a caller falls back on a throw, but never on a stall. Shared serverless egress IPs can
// get harsher rate-limit treatment from Discord and Cloudflare than a residential IP, and neither
// an awaited sleep nor a dead socket logs anything on its own - so every 429 is logged and a
// throttled environment is visible at a glance.
const fetchBotApi = async (
  path: string,
  what: string,
  auth: DiscordBotAuth,
  init?: { method: 'POST'; body: Record<string, unknown> },
): Promise<Response> => {
  const botToken = auth.botToken ?? process.env.DISCORD_APP_TOKEN

  // Without this the request goes out as `Bot undefined` and Discord answers 401, which reads as a
  // revoked token rather than a missing one.
  if (!botToken) throw new Error('No Discord bot token: pass `botToken` or set DISCORD_APP_TOKEN')

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${discordApiBase}${path}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        ...(init && { 'content-type': 'application/json' }),
      },
      ...(init && { method: init.method, body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status !== 429) return response

    const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'))
    console.warn(`[discord] 429 ${what} (attempt ${attempt + 1}/5, retry-after ${retryAfter}s)`)

    if (attempt === 4) break
    if (retryAfter > 30)
      throw new Error(`Discord rate limit with excessive Retry-After (${retryAfter}s)`)

    await sleep(retryAfter * 1000)
  }

  throw new Error('Discord rate limit exceeded after 5 attempts')
}

/**
 * A bot-token POST with the same 429/timeout discipline as the GET path - for the routes this
 * module doesn't wrap, such as opening a DM channel and posting to it.
 */
export const postBotApi = (
  path: string,
  body: Record<string, unknown>,
  what: string,
  auth: DiscordBotAuth = {},
): Promise<Response> => fetchBotApi(path, what, auth, { method: 'POST', body })

/**
 * NOTE: /users/{id} has one of Discord's stingiest per-route buckets - for bulk lookups, resolve
 * as many ids as possible via fetchGuildMemberUsernames first and keep this as the fallback.
 */
export const fetchDiscordUserById = async (
  userId: string,
  auth: DiscordBotAuth = {},
): Promise<DiscordUser> => {
  const response = await fetchBotApi(`/users/${userId}`, `fetching user ${userId}`, auth)

  if (!response.ok)
    throw new Error(`Discord user fetch failed: ${response.status} ${response.statusText}`)

  return parseDiscordUser(await response.json())
}

/**
 * Fetches every member of a guild as a Discord-user-id → username map via List Guild Members
 * (1000 per request), so a bulk lookup costs a handful of calls instead of one /users/{id} call
 * per person against that route's far stricter bucket. Requires the bot to be in the guild AND
 * the GUILD_MEMBERS privileged intent enabled for the app (Developer Portal toggle) - either
 * missing surfaces as a thrown 403. Entries that don't parse are skipped rather than failing the
 * whole list: the map is a positive cache, anyone absent just falls back to a per-id fetch.
 */
export const fetchGuildMemberUsernames = async (
  guildId: string,
  auth: DiscordBotAuth = {},
): Promise<Map<string, string>> => {
  const usernames = new Map<string, string>()
  let after = '0'

  // The page cap only guards against a cursor bug looping forever (100 pages = 100k members).
  for (let page = 0; page < 100; page++) {
    const cursorBefore = after

    const response = await fetchBotApi(
      `/guilds/${guildId}/members?limit=1000&after=${after}`,
      `listing members of guild ${guildId}`,
      auth,
    )

    if (!response.ok)
      throw new Error(`Discord guild member list failed: ${response.status} ${response.statusText}`)

    const data: unknown = await response.json()

    if (!Array.isArray(data))
      throw new Error('Discord guild member list returned unexpected response shape')

    for (const entry of data) {
      if (!isRecord(entry) || !isRecord(entry.user)) continue

      // Pages are sorted ascending by user id, so the cursor advances on ANY entry carrying an id -
      // not only the ones that parse. Advancing only on success would re-request the same page
      // forever when a whole page fails to parse.
      if (typeof entry.user.id === 'string') after = entry.user.id

      try {
        const user = parseDiscordUser(entry.user)
        usernames.set(user.id, user.username)
      } catch {
        // Unparseable member - leave them out, the caller's per-id fallback covers them.
      }
    }

    // A full page that moved no cursor would repeat forever; stop rather than spin.
    if (data.length < 1000 || after === cursorBefore) break
  }

  return usernames
}

/**
 * Parses a comma-separated guild list - members can be spread across several servers, and each is
 * queried in turn. Deduped, trimmed, empties removed. Defaults to `DISCORD_GUILD_IDS`.
 */
export const discordGuildIds = (raw = process.env.DISCORD_GUILD_IDS): string[] => [
  ...new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ),
]

/**
 * Resolves Discord ids to usernames by sweeping several guild member lists and merging them.
 *
 * Each guild is queried independently and its results merged (first hit wins), so a guild the bot
 * can't read - not a member, or the GUILD_MEMBERS intent is off - contributes nothing rather than
 * sinking the others (its error goes to `onGuildError`). Every guild list is a full paginated pull, so
 * the sweep stops as soon as every needed id is resolved. Ids still unresolved are the caller's to
 * cover with per-id `fetchDiscordUserById` fallbacks.
 *
 * @param guildIds Guilds to sweep, in preference order (see `discordGuildIds`).
 * @param neededIds The Discord ids to resolve.
 * @param onGuildError Called with the guild id and the error when one guild's list can't be read.
 * @returns A map of the resolved Discord ids to their usernames.
 */
export const resolveUsernamesAcrossGuilds = async (
  guildIds: string[],
  neededIds: Set<string>,
  onGuildError?: (guildId: string, err: unknown) => void,
  auth: DiscordBotAuth = {},
): Promise<Map<string, string>> => {
  const resolved = new Map<string, string>()

  for (const guildId of guildIds) {
    if (resolved.size >= neededIds.size) break

    try {
      const guildUsernames = await fetchGuildMemberUsernames(guildId, auth)

      for (const id of neededIds) {
        if (resolved.has(id)) continue

        const username = guildUsernames.get(id)

        if (username) resolved.set(id, username)
      }
    } catch (err) {
      onGuildError?.(guildId, err)
    }
  }

  return resolved
}

/**
 * The user behind an OAuth access token, from `/users/@me` - the identity step after `exchangeCode`.
 * Throws on a non-200 or an unexpected response shape.
 */
export const fetchDiscordUserByAccessToken = async (accessToken: string): Promise<DiscordUser> => {
  const response = await fetch(`${discordApiBase}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok)
    throw new Error(`Discord user fetch failed: ${response.status} ${response.statusText}`)

  return parseDiscordUser(await response.json())
}
