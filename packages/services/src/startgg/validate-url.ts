// Allow-list for URL slug segments: letters, numbers, hyphens, underscores
const slugRegex = /^[\w-]+$/
const maxUrlLength = 500

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
  if (url.length > maxUrlLength) return 'Invalid Start.gg URL: URL too long'

  let urlObj: URL

  try {
    urlObj = new URL(url)
  } catch {
    return 'Invalid URL format'
  }

  if (urlObj.hostname !== 'start.gg' && urlObj.hostname !== 'www.start.gg')
    return 'Invalid Start.gg URL: domain must be start.gg'

  const pathParts = urlObj.pathname.split('/').filter(Boolean)

  if (pathParts[0] !== 'tournament' || pathParts[2] !== 'event' || pathParts.length < 4)
    return 'Invalid Start.gg URL format. Please provide an event URL (e.g. start.gg/tournament/.../event/...)'

  const slugParts = pathParts.slice(0, 4)

  if (!slugParts.every((part) => slugRegex.test(part)))
    return 'Invalid Start.gg URL: slug contains invalid characters'

  const eventSlug = slugParts.join('/')

  if (blockedEventSlugs?.has(eventSlug)) return blockedMessage

  return { tournamentSlug: pathParts[1], eventSlug }
}
