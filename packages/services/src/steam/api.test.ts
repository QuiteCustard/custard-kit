import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPersonaNames } from './api.js'
import { stubFetch } from '@quitecustard/services/http.fixture.js'

const auth = { apiKey: 'steam-key' }

const id = (n: number) => String(76561198000000000n + BigInt(n))

const players = (ids: string[]) => ({
  body: {
    response: {
      players: ids.map((steamid) => ({
        steamid,
        personaname: `persona-${steamid.slice(-2)}`,
        profileurl: `https://steamcommunity.com/profiles/${steamid}/`,
      })),
    },
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPersonaNames', () => {
  it('maps SteamID64s to their persona and profile link', async () => {
    stubFetch([players([id(1)])])

    const map = await fetchPersonaNames([id(1)], auth)

    expect(map.get(id(1))).toEqual({
      personaName: 'persona-01',
      profileUrl: `https://steamcommunity.com/profiles/${id(1)}/`,
    })
  })

  it('makes no request for an empty or wholly invalid list', async () => {
    const { calls } = stubFetch([players([])])

    await expect(fetchPersonaNames([], auth)).resolves.toEqual(new Map())
    await expect(fetchPersonaNames(['123', '', 'not-an-id'], auth)).resolves.toEqual(new Map())
    expect(calls()).toBe(0)
  })

  it('drops ids that are not SteamID64s and dedupes the rest', async () => {
    const { requests } = stubFetch([players([id(1)])])

    await fetchPersonaNames([id(1), id(1), '123'], auth)

    expect(requests[0]?.url).toContain(`steamids=${id(1)}`)
    expect(requests[0]?.url).not.toContain(',')
  })

  // GetPlayerSummaries accepts at most 100 comma-separated ids per call.
  it('batches in hundreds', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => id(i))
    const { requests, calls } = stubFetch([players([])])

    await fetchPersonaNames(ids, auth)

    expect(calls()).toBe(3)
    expect(requests[0]?.url.split('steamids=')[1]?.split(',')).toHaveLength(100)
    expect(requests[2]?.url.split('steamids=')[1]?.split(',')).toHaveLength(50)
  })

  it('merges the batches into one map', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => id(i))

    stubFetch([players(ids.slice(0, 100)), players(ids.slice(100))])

    await expect(fetchPersonaNames(ids, auth)).resolves.toHaveProperty('size', 150)
  })

  // Private or deleted accounts are simply absent from the response, which is not an error.
  it('leaves ids Steam did not return out of the map', async () => {
    stubFetch([players([id(1)])])

    const map = await fetchPersonaNames([id(1), id(2)], auth)

    expect(map.has(id(1))).toBe(true)
    expect(map.has(id(2))).toBe(false)
  })

  it('reads a response with no usable players as empty', async () => {
    stubFetch([{ body: { response: {} } }])
    await expect(fetchPersonaNames([id(1)], auth)).resolves.toEqual(new Map())

    stubFetch([{ body: {} }])
    await expect(fetchPersonaNames([id(1)], auth)).resolves.toEqual(new Map())

    stubFetch([{ body: { response: { players: [{ steamid: id(1) }, null, 'x'] } } }])
    await expect(fetchPersonaNames([id(1)], auth)).resolves.toEqual(new Map())
  })

  it('reads a missing profileurl as an empty string', async () => {
    stubFetch([{ body: { response: { players: [{ steamid: id(1), personaname: 'abc' }] } } }])

    await expect(fetchPersonaNames([id(1)], auth)).resolves.toEqual(
      new Map([[id(1), { personaName: 'abc', profileUrl: '' }]]),
    )
  })

  // A caller that must not break should catch - the contract is "throw", not "return stale".
  it('throws for a missing key and on a non-200', async () => {
    const { calls } = stubFetch([players([id(1)])])
    const previous = process.env.STEAM_WEB_API_KEY

    delete process.env.STEAM_WEB_API_KEY

    await expect(fetchPersonaNames([id(1)])).rejects.toThrow(/No Steam API key/)
    expect(calls()).toBe(0)

    if (previous !== undefined) process.env.STEAM_WEB_API_KEY = previous

    stubFetch([{ status: 503, statusText: 'Service Unavailable' }])
    await expect(fetchPersonaNames([id(1)], auth)).rejects.toThrow(/503/)
  })
})
