import { isSteamID } from './id.js'

const playerSummariesEndpoint = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/'

// GetPlayerSummaries accepts up to 100 comma-separated SteamID64s per call.
const maxIdsPerCall = 100

// Cap each request so a slow/unresponsive Steam API can't hang a render (account page) or the OCR
// pipeline - callers treat a throw as "keep the stored name".
const requestTimeoutMs = 5000

/** A Steam account's current display name and profile link. */
export interface SteamPersona {
  personaName: string
  profileUrl: string
}

interface SummaryPlayer {
  steamid: string
  personaname: string
  profileurl: string
}

const parsePlayers = (data: unknown): SummaryPlayer[] => {
  if (
    !data ||
    typeof data !== 'object' ||
    !('response' in data) ||
    !data.response ||
    typeof data.response !== 'object' ||
    !('players' in data.response) ||
    !Array.isArray(data.response.players)
  )
    return []

  return data.response.players.filter(
    (p: unknown): p is SummaryPlayer =>
      typeof p === 'object' &&
      p !== null &&
      'steamid' in p &&
      typeof p.steamid === 'string' &&
      'personaname' in p &&
      typeof p.personaname === 'string',
  )
}

/** Steam Web API credentials. `apiKey` falls back to `STEAM_WEB_API_KEY` when omitted. */
export type SteamAuth = { apiKey?: string }

/**
 * Fetches current Steam persona names for a set of SteamID64s. Returns a map keyed by SteamID64;
 * ids that Steam doesn't return (private or deleted) are simply absent. Throws if the API key is
 * missing or a request fails - a caller that must not break should catch.
 */
export const fetchPersonaNames = async (
  steamIds: string[],
  auth: SteamAuth = {},
): Promise<Map<string, SteamPersona>> => {
  const result = new Map<string, SteamPersona>()
  const ids = [...new Set(steamIds.filter(isSteamID))]

  if (ids.length === 0) return result

  const key = auth.apiKey ?? process.env.STEAM_WEB_API_KEY

  if (!key) throw new Error('No Steam API key: pass `apiKey` or set STEAM_WEB_API_KEY')

  for (let i = 0; i < ids.length; i += maxIdsPerCall) {
    const batch = ids.slice(i, i + maxIdsPerCall)
    const url = `${playerSummariesEndpoint}?key=${key}&steamids=${batch.join(',')}`

    const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) })

    if (!response.ok)
      throw new Error(`Steam GetPlayerSummaries failed: ${response.status} ${response.statusText}`)

    for (const player of parsePlayers(await response.json())) {
      result.set(player.steamid, {
        personaName: player.personaname,
        profileUrl: typeof player.profileurl === 'string' ? player.profileurl : '',
      })
    }
  }

  return result
}
