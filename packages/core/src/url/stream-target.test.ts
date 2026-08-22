import { describe, expect, it } from 'vitest'
import { isRenderableStream, parseStream, streamUrl } from './stream-target.js'

describe('parseStream', () => {
  it('reads a bare channel name as Twitch', () => {
    expect(parseStream('examplestreamer')).toEqual({ kind: 'twitch', channel: 'examplestreamer' })
  })

  it('reads Twitch URLs with or without a scheme', () => {
    expect(parseStream('https://twitch.tv/abc')).toEqual({ kind: 'twitch', channel: 'abc' })
    expect(parseStream('twitch.tv/abc')).toEqual({ kind: 'twitch', channel: 'abc' })
    expect(parseStream('https://www.twitch.tv/abc')).toEqual({ kind: 'twitch', channel: 'abc' })
  })

  it('keeps the channel when a channel sub-page is pasted', () => {
    expect(parseStream('https://twitch.tv/abc/videos')).toEqual({ kind: 'twitch', channel: 'abc' })
    expect(parseStream('https://twitch.tv/abc/about')).toEqual({ kind: 'twitch', channel: 'abc' })
  })

  // twitch.tv/videos/123 is a VOD, not a channel called "videos" - linking to the latter 404s.
  it.each(['videos/123456789', 'directory/game/Chess', 'u/abc', 'settings/profile'])(
    'does not read the reserved route %s as a channel',
    (path) => {
      expect(parseStream(`https://twitch.tv/${path}`)?.kind).toBe('link')
    },
  )

  // A bare reserved word must not skip the check the URL-shaped input above gets.
  it.each(['videos', 'settings', 'directory'])(
    'does not read the bare reserved word %s as a channel',
    (word) => {
      expect(parseStream(word)?.kind).not.toBe('twitch')
    },
  )

  it('reads YouTube in each of its URL shapes', () => {
    expect(parseStream('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    })
    expect(parseStream('https://youtube.com/watch?v=abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
    })
    expect(parseStream('https://youtube.com/live/abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
    })
    expect(parseStream('https://youtube.com/embed/abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
    })
  })

  it('falls back to a plain link for any other http(s) URL', () => {
    expect(parseStream('https://kick.com/abc')).toEqual({
      kind: 'link',
      url: 'https://kick.com/abc',
    })
  })

  // The protocol check is the only thing between an editable field and an executable href.
  it.each(['javascript://%0aalert(1)', 'javascript:alert(1)', 'data:text/html,<script>'])(
    'refuses %s',
    (value) => {
      expect(parseStream(value)).toBeNull()
    },
  )

  it('refuses empty input', () => {
    expect(parseStream('')).toBeNull()
    expect(parseStream('   ')).toBeNull()
  })
})

describe('streamUrl', () => {
  it('builds the canonical watch URL for each kind', () => {
    expect(streamUrl({ kind: 'twitch', channel: 'abc' })).toBe('https://twitch.tv/abc')
    expect(streamUrl({ kind: 'youtube', videoId: 'abc' })).toBe('https://youtube.com/watch?v=abc')
    expect(streamUrl({ kind: 'link', url: 'https://kick.com/abc' })).toBe('https://kick.com/abc')
  })
})

describe('isRenderableStream', () => {
  it('answers whether a value would render as anything', () => {
    expect(isRenderableStream('twitch.tv/abc')).toBe(true)
    expect(isRenderableStream('')).toBe(false)
    expect(isRenderableStream('javascript:alert(1)')).toBe(false)
  })
})
