// twitch.tv/<first-segment> is a channel only when the segment isn't one of Twitch's own routes -
// twitch.tv/videos/123456789 is a VOD, and reading "videos" as a login links to a channel that
// doesn't exist. A channel page's own sub-pages (twitch.tv/name/videos) still resolve to the name.
const twitchReservedRoutes = new Set([
  'videos',
  'directory',
  'settings',
  'downloads',
  'jobs',
  'store',
  'subs',
  'prime',
  'popout',
  'team',
  'collections',
  'u',
  'p',
])

/** What a free-text stream field resolves to: an embeddable channel or video, or a plain link. */
export type StreamTarget =
  | { kind: 'twitch'; channel: string }
  | { kind: 'youtube'; videoId: string }
  | { kind: 'link'; url: string }

/**
 * Parses whatever a stream field holds - a bare Twitch channel name, a twitch.tv, youtu.be or
 * youtube.com URL, or any other link - into a target that can be embedded or linked.
 *
 * ```ts
 * parseStream('twitch.tv/abc')          // { kind: 'twitch', channel: 'abc' }
 * parseStream('youtu.be/dQw4w9WgXcQ')   // { kind: 'youtube', videoId: 'dQw4w9WgXcQ' }
 * parseStream('javascript://%0aalert(1)') // null
 * ```
 *
 * Run the write path through this too, not just the renderer: only http(s) survives parsing, so a
 * value that saves is a value that renders, and nothing executable ever reaches an href.
 */
export const parseStream = (raw: string): StreamTarget | null => {
  const trimmed = raw.trim()

  if (!trimmed) return null
  if (/^\w{3,25}$/.test(trimmed) && !twitchReservedRoutes.has(trimmed.toLowerCase()))
    return { kind: 'twitch', channel: trimmed }

  let url: URL

  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  // Only http(s) reaches the href/embed. Without this, a value like `javascript://%0aalert(1)`
  // parses cleanly and falls through to the link fallback, rendering as an executable href.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.replace(/^(www|m)\./, '')
  const segments = url.pathname.split('/').filter(Boolean)

  if (host === 'twitch.tv' && segments[0] && !twitchReservedRoutes.has(segments[0].toLowerCase()))
    return { kind: 'twitch', channel: segments[0] }
  if (host === 'youtu.be' && segments[0]) return { kind: 'youtube', videoId: segments[0] }

  if (host === 'youtube.com') {
    const v = url.searchParams.get('v')

    if (v) return { kind: 'youtube', videoId: v }
    if ((segments[0] === 'live' || segments[0] === 'embed') && segments[1])
      return { kind: 'youtube', videoId: segments[1] }
  }

  return { kind: 'link', url: url.href }
}

/** The canonical watch URL for a parsed target. */
export const streamUrl = (target: StreamTarget): string =>
  target.kind === 'twitch'
    ? `https://twitch.tv/${target.channel}`
    : target.kind === 'youtube'
      ? `https://youtube.com/watch?v=${target.videoId}`
      : target.url

/** Whether a value would render as something. Empty is NOT valid - clearing has its own path. */
export const isRenderableStream = (raw: string): boolean => parseStream(raw) !== null
