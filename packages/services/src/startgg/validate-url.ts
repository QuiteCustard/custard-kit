// Allow-list for URL slug segments: letters, numbers, hyphens, underscores
const slugRegex = /^[\w-]+$/
const maxUrlLength = 500

// The path segments of a pasted start.gg URL, or the message explaining why it is not one.
const startggPath = (url: string): string[] | string => {
  if (url.length > maxUrlLength) return 'Invalid Start.gg URL: URL too long'

  let urlObj: URL

  try {
    urlObj = new URL(url)
  } catch {
    return 'Invalid URL format'
  }

  if (urlObj.hostname !== 'start.gg' && urlObj.hostname !== 'www.start.gg')
    return 'Invalid Start.gg URL: domain must be start.gg'

  return urlObj.pathname.split('/').filter(Boolean)
}

/** Optional refusals layered on top of the format checks. */
export type StartggUrlOptions = {
  /**
   * Event paths that must not be synced, each keyed as `tournament/<slug>/event/<slug>`. The check
   * runs against the raw pasted URL's path, so an event start.gg exposes under more than one
   * tournament slug needs every slug listed - a re-sync triggered from a stored URL uses whichever
   * slug was stored and otherwise slips past the block.
   */
  blockedEventSlugs?: ReadonlySet<string>
  /** Message returned for a blocked event. */
  blockedMessage?: string
}

/**
 * Parses a pasted start.gg event URL into its tournament and event slugs, or returns a message
 * explaining why it was rejected - so a form can show the string and a caller can branch on
 * `typeof result === 'string'`.
 *
 * ```ts
 * validateStartggUrl('https://start.gg/tournament/abc/event/singles')
 * // { tournamentSlug: 'abc', eventSlug: 'tournament/abc/event/singles' }
 * ```
 *
 * Rejects anything not on the start.gg host, over-long input, and slugs with characters outside
 * `[\w-]`, so the result is safe to interpolate into an API query.
 */
export const validateStartggUrl = (
  url: string,
  {
    blockedEventSlugs,
    blockedMessage = 'This tournament cannot be synced.',
  }: StartggUrlOptions = {},
): { tournamentSlug: string; eventSlug: string } | string => {
  const pathParts = startggPath(url)
  if (typeof pathParts === 'string') return pathParts

  if (pathParts[0] !== 'tournament' || pathParts[2] !== 'event' || pathParts.length < 4)
    return 'Invalid Start.gg URL format. Please provide an event URL (e.g. start.gg/tournament/.../event/...)'

  const slugParts = pathParts.slice(0, 4)

  if (!slugParts.every((part) => slugRegex.test(part)))
    return 'Invalid Start.gg URL: slug contains invalid characters'

  const eventSlug = slugParts.join('/')

  if (blockedEventSlugs?.has(eventSlug)) return blockedMessage

  return { tournamentSlug: pathParts[1], eventSlug }
}

/**
 * Parses a pasted start.gg tournament URL into its tournament slug, or returns a message explaining
 * why it was rejected. For a caller that lists a tournament's events itself, where
 * `validateStartggUrl` would refuse the URL for naming no event.
 *
 * ```ts
 * validateStartggTournamentUrl('https://start.gg/tournament/abc')
 * // { tournamentSlug: 'abc' }
 * ```
 *
 * Any page beneath the tournament is accepted and read as that tournament: its details, an event,
 * a bracket. The same host, length and `[\w-]` slug checks as `validateStartggUrl` apply, so the
 * slug is safe to interpolate into an API query.
 */
export const validateStartggTournamentUrl = (url: string): { tournamentSlug: string } | string => {
  const pathParts = startggPath(url)
  if (typeof pathParts === 'string') return pathParts

  const [section, tournamentSlug] = pathParts

  if (section !== 'tournament' || tournamentSlug === undefined)
    return 'Invalid Start.gg URL format. Please provide a tournament URL (e.g. start.gg/tournament/...)'

  if (!slugRegex.test(tournamentSlug))
    return 'Invalid Start.gg URL: slug contains invalid characters'

  return { tournamentSlug }
}
