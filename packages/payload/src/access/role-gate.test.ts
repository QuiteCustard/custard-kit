import { describe, expect, it } from 'vitest'
import { hasRole, roleGate, roleGateFieldLevel } from './role-gate.js'
import { accessArgs, fieldAccessArgs } from '@quitecustard/payload/payload.fixture.js'

describe('hasRole', () => {
  it('matches a single role', () => {
    expect(hasRole({ roles: ['admin'] }, 'admin')).toBe(true)
    expect(hasRole({ roles: ['player'] }, 'admin')).toBe(false)
  })

  it('matches if the caller holds ANY of several roles', () => {
    expect(hasRole({ roles: ['staff'] }, ['admin', 'staff'])).toBe(true)
    expect(hasRole({ roles: ['player'] }, ['admin', 'staff'])).toBe(false)
    expect(hasRole({ roles: ['admin', 'player'] }, ['admin'])).toBe(true)
  })

  // Read defensively rather than indexing `.roles`: a caller with no roles field, or one narrowed
  // by an admin-UI surface, must read as "no role" instead of throwing mid-request.
  it('reads a caller with no usable roles as holding none', () => {
    expect(hasRole(null, 'admin')).toBe(false)
    expect(hasRole(undefined, 'admin')).toBe(false)
    expect(hasRole({}, 'admin')).toBe(false)
    expect(hasRole({ roles: null }, 'admin')).toBe(false)
    expect(hasRole({ roles: 'admin' }, 'admin')).toBe(false)
    expect(hasRole({ roles: {} }, 'admin')).toBe(false)
  })

  it('is exact, not a substring or case-insensitive match', () => {
    expect(hasRole({ roles: ['administrator'] }, 'admin')).toBe(false)
    expect(hasRole({ roles: ['Admin'] }, 'admin')).toBe(false)
  })

  it('refuses an empty wanted list and an empty held list', () => {
    expect(hasRole({ roles: ['admin'] }, [])).toBe(false)
    expect(hasRole({ roles: [] }, 'admin')).toBe(false)
  })
})

describe('roleGate', () => {
  it('passes a caller holding the role and refuses everyone else', () => {
    const adminOnly = roleGate('admin')

    expect(adminOnly(accessArgs({ id: 1, roles: ['admin'] }))).toBe(true)
    expect(adminOnly(accessArgs({ id: 2, roles: ['player'] }))).toBe(false)
    expect(adminOnly(accessArgs(null))).toBe(false)
  })

  it('takes several roles', () => {
    const staffOrAdmin = roleGate(['admin', 'staff'])

    expect(staffOrAdmin(accessArgs({ id: 1, roles: ['staff'] }))).toBe(true)
    expect(staffOrAdmin(accessArgs({ id: 1, roles: ['guest'] }))).toBe(false)
  })
})

describe('roleGateFieldLevel', () => {
  it('is the same gate at field level', () => {
    const adminOnly = roleGateFieldLevel('admin')

    expect(adminOnly(fieldAccessArgs({ id: 1, roles: ['admin'] }))).toBe(true)
    expect(adminOnly(fieldAccessArgs({ id: 1, roles: ['player'] }))).toBe(false)
    expect(adminOnly(fieldAccessArgs(null))).toBe(false)
  })
})
