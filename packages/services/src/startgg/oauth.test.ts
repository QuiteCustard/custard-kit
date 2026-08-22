import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeStartggCode,
  fetchStartggIdentity,
  startggAuthorizeUrl,
  startggGraphQLUrl,
  startggScope,
  startggTokenUrl,
} from './oauth.js'
import { stubFetch } from '@quitecustard/services/http.fixture.js'

const auth = { clientId: 'client-1', clientSecret: 'secret-1' }
const redirectUri = 'https://example.test/api/startgg/callback'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('endpoints and scope', () => {
  it('names start.gg’s own hosts', () => {
    expect(startggAuthorizeUrl).toBe('https://start.gg/oauth/authorize')
    expect(startggTokenUrl).toBe('https://api.start.gg/oauth/access_token')
    expect(startggGraphQLUrl).toBe('https://api.start.gg/gql/alpha')
  })

  // Not user.email, not the tournament.* scopes: proving account ownership needs neither, and
  // asking for more is a consent screen the user can refuse.
  it('asks for identity alone', () => {
    expect(startggScope).toBe('user.identity')
  })
})

describe('exchangeStartggCode', () => {
  it('posts the code and returns the access token', async () => {
    const { requests } = stubFetch([{ body: { access_token: 'token-abc' } }])

    await expect(exchangeStartggCode('code-1', redirectUri, auth)).resolves.toBe('token-abc')

    expect(requests[0]?.url).toBe(startggTokenUrl)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.body).toContain('"code":"code-1"')
    expect(requests[0]?.body).toContain('"scope":"user.identity"')
  })

  // A failed exchange must never read as a successful link, so every failure throws rather than
  // returning something falsy the caller might not check.
  it('throws for missing credentials, a non-200, or an unusable body', async () => {
    stubFetch([{ body: { access_token: 'x' } }])
    await expect(
      exchangeStartggCode('code-1', redirectUri, { clientId: '', clientSecret: '' }),
    ).rejects.toThrow(/No start\.gg OAuth credentials/)

    await expect(exchangeStartggCode('code-1', '', auth)).rejects.toThrow(
      /No start\.gg OAuth credentials/,
    )

    stubFetch([{ status: 401, statusText: 'Unauthorized' }])
    await expect(exchangeStartggCode('code-1', redirectUri, auth)).rejects.toThrow(/401/)

    stubFetch([{ body: { token_type: 'Bearer' } }])
    await expect(exchangeStartggCode('code-1', redirectUri, auth)).rejects.toThrow(
      /unexpected response shape/,
    )
  })
})

describe('fetchStartggIdentity', () => {
  const identity = {
    body: {
      data: { currentUser: { id: 1, slug: 'user/abcd', player: { id: 42, gamerTag: 'Example' } } },
    },
  }

  // Called with the USER's token, so the player id provably belongs to whoever completed the flow -
  // that is the ownership proof the whole exchange exists for.
  it('queries currentUser with the user’s own token', async () => {
    const { requests } = stubFetch([identity])

    await fetchStartggIdentity('user-token')

    expect(requests[0]?.url).toBe(startggGraphQLUrl)
    expect(requests[0]?.headers.authorization).toBe('Bearer user-token')
    expect(requests[0]?.body).toContain('currentUser')
  })

  it('returns the player id, slug and gamerTag', async () => {
    stubFetch([identity])

    await expect(fetchStartggIdentity('user-token')).resolves.toEqual({
      playerId: 42,
      slug: 'user/abcd',
      gamerTag: 'Example',
    })
  })

  it('reads a missing slug or gamerTag as undefined', async () => {
    stubFetch([{ body: { data: { currentUser: { player: { id: 42 } } } } }])

    await expect(fetchStartggIdentity('user-token')).resolves.toEqual({
      playerId: 42,
      slug: undefined,
      gamerTag: undefined,
    })
  })

  // No linked player means there is nothing an import could ever match on, so it is a failed link
  // rather than a useless stored slug.
  it('throws when there is no player id to key on', async () => {
    stubFetch([{ body: { data: { currentUser: { slug: 'user/abcd' } } } }])
    await expect(fetchStartggIdentity('user-token')).rejects.toThrow(/no player id/)

    stubFetch([{ body: { data: { currentUser: { player: { id: '42' } } } } }])
    await expect(fetchStartggIdentity('user-token')).rejects.toThrow(/no player id/)

    stubFetch([{ body: { data: { currentUser: null } } }])
    await expect(fetchStartggIdentity('user-token')).rejects.toThrow(/no player id/)

    stubFetch([{ body: {} }])
    await expect(fetchStartggIdentity('user-token')).rejects.toThrow(/no player id/)
  })

  it('throws on a non-200', async () => {
    stubFetch([{ status: 500, statusText: 'Server Error' }])

    await expect(fetchStartggIdentity('user-token')).rejects.toThrow(/500/)
  })
})
