import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthUrl, extractSteamId64, verifyAssertion } from './openid.js'
import { stubFetch } from '@quitecustard/services/http.fixture.js'

const steamEndpoint = 'https://steamcommunity.com/openid/login'
const returnTo = 'https://example.test/api/steam/callback'
const steamId = '76561198000000000'

const signedFields = 'op_endpoint,return_to,response_nonce,assoc_handle,claimed_id,identity'

const assertion = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    'openid.mode': 'id_res',
    'openid.op_endpoint': steamEndpoint,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-08-21T12:00:00Zabc',
    'openid.assoc_handle': 'handle-1',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.signed': signedFields,
    'openid.sig': 'abc123',
    ...over,
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildAuthUrl', () => {
  it('points at Steam with the callback and realm it was given', () => {
    const url = new URL(buildAuthUrl(returnTo, 'https://example.test'))

    expect(`${url.origin}${url.pathname}`).toBe(steamEndpoint)
    expect(url.searchParams.get('openid.return_to')).toBe(returnTo)
    expect(url.searchParams.get('openid.realm')).toBe('https://example.test')
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup')
  })

  // identifier_select asks Steam to pick the identity - the user's own account - rather than the
  // relying party asserting one, which is what makes the claimed_id proof of ownership.
  it('asks Steam to select the identity', () => {
    const url = new URL(buildAuthUrl(returnTo, 'https://example.test'))
    const select = 'http://specs.openid.net/auth/2.0/identifier_select'

    expect(url.searchParams.get('openid.identity')).toBe(select)
    expect(url.searchParams.get('openid.claimed_id')).toBe(select)
  })
})

describe('verifyAssertion', () => {
  const valid = { text: 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n' }
  const invalid = { text: 'ns:http://specs.openid.net/auth/2.0\nis_valid:false\n' }

  it('accepts an assertion Steam vouches for', async () => {
    stubFetch([valid])

    await expect(verifyAssertion(assertion())).resolves.toBe(true)
  })

  // Without the round trip the return_to parameters are trivially forgeable, so claimed_id must
  // never be trusted until Steam confirms is_valid:true.
  it('echoes the parameters back as check_authentication', async () => {
    const { requests } = stubFetch([valid])

    await verifyAssertion(assertion())

    expect(requests[0]?.url).toBe(steamEndpoint)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.body).toContain('openid.mode=check_authentication')
    expect(requests[0]?.body).toContain('openid.sig=abc123')
  })

  it('refuses when Steam says the assertion is not valid', async () => {
    stubFetch([invalid])

    await expect(verifyAssertion(assertion())).resolves.toBe(false)
  })

  it('refuses a body that merely mentions is_valid', async () => {
    stubFetch([{ text: 'error:is_valid:true is not what this says' }])

    await expect(verifyAssertion(assertion())).resolves.toBe(false)
  })

  it('refuses a non-200 from Steam', async () => {
    stubFetch([{ status: 500, text: 'is_valid:true' }])

    await expect(verifyAssertion(assertion())).resolves.toBe(false)
  })

  // Structural checks run BEFORE the round trip, so a forged assertion costs no outbound request.
  it('refuses a negative or cancelled response without asking Steam', async () => {
    const { calls } = stubFetch([valid])

    await expect(verifyAssertion(assertion({ 'openid.mode': 'cancel' }))).resolves.toBe(false)
    await expect(verifyAssertion(assertion({ 'openid.mode': 'setup_needed' }))).resolves.toBe(false)
    expect(calls()).toBe(0)
  })

  it('refuses an assertion naming somebody else’s OP endpoint', async () => {
    const { calls } = stubFetch([valid])

    await expect(
      verifyAssertion(assertion({ 'openid.op_endpoint': 'https://evil.test/openid/login' })),
    ).resolves.toBe(false)
    expect(calls()).toBe(0)
  })

  // check_authentication only vouches for the fields listed in `openid.signed`. A field acted on
  // that isn't signed would verify and still be attacker-substitutable.
  it.each(['op_endpoint', 'return_to', 'response_nonce', 'assoc_handle', 'claimed_id', 'identity'])(
    'refuses when %s is not covered by the signature',
    async (field) => {
      stubFetch([valid])

      const partial = signedFields
        .split(',')
        .filter((name) => name !== field)
        .join(',')

      await expect(verifyAssertion(assertion({ 'openid.signed': partial }))).resolves.toBe(false)
    },
  )

  it('refuses when the signed list is missing entirely', async () => {
    stubFetch([valid])

    const params = assertion()
    params.delete('openid.signed')

    await expect(verifyAssertion(params)).resolves.toBe(false)
  })

  // Steam signs return_to but has no idea WHICH relying party is entitled to the assertion, so one
  // minted for a different site's callback verifies here just as happily without this check.
  it('refuses an assertion minted for a different relying party', async () => {
    const { calls } = stubFetch([valid])

    await expect(verifyAssertion(assertion(), { expectedReturnTo: returnTo })).resolves.toBe(true)

    await expect(
      verifyAssertion(assertion({ 'openid.return_to': 'https://evil.test/callback' }), {
        expectedReturnTo: returnTo,
      }),
    ).resolves.toBe(false)

    // The refusal cost no round trip.
    expect(calls()).toBe(1)
  })

  it('is an exact comparison, not a prefix one', async () => {
    stubFetch([valid])

    await expect(
      verifyAssertion(assertion({ 'openid.return_to': `${returnTo}/../evil` }), {
        expectedReturnTo: returnTo,
      }),
    ).resolves.toBe(false)
  })

  it('skips the relying-party check when no expectation is given', async () => {
    stubFetch([valid])

    await expect(
      verifyAssertion(assertion({ 'openid.return_to': 'https://elsewhere.test/cb' })),
    ).resolves.toBe(true)
  })

  it('throws on a Steam timeout, which the caller treats as a failed link', async () => {
    stubFetch([{ throws: new Error('The operation was aborted due to timeout') }])

    await expect(verifyAssertion(assertion())).rejects.toThrow(/timeout/)
  })
})

describe('extractSteamId64', () => {
  it('reads the id out of a claimed_id', () => {
    expect(extractSteamId64(`https://steamcommunity.com/openid/id/${steamId}`)).toBe(steamId)
  })

  it('refuses a claimed_id on any other host or path', () => {
    expect(extractSteamId64(`https://evil.test/openid/id/${steamId}`)).toBeNull()
    expect(extractSteamId64(`http://steamcommunity.com/openid/id/${steamId}`)).toBeNull()
    expect(extractSteamId64(`https://steamcommunity.com/profiles/${steamId}`)).toBeNull()
    expect(extractSteamId64(`https://steamcommunity.com/openid/id/${steamId}/extra`)).toBeNull()
  })

  it('refuses an id that is not a SteamID64', () => {
    expect(extractSteamId64('https://steamcommunity.com/openid/id/123')).toBeNull()
    expect(extractSteamId64('https://steamcommunity.com/openid/id/12345678901234567')).toBeNull()
  })

  it('handles a missing claimed_id', () => {
    expect(extractSteamId64(null)).toBeNull()
    expect(extractSteamId64(undefined)).toBeNull()
    expect(extractSteamId64('')).toBeNull()
  })
})
