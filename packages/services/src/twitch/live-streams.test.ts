import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLiveStreams } from './live-streams.js'
import { captureConsole, stubFetch } from '@quitecustard/services/http.fixture.js'

// The app token is cached in module scope, keyed by client id, so every test mints against its own
// id rather than inheriting the previous test's cached token.
let nextClientId = 0
const freshAuth = () => ({ clientId: `client-${nextClientId++}`, clientSecret: 'secret' })

const tokenResponse = (accessToken = 'app-token', expiresIn = 3600) => ({
  body: { access_token: accessToken, expires_in: expiresIn },
})

const streamRow = (over: Record<string, unknown> = {}) => ({
  type: 'live',
  user_login: 'examplestreamer',
  user_name: 'ExampleStreamer',
  title: 'Ranked grind',
  viewer_count: 120,
  game_name: 'Chess',
  thumbnail_url: 'https://cdn.test/{width}x{height}.jpg',
  ...over,
})

const streamsResponse = (rows: unknown[]) => ({ body: { data: rows } })

beforeEach(() => {
  captureConsole()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getLiveStreams', () => {
  it('mints a token then queries Helix', async () => {
    const { requests } = stubFetch([tokenResponse(), streamsResponse([streamRow()])])

    const live = await getLiveStreams(['examplestreamer'], freshAuth())

    expect(requests[0]?.url).toBe('https://id.twitch.tv/oauth2/token')
    expect(requests[1]?.url).toContain('https://api.twitch.tv/helix/streams')
    expect(requests[1]?.headers.authorization).toBe('Bearer app-token')
    expect(live).toHaveLength(1)
  })

  it('maps a Helix row onto the shape it promises', async () => {
    stubFetch([tokenResponse(), streamsResponse([streamRow()])])

    await expect(getLiveStreams(['examplestreamer'], freshAuth())).resolves.toEqual([
      {
        login: 'examplestreamer',
        displayName: 'ExampleStreamer',
        title: 'Ranked grind',
        viewers: 120,
        game: 'Chess',
        thumbnailUrl: 'https://cdn.test/{width}x{height}.jpg',
      },
    ])
  })

  // Read field by field: a stream missing an optional field still renders.
  it('fills in defaults for fields Helix left out', async () => {
    stubFetch([tokenResponse(), streamsResponse([{ type: 'live', user_login: 'abc' }])])

    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([
      {
        login: 'abc',
        displayName: 'abc',
        title: '',
        viewers: 0,
        game: '',
        thumbnailUrl: '',
      },
    ])
  })

  // A row with no login is unlinkable, so it is dropped rather than rendered as a dead card.
  it('drops rows that are not live or carry no login', async () => {
    stubFetch([
      tokenResponse(),
      streamsResponse([
        streamRow(),
        streamRow({ type: 'vodcast' }),
        streamRow({ user_login: '' }),
        streamRow({ user_login: 42 }),
        null,
        'nonsense',
      ]),
    ])

    await expect(getLiveStreams(['examplestreamer'], freshAuth())).resolves.toHaveLength(1)
  })

  it('normalises, dedupes and drops blank channel names', async () => {
    const { requests } = stubFetch([tokenResponse(), streamsResponse([])])

    await getLiveStreams([' ExampleStreamer ', 'examplestreamer', '', '   '], freshAuth())

    const logins = new URL(requests[1]?.url ?? '').searchParams.getAll('user_login')

    expect(logins).toEqual(['examplestreamer'])
  })

  // Twitch caps user_login at 100 per request. The extras are DROPPED, not fetched in a second
  // call - so a caller passing more than a hundred channels silently gets a partial answer.
  it('clamps to 100 logins and does not page for the rest', async () => {
    const { requests, calls } = stubFetch([tokenResponse(), streamsResponse([])])
    const channels = Array.from({ length: 150 }, (_, i) => `channel${i}`)

    await getLiveStreams(channels, freshAuth())

    expect(new URL(requests[1]?.url ?? '').searchParams.getAll('user_login')).toHaveLength(100)
    expect(calls()).toBe(2)
  })

  it('makes no request at all for an empty channel list', async () => {
    const { calls } = stubFetch([tokenResponse()])

    await expect(getLiveStreams([], freshAuth())).resolves.toEqual([])
    expect(calls()).toBe(0)
  })

  // The caller is decorative UI, so every failure mode returns [] rather than throwing.
  it('returns an empty list rather than throwing on any failure', async () => {
    stubFetch([{ status: 500, statusText: 'Server Error' }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])

    stubFetch([{ body: { no_token: true } }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])

    stubFetch([tokenResponse(), { status: 500, statusText: 'Server Error' }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])

    stubFetch([{ throws: new Error('ECONNRESET') }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])

    stubFetch([tokenResponse(), { throws: new Error('ECONNRESET') }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])

    stubFetch([tokenResponse(), { body: { data: 'not an array' } }])
    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])
  })

  it('returns an empty list with no credentials', async () => {
    const { calls } = stubFetch([tokenResponse()])
    const previous = [process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET]

    delete process.env.TWITCH_CLIENT_ID
    delete process.env.TWITCH_CLIENT_SECRET

    await expect(getLiveStreams(['abc'])).resolves.toEqual([])
    expect(calls()).toBe(0)

    if (previous[0] !== undefined) process.env.TWITCH_CLIENT_ID = previous[0]
    if (previous[1] !== undefined) process.env.TWITCH_CLIENT_SECRET = previous[1]
  })

  // A warm serverless instance should mint one token, not one per request.
  it('reuses a cached token across calls', async () => {
    const auth = freshAuth()
    const { calls } = stubFetch([tokenResponse(), streamsResponse([]), streamsResponse([])])

    await getLiveStreams(['abc'], auth)
    await getLiveStreams(['abc'], auth)

    expect(calls()).toBe(3)
  })

  // An app token belongs to the app that minted it, so two callers using different credentials
  // must not share a slot.
  it('keys the cache per client id', async () => {
    const { requests } = stubFetch([
      tokenResponse('token-a'),
      streamsResponse([]),
      tokenResponse('token-b'),
      streamsResponse([]),
    ])

    await getLiveStreams(['abc'], freshAuth())
    await getLiveStreams(['abc'], freshAuth())

    expect(requests[1]?.headers.authorization).toBe('Bearer token-a')
    expect(requests[3]?.headers.authorization).toBe('Bearer token-b')
  })

  // A cached token can be revoked server-side before the local expiry.
  it('re-mints once on a 401 and retries the query', async () => {
    const { requests, calls } = stubFetch([
      tokenResponse('stale'),
      { status: 401, statusText: 'Unauthorized' },
      tokenResponse('fresh'),
      streamsResponse([streamRow()]),
    ])

    await expect(getLiveStreams(['examplestreamer'], freshAuth())).resolves.toHaveLength(1)
    expect(calls()).toBe(4)
    expect(requests[3]?.headers.authorization).toBe('Bearer fresh')
  })

  it('gives up rather than looping when the re-minted token is also refused', async () => {
    const { calls } = stubFetch([
      tokenResponse('stale'),
      { status: 401, statusText: 'Unauthorized' },
      tokenResponse('fresh'),
      { status: 401, statusText: 'Unauthorized' },
    ])

    await expect(getLiveStreams(['abc'], freshAuth())).resolves.toEqual([])
    expect(calls()).toBe(4)
  })

  // Refreshed a minute early, so an in-flight request never races the expiry.
  it('re-mints a token that is within a minute of expiring', async () => {
    const auth = freshAuth()
    const { calls } = stubFetch([
      tokenResponse('short', 30),
      streamsResponse([]),
      tokenResponse('next', 3600),
      streamsResponse([]),
    ])

    await getLiveStreams(['abc'], auth)
    await getLiveStreams(['abc'], auth)

    expect(calls()).toBe(4)
  })

  it('sends the client id Twitch requires alongside the token', async () => {
    const auth = freshAuth()
    const { requests } = stubFetch([tokenResponse(), streamsResponse([])])

    await getLiveStreams(['abc'], auth)

    expect(requests[1]?.headers['client-id']).toBe(auth.clientId)
  })
})
