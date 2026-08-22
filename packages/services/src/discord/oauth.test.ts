import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discordGuildIds,
  exchangeCode,
  fetchDiscordUserByAccessToken,
  fetchDiscordUserById,
  fetchGuildMemberUsernames,
  postBotApi,
  resolveUsernamesAcrossGuilds,
} from './oauth.js'
import { captureConsole, stubFetch } from '@quitecustard/services/http.fixture.js'

vi.mock('@quitecustard/core/utils/sleep', () => ({ sleep: () => Promise.resolve() }))

const botToken = 'bot-abc'
const auth = { botToken }

const user = (id: string, username = `user${id}`) => ({ id, username, global_name: null })

const memberPage = (ids: string[]) => ({ body: ids.map((id) => ({ user: user(id) })) })

/** A full page, so the pager keeps going. */
const fullPage = (start: number) =>
  memberPage(Array.from({ length: 1000 }, (_, i) => String(start + i)))

beforeEach(() => {
  captureConsole()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exchangeCode', () => {
  const credentials = { appId: 'app-1', clientSecret: 'secret-1' }

  it('posts the code and returns the access token', async () => {
    const { requests } = stubFetch([{ body: { access_token: 'token-abc' } }])

    await expect(
      exchangeCode('code-1', 'verifier-1', 'https://example.test/cb', credentials),
    ).resolves.toBe('token-abc')

    expect(requests[0]?.url).toBe('https://discord.com/api/v10/oauth2/token')
    expect(requests[0]?.body).toContain('code=code-1')
    expect(requests[0]?.body).toContain('code_verifier=verifier-1')
    expect(requests[0]?.body).toContain('client_id=app-1')
  })

  it('throws when credentials or the redirect are missing', async () => {
    stubFetch([{ body: { access_token: 'x' } }])

    await expect(
      exchangeCode('code-1', 'v', 'https://example.test/cb', { appId: '', clientSecret: '' }),
    ).rejects.toThrow(/No Discord OAuth credentials/)

    await expect(exchangeCode('code-1', 'v', '', credentials)).rejects.toThrow(
      /No Discord OAuth credentials/,
    )
  })

  // A failed exchange must never read as a successful link.
  it('throws on a non-200', async () => {
    stubFetch([{ status: 401, statusText: 'Unauthorized' }])

    await expect(
      exchangeCode('code-1', 'v', 'https://example.test/cb', credentials),
    ).rejects.toThrow(/401/)
  })

  it('throws when the response carries no usable token', async () => {
    stubFetch([{ body: { token_type: 'Bearer' } }])

    await expect(
      exchangeCode('code-1', 'v', 'https://example.test/cb', credentials),
    ).rejects.toThrow(/unexpected response shape/)
  })
})

describe('bot token handling', () => {
  // Without this the request goes out as `Bot undefined` and Discord answers 401, which reads as a
  // revoked token rather than a missing one.
  it('throws for a missing bot token instead of sending `Bot undefined`', async () => {
    const { calls } = stubFetch([{ body: user('1') }])
    const previous = process.env.DISCORD_APP_TOKEN

    delete process.env.DISCORD_APP_TOKEN

    await expect(fetchDiscordUserById('1')).rejects.toThrow(/No Discord bot token/)
    expect(calls()).toBe(0)

    if (previous !== undefined) process.env.DISCORD_APP_TOKEN = previous
  })

  it('sends the bot token it was given', async () => {
    const { requests } = stubFetch([{ body: user('1') }])

    await fetchDiscordUserById('1', auth)

    expect(requests[0]?.headers.authorization).toBe(`Bot ${botToken}`)
  })
})

describe('rate limiting', () => {
  it('retries after a 429 and succeeds', async () => {
    const { calls } = stubFetch([
      { status: 429, headers: { 'retry-after': '1' } },
      { body: user('1') },
    ])

    await expect(fetchDiscordUserById('1', auth)).resolves.toMatchObject({ id: '1' })
    expect(calls()).toBe(2)
  })

  it('gives up after five attempts', async () => {
    const { calls } = stubFetch([{ status: 429, headers: { 'retry-after': '1' } }])

    await expect(fetchDiscordUserById('1', auth)).rejects.toThrow(/rate limit exceeded/)
    expect(calls()).toBe(5)
  })

  it('refuses an outsized Retry-After rather than stalling silently', async () => {
    stubFetch([{ status: 429, headers: { 'retry-after': '600' } }])

    await expect(fetchDiscordUserById('1', auth)).rejects.toThrow(/excessive Retry-After/)
  })

  // Retry-After is seconds by spec but MAY be an HTTP-date, which parseFloat reads as NaN - and a
  // NaN slips past both the excessive-backoff refusal and the sleep, turning the policy into an
  // immediate retry storm.
  it('reads an HTTP-date Retry-After rather than turning it into NaN', async () => {
    const soon = new Date(Date.now() + 2000).toUTCString()
    const { calls } = stubFetch([
      { status: 429, headers: { 'retry-after': soon } },
      { body: user('1') },
    ])

    await expect(fetchDiscordUserById('1', auth)).resolves.toMatchObject({ id: '1' })
    expect(calls()).toBe(2)
  })

  it('refuses an HTTP-date that is excessively far out', async () => {
    const later = new Date(Date.now() + 600_000).toUTCString()

    stubFetch([{ status: 429, headers: { 'retry-after': later } }])

    await expect(fetchDiscordUserById('1', auth)).rejects.toThrow(/excessive Retry-After/)
  })

  it('falls back to one second for an unreadable Retry-After', async () => {
    const { calls } = stubFetch([
      { status: 429, headers: { 'retry-after': 'soon-ish' } },
      { body: user('1') },
    ])

    await expect(fetchDiscordUserById('1', auth)).resolves.toMatchObject({ id: '1' })
    expect(calls()).toBe(2)
  })

  it('treats a Retry-After date already in the past as no wait', async () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    const { calls } = stubFetch([
      { status: 429, headers: { 'retry-after': past } },
      { body: user('1') },
    ])

    await expect(fetchDiscordUserById('1', auth)).resolves.toMatchObject({ id: '1' })
    expect(calls()).toBe(2)
  })
})

describe('fetchDiscordUserById', () => {
  it('parses the user', async () => {
    stubFetch([{ body: { id: '1', username: 'abc', global_name: 'Abc' } }])

    await expect(fetchDiscordUserById('1', auth)).resolves.toEqual({
      id: '1',
      username: 'abc',
      global_name: 'Abc',
    })
  })

  it('reads a missing or non-string global_name as null', async () => {
    stubFetch([{ body: { id: '1', username: 'abc' } }])

    await expect(fetchDiscordUserById('1', auth)).resolves.toMatchObject({ global_name: null })
  })

  it('throws on a non-200 and on an unexpected shape', async () => {
    stubFetch([{ status: 404, statusText: 'Not Found' }])
    await expect(fetchDiscordUserById('1', auth)).rejects.toThrow(/404/)

    stubFetch([{ body: { id: '1' } }])
    await expect(fetchDiscordUserById('1', auth)).rejects.toThrow(/unexpected response shape/)
  })
})

describe('fetchGuildMemberUsernames', () => {
  it('maps ids to usernames', async () => {
    stubFetch([memberPage(['1', '2'])])

    const map = await fetchGuildMemberUsernames('guild-1', auth)

    expect(map.get('1')).toBe('user1')
    expect(map.size).toBe(2)
  })

  it('stops once a page comes back short', async () => {
    const { calls } = stubFetch([memberPage(['1', '2'])])

    await fetchGuildMemberUsernames('guild-1', auth)

    expect(calls()).toBe(1)
  })

  it('pages with an after cursor', async () => {
    const { requests } = stubFetch([fullPage(1), memberPage(['2000'])])

    await fetchGuildMemberUsernames('guild-1', auth)

    expect(requests[0]?.url).toContain('after=0')
    expect(requests[1]?.url).toContain('after=1000')
  })

  // Entries that don't parse are skipped rather than failing the whole list - the map is a positive
  // cache, and anyone absent falls back to a per-id fetch.
  it('skips unparseable members instead of failing the list', async () => {
    stubFetch([{ body: [{ user: user('1') }, { user: { id: '2' } }, {}, { user: null }] }])

    const map = await fetchGuildMemberUsernames('guild-1', auth)

    expect([...map.keys()]).toEqual(['1'])
  })

  // THE pagination bug: pages are sorted ascending by id, so the cursor must advance on ANY entry
  // carrying an id. Advancing only on the ones that PARSE re-requests the same page forever when a
  // whole page fails to parse - 100 identical requests before the page cap stops it.
  it('advances the cursor past a page where nothing parses', async () => {
    const unparseable = {
      body: Array.from({ length: 1000 }, (_, i) => ({ user: { id: String(i + 1) } })),
    }
    const { requests, calls } = stubFetch([unparseable, memberPage(['2000'])])

    await fetchGuildMemberUsernames('guild-1', auth)

    expect(calls()).toBe(2)
    expect(requests[1]?.url).toContain('after=1000')
  })

  // A full page that moved no cursor would repeat forever.
  it('stops rather than spinning when a full page moves no cursor', async () => {
    const { calls } = stubFetch([
      { body: Array.from({ length: 1000 }, () => ({ user: { username: 'no-id' } })) },
    ])

    await fetchGuildMemberUsernames('guild-1', auth)

    expect(calls()).toBe(1)
  })

  it('throws on a non-200 and on a non-array body', async () => {
    stubFetch([{ status: 403, statusText: 'Forbidden' }])
    await expect(fetchGuildMemberUsernames('guild-1', auth)).rejects.toThrow(/403/)

    stubFetch([{ body: { message: 'nope' } }])
    await expect(fetchGuildMemberUsernames('guild-1', auth)).rejects.toThrow(
      /unexpected response shape/,
    )
  })
})

describe('resolveUsernamesAcrossGuilds', () => {
  it('merges results across guilds, first hit winning', async () => {
    stubFetch([memberPage(['1']), { body: [{ user: user('1', 'other') }, { user: user('2') }] }])

    const map = await resolveUsernamesAcrossGuilds(
      ['g1', 'g2'],
      new Set(['1', '2']),
      undefined,
      auth,
    )

    expect(map.get('1')).toBe('user1')
    expect(map.get('2')).toBe('user2')
  })

  // A guild the bot can't read - not a member, or the GUILD_MEMBERS intent is off - must contribute
  // nothing rather than sinking the others.
  it('reports a guild it cannot read and carries on', async () => {
    const failures: string[] = []

    stubFetch([{ status: 403, statusText: 'Forbidden' }, memberPage(['2'])])

    const map = await resolveUsernamesAcrossGuilds(
      ['g1', 'g2'],
      new Set(['2']),
      (guildId) => failures.push(guildId),
      auth,
    )

    expect(failures).toEqual(['g1'])
    expect(map.get('2')).toBe('user2')
  })

  // Every guild list is a full paginated pull, so the sweep stops as soon as nothing is left to find.
  it('stops sweeping once every needed id is resolved', async () => {
    const { calls } = stubFetch([memberPage(['1'])])

    await resolveUsernamesAcrossGuilds(['g1', 'g2', 'g3'], new Set(['1']), undefined, auth)

    expect(calls()).toBe(1)
  })

  it('is empty for no guilds', async () => {
    stubFetch([memberPage(['1'])])

    await expect(
      resolveUsernamesAcrossGuilds([], new Set(['1']), undefined, auth),
    ).resolves.toEqual(new Map())
  })
})

describe('fetchDiscordUserByAccessToken', () => {
  it('reads the user behind an OAuth token', async () => {
    const { requests } = stubFetch([{ body: user('1', 'abc') }])

    await expect(fetchDiscordUserByAccessToken('token-abc')).resolves.toMatchObject({ id: '1' })
    expect(requests[0]?.headers.authorization).toBe('Bearer token-abc')
    expect(requests[0]?.url).toContain('/users/@me')
  })

  it('throws on a non-200', async () => {
    stubFetch([{ status: 401, statusText: 'Unauthorized' }])

    await expect(fetchDiscordUserByAccessToken('bad')).rejects.toThrow(/401/)
  })
})

describe('postBotApi', () => {
  it('posts JSON with the bot token', async () => {
    const { requests } = stubFetch([{ body: {} }])

    await postBotApi('/channels/1/messages', { content: 'hi' }, 'sending a message', auth)

    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.headers['content-type']).toBe('application/json')
    expect(requests[0]?.body).toBe('{"content":"hi"}')
  })

  it('shares the 429 discipline with the GET path', async () => {
    const { calls } = stubFetch([{ status: 429, headers: { 'retry-after': '1' } }, { body: {} }])

    await postBotApi('/channels/1/messages', { content: 'hi' }, 'sending a message', auth)

    expect(calls()).toBe(2)
  })
})

describe('discordGuildIds', () => {
  it('splits, trims, dedupes and drops empties', () => {
    expect(discordGuildIds(' 1, 2 ,,2, 3 ')).toEqual(['1', '2', '3'])
  })

  it('is empty for a missing or blank list', () => {
    expect(discordGuildIds('')).toEqual([])
    expect(discordGuildIds(undefined)).toEqual([])
    expect(discordGuildIds(' , , ')).toEqual([])
  })
})
