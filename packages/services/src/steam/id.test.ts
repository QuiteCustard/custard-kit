import { describe, expect, it } from 'vitest'
import { isSteamID } from './id.js'

describe('isSteamID', () => {
  it('accepts a SteamID64', () => {
    expect(isSteamID('76561198000000000')).toBe(true)
    expect(isSteamID('76561197960287930')).toBe(true)
  })

  // The length alone is not the check: an individual account's SteamID64 always begins 7656, and a
  // 17-digit number that doesn't is not one.
  it('refuses a 17-digit number outside the individual-account range', () => {
    expect(isSteamID('12345678901234567')).toBe(false)
    expect(isSteamID('76551198000000000')).toBe(false)
    expect(isSteamID('00000000000000000')).toBe(false)
  })

  it('refuses anything of the wrong length', () => {
    expect(isSteamID('')).toBe(false)
    expect(isSteamID('123')).toBe(false)
    expect(isSteamID('7656119800000000')).toBe(false)
    expect(isSteamID('765611980000000000')).toBe(false)
  })

  // The id is interpolated into an API query string, so a non-digit must never reach it.
  it('refuses anything that is not all digits', () => {
    expect(isSteamID('7656119800000000a')).toBe(false)
    expect(isSteamID('76561198 00000000')).toBe(false)
    expect(isSteamID('-6561198000000000')).toBe(false)
    expect(isSteamID('7656119800000000.')).toBe(false)
  })
})
