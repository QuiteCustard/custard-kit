import { describe, expect, it } from 'vitest'
import { anyone, anyoneFieldLevel, nobody } from './anyone.js'
import { accessArgs, fieldAccessArgs } from '@quitecustard/payload/payload.fixture.js'

describe('anyone', () => {
  it('opens to an authenticated caller and an anonymous one alike', () => {
    expect(anyone(accessArgs({ id: 1 }))).toBe(true)
    expect(anyone(accessArgs(null))).toBe(true)
  })
})

describe('anyoneFieldLevel', () => {
  it('opens at field level too', () => {
    expect(anyoneFieldLevel(fieldAccessArgs(null))).toBe(true)
    expect(anyoneFieldLevel(fieldAccessArgs({ id: 1, roles: ['admin'] }))).toBe(true)
  })
})

describe('nobody', () => {
  // Sealed means sealed: an admin is still a caller, and the point of the rule is that the
  // collection is written through the Local API only, which bypasses access entirely.
  it('refuses every caller, admin included', () => {
    expect(nobody(accessArgs(null))).toBe(false)
    expect(nobody(accessArgs({ id: 1 }))).toBe(false)
    expect(nobody(accessArgs({ id: 1, roles: ['admin'] }))).toBe(false)
  })
})
