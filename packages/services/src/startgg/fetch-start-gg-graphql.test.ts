import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStartggGraphQL, fetchStartggPage } from './fetch-start-gg-graphql.js'
import { captureConsole, stubFetch } from '@quitecustard/services/http.fixture.js'

// Backoff and the 900ms rate gate both go through `sleep`; resolving it immediately keeps the retry
// paths honest without the test waiting ~45s for them.
vi.mock('@quitecustard/core/utils/sleep', () => ({ sleep: () => Promise.resolve() }))

const token = 'pat-abc'
const query = 'query Event($slug: String!, $perPage: Int) { event(slug: $slug) { id } }'

const ok = (data: unknown, complexity = 12) => ({
  body: { data, extensions: { queryComplexity: complexity } },
})

const complexityError = {
  body: { errors: [{ message: 'Your query complexity is too high' }], data: null },
}

/** Reads the event payload, or null when the response is not the shape this query asked for. */
const parseEvent = (data: unknown): { id: number } | null => {
  if (typeof data !== 'object' || data === null || !('event' in data)) return null

  const { event } = data

  if (typeof event !== 'object' || event === null || !('id' in event)) return null

  return typeof event.id === 'number' ? { id: event.id } : null
}

const page = (responses: Parameters<typeof stubFetch>[0], perPage = 50, reducePerPage = true) => {
  const stub = stubFetch(responses)

  return {
    stub,
    result: fetchStartggPage(query, { slug: 'x' }, perPage, parseEvent, { token, reducePerPage }),
  }
}

beforeEach(() => {
  captureConsole()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchStartggGraphQL', () => {
  it('posts the query with a bearer token', async () => {
    const { requests } = stubFetch([ok({ event: { id: 1 } })])

    await fetchStartggGraphQL(query, { slug: 'x' }, { token })

    expect(requests[0]?.url).toBe('https://api.start.gg/gql/alpha')
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${token}`)
    expect(requests[0]?.body).toContain('"slug":"x"')
  })

  // Without this the request goes out as `Bearer undefined` and start.gg answers 401, which reads
  // as a revoked token rather than a missing one.
  it('throws for a missing token instead of sending `Bearer undefined`', async () => {
    const { calls } = stubFetch([ok({})])
    const previous = process.env.STARTGG_TOKEN

    delete process.env.STARTGG_TOKEN

    await expect(fetchStartggGraphQL(query, {})).rejects.toThrow(/No start\.gg token/)
    expect(calls()).toBe(0)

    if (previous !== undefined) process.env.STARTGG_TOKEN = previous
  })
})

describe('fetchStartggPage', () => {
  it('returns the parsed page with its complexity', async () => {
    const { result } = page([ok({ event: { id: 7 } }, 42)])

    await expect(result).resolves.toEqual({ data: { id: 7 }, complexity: 42, perPage: 50 })
  })

  it('sends the page size as a variable', async () => {
    const { stub, result } = page([ok({ event: { id: 7 } })], 25)

    await result

    expect(stub.requests[0]?.body).toContain('"perPage":25')
  })

  it('reads a missing complexity extension as zero', async () => {
    const { result } = page([{ body: { data: { event: { id: 7 } } } }])

    await expect(result).resolves.toMatchObject({ complexity: 0 })
  })
})

describe('transient failures', () => {
  it.each([429, 500, 502, 503])('retries a %s and succeeds', async (status) => {
    const { stub, result } = page([{ status }, ok({ event: { id: 7 } })])

    await expect(result).resolves.toMatchObject({ data: { id: 7 } })
    expect(stub.calls()).toBe(2)
  })

  it('gives up after the retry budget and returns null', async () => {
    const { stub, result } = page([{ status: 500 }])

    await expect(result).resolves.toBeNull()
    expect(stub.calls()).toBe(5)
  })

  it('does not retry a 4xx that is not a rate limit', async () => {
    const { stub, result } = page([{ status: 401 }])

    await expect(result).resolves.toBeNull()
    expect(stub.calls()).toBe(1)
  })

  // The fetch itself can reject - a request timeout or a dropped connection - which would otherwise
  // throw straight past the retry handling and abort the whole sync.
  it('retries a rejected fetch rather than letting it escape', async () => {
    const { stub, result } = page([
      { throws: new Error('The operation was aborted due to timeout') },
      ok({ event: { id: 7 } }),
    ])

    await expect(result).resolves.toMatchObject({ data: { id: 7 } })
    expect(stub.calls()).toBe(2)
  })

  it('gives up on repeated rejections without throwing', async () => {
    const { result } = page([{ throws: new Error('ECONNRESET') }])

    await expect(result).resolves.toBeNull()
  })

  // start.gg answers 200 with a generic error and a null data payload during a brief outage.
  it('retries a 200 carrying errors or a null data payload', async () => {
    const withErrors = page([
      { body: { errors: [{ message: 'internal' }] } },
      ok({ event: { id: 1 } }),
    ])
    await expect(withErrors.result).resolves.toMatchObject({ data: { id: 1 } })

    const nullData = page([{ body: { data: null } }, ok({ event: { id: 2 } })])
    await expect(nullData.result).resolves.toMatchObject({ data: { id: 2 } })
  })
})

describe('complexity errors', () => {
  // Deterministic: the same query at the same perPage always exceeds the cap, so retrying it in
  // place at the same size is futile. Falling through to the transient block burns ~45s of pointless
  // backoff per page-size level.
  it('halves perPage and retries in place, without transient backoff', async () => {
    const { stub, result } = page([complexityError, ok({ event: { id: 7 } })], 50)

    await expect(result).resolves.toMatchObject({ perPage: 25 })
    expect(stub.calls()).toBe(2)
    expect(stub.requests[1]?.body).toContain('"perPage":25')
  })

  it('keeps halving until the query fits', async () => {
    const { stub, result } = page(
      [complexityError, complexityError, complexityError, ok({ event: { id: 7 } })],
      80,
    )

    await expect(result).resolves.toMatchObject({ perPage: 10 })
    expect(stub.calls()).toBe(4)
  })

  // The size it was ACTUALLY fetched at, which is not the size asked for. A caller paginating by
  // page number has to carry this forward or the page boundaries misalign and rows are skipped.
  it('reports the size the page was really fetched at', async () => {
    const { result } = page([complexityError, ok({ event: { id: 7 } })], 50)

    await expect(result).resolves.toMatchObject({ perPage: 25 })
  })

  it('gives up rather than looping once perPage reaches 1', async () => {
    const { stub, result } = page([complexityError], 2)

    await expect(result).resolves.toBeNull()
    expect(stub.calls()).toBe(2)
  })

  // A caller paginating a whole resource itself must reduce at the RESOURCE level - halving
  // mid-pagination would misalign boundaries and drop or duplicate rows.
  it('surfaces immediately for a caller that owns the page size', async () => {
    const { stub, result } = page([complexityError], 50, false)

    await expect(result).resolves.toBeNull()
    expect(stub.calls()).toBe(1)
  })
})

describe('shape mismatches', () => {
  // The same query returns the same shape, so retrying only burns backoff.
  it('returns null without retrying when parse rejects the payload', async () => {
    const { stub, result } = page([ok({ event: { id: 'not-a-number' } })])

    await expect(result).resolves.toBeNull()
    expect(stub.calls()).toBe(1)
  })

  it('returns null for a response that is not an object at all', async () => {
    const { result } = page([{ text: 'null' }])

    await expect(result).resolves.toBeNull()
  })
})

describe('missing credentials', () => {
  // Configuration, not a transient failure - retrying it four times with backoff wastes ~45s to
  // reach the same answer.
  it('returns null immediately with no token, without any request', async () => {
    const stub = stubFetch([ok({ event: { id: 1 } })])
    const previous = process.env.STARTGG_TOKEN

    delete process.env.STARTGG_TOKEN

    await expect(fetchStartggPage(query, { slug: 'x' }, 50, parseEvent, {})).resolves.toBeNull()
    expect(stub.calls()).toBe(0)

    if (previous !== undefined) process.env.STARTGG_TOKEN = previous
  })

  it('falls back to the environment token', async () => {
    const { requests } = stubFetch([ok({ event: { id: 1 } })])
    const previous = process.env.STARTGG_TOKEN

    process.env.STARTGG_TOKEN = 'env-token'

    await expect(fetchStartggPage(query, { slug: 'x' }, 50, parseEvent, {})).resolves.toMatchObject(
      {
        data: { id: 1 },
      },
    )
    expect(requests[0]?.headers.authorization).toBe('Bearer env-token')

    if (previous === undefined) delete process.env.STARTGG_TOKEN
    else process.env.STARTGG_TOKEN = previous
  })
})
