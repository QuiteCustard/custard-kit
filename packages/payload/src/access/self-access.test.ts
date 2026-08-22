import { describe, expect, it } from 'vitest'
import { isSameUser, isSelfFieldLevel, selfOrAdminFieldLevel } from './self-access.js'
import { fieldAccessArgs, userFixture } from '@quitecustard/payload/payload.fixture.js'

describe('isSameUser', () => {
  // REST carries the id through as a path STRING while user.id comes off the row as a number, so a
  // bare === is `5 === '5'` and denies a legitimate self-edit.
  it('compares ids across the string/number divide', () => {
    expect(isSameUser(userFixture(7), 7)).toBe(true)
    expect(isSameUser(userFixture('7'), 7)).toBe(true)
    expect(isSameUser(userFixture(7), '7')).toBe(true)
    expect(isSameUser(userFixture('a1b2'), 'a1b2')).toBe(true)
  })

  it('refuses a different user', () => {
    expect(isSameUser(userFixture(7), 8)).toBe(false)
    expect(isSameUser(userFixture(7), '8')).toBe(false)
  })

  // Nullish on both sides must not match nullish, or an anonymous caller passes on a doc with no id.
  it('refuses when either side is missing', () => {
    expect(isSameUser(null, 7)).toBe(false)
    expect(isSameUser(userFixture(7), null)).toBe(false)
    expect(isSameUser(null, null)).toBe(false)
    expect(isSameUser(userFixture(7), undefined)).toBe(false)
    expect(isSameUser(userFixture(null), null)).toBe(false)
  })

  it('takes a resolver for a project with more than one auth collection', () => {
    const siteUserId = (user: unknown) =>
      user && typeof user === 'object' && 'siteUserId' in user ? user.siteUserId : null

    expect(isSameUser(userFixture(1, { siteUserId: 42 }), 42, siteUserId)).toBe(true)
    expect(isSameUser(userFixture(1, { siteUserId: 42 }), 1, siteUserId)).toBe(false)
  })
})

describe('isSelfFieldLevel', () => {
  // Payload populates a different subset of the args in each of the three code paths that run field
  // access, so the id has to be read from whichever one provided it.
  it('resolves the id from doc, as an afterRead redaction passes it', () => {
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { doc: { id: 7 } }))).toBe(true)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { doc: { id: 8 } }))).toBe(false)
  })

  // buildFormState - the admin edit/account form - passes `id` and NO `doc`. Checking doc.id alone
  // silently returns false here, and a non-admin loses every self-guarded field on their own record.
  it('resolves the id from id, as the admin form-state build passes it', () => {
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { id: 7, data: {} }))).toBe(true)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { id: 8, data: {} }))).toBe(false)
  })

  // `data` is the incoming REQUEST BODY. Trusting it would let a POST carrying `id: <my own id>`
  // pass the self check on somebody else's document.
  it('never trusts an id from the request body', () => {
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { data: { id: 7 } }))).toBe(false)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { id: 8, data: { id: 7 } }))).toBe(false)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { doc: { id: 8 }, data: { id: 7 } }))).toBe(
      false,
    )
  })

  // Payload leaves both `doc` and `id` undefined on create, and a document that does not exist yet
  // has no owner to be.
  it('is false on create', () => {
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { data: { name: 'x' } }))).toBe(false)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }))).toBe(false)
  })

  it('is false with no user at all', () => {
    expect(isSelfFieldLevel(fieldAccessArgs(null, { doc: { id: 7 } }))).toBe(false)
  })

  it('prefers doc over id when both are present', () => {
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { doc: { id: 7 }, id: 8 }))).toBe(true)
    expect(isSelfFieldLevel(fieldAccessArgs({ id: 7 }, { doc: { id: 8 }, id: 7 }))).toBe(false)
  })
})

describe('selfOrAdminFieldLevel', () => {
  it('lets an admin through on somebody else’s document', () => {
    const gate = selfOrAdminFieldLevel()

    expect(gate(fieldAccessArgs({ id: 1, roles: ['admin'] }, { doc: { id: 999 } }))).toBe(true)
  })

  it('still lets the owner through', () => {
    const gate = selfOrAdminFieldLevel()

    expect(gate(fieldAccessArgs({ id: 7, roles: ['player'] }, { doc: { id: 7 } }))).toBe(true)
  })

  it('refuses a non-admin on somebody else’s document', () => {
    const gate = selfOrAdminFieldLevel()

    expect(gate(fieldAccessArgs({ id: 7, roles: ['player'] }, { doc: { id: 8 } }))).toBe(false)
    expect(gate(fieldAccessArgs(null, { doc: { id: 8 } }))).toBe(false)
  })

  it('takes the admin role names as a parameter, with no default smuggled in', () => {
    const gate = selfOrAdminFieldLevel(['owner', 'staff'])

    expect(gate(fieldAccessArgs({ id: 1, roles: ['staff'] }, { doc: { id: 999 } }))).toBe(true)
    expect(gate(fieldAccessArgs({ id: 1, roles: ['admin'] }, { doc: { id: 999 } }))).toBe(false)
  })
})
