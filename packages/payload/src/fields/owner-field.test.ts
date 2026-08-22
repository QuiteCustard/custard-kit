import { describe, expect, it } from 'vitest'
import type { RelationshipField } from 'payload'
import { ownerField } from './owner-field.js'
import { fieldAccessArgs, fieldHookArgs } from '@quitecustard/payload/payload.fixture.js'

/** Narrows the union `ownerField` returns, so the test reads `access`/`hooks` without asserting. */
const ownerRelationship = (...args: Parameters<typeof ownerField>): RelationshipField => {
  const field = ownerField(...args)

  if (field.type !== 'relationship') throw new Error('ownerField must return a relationship field')

  return field
}

const stamp = (field: RelationshipField) => {
  const hook = field.hooks?.beforeChange?.[0]

  if (!hook) throw new Error('ownerField must install a beforeChange hook')

  return hook
}

describe('ownerField', () => {
  it('is a relationship to the given auth collection', () => {
    const field = ownerRelationship({ relationTo: 'users' })

    expect(field.name).toBe('owner')
    expect(field.relationTo).toBe('users')
    expect(field.admin?.position).toBe('sidebar')
  })

  // admin.readOnly only greys out the input; Payload never consults it on a REST or GraphQL write,
  // so field-level update access is the only thing that actually refuses a reassignment.
  it('refuses updates at field level, not merely in the admin UI', () => {
    const field = ownerRelationship({ relationTo: 'users' })

    expect(field.access?.update?.(fieldAccessArgs({ id: 1, roles: ['admin'] }))).toBe(false)
    expect(field.admin?.readOnly).toBe(true)
  })

  it('lets a caller override the access it sets', () => {
    const field = ownerRelationship({ relationTo: 'users' }, { access: { update: () => true } })

    expect(field.access?.update?.(fieldAccessArgs(null))).toBe(true)
  })

  it('takes a read gate', () => {
    const field = ownerRelationship({ relationTo: 'users' }, { readAccess: () => true })

    expect(field.access?.read?.(fieldAccessArgs(null))).toBe(true)
  })

  it('leaves read ungated when none is given', () => {
    expect(ownerRelationship({ relationTo: 'users' }).access?.read).toBeUndefined()
  })
})

describe('the owner stamp', () => {
  const setOwner = stamp(ownerRelationship({ relationTo: 'users' }))

  it('stamps the creating user on create', () => {
    expect(setOwner(fieldHookArgs({ user: { id: 3 }, operation: 'create' }))).toBe(3)
  })

  // Otherwise a POST could claim any owner it liked on a document it is creating.
  it('overrides a value supplied by whoever is creating the doc', () => {
    expect(setOwner(fieldHookArgs({ user: { id: 3 }, operation: 'create', value: 9 }))).toBe(3)
  })

  // A Local API create - a seed, a migration, an import - carries no user, and discarding an
  // explicit owner there would leave the row unowned.
  it('keeps an explicit owner when there is no user to stamp', () => {
    expect(setOwner(fieldHookArgs({ operation: 'create', value: 9, withoutRequest: true }))).toBe(9)
    expect(setOwner(fieldHookArgs({ operation: 'create', withoutRequest: true }))).toBeNull()
  })

  it('leaves the stored value alone on update', () => {
    expect(setOwner(fieldHookArgs({ user: { id: 3 }, operation: 'update', value: 9 }))).toBe(9)
    expect(setOwner(fieldHookArgs({ user: { id: 3 }, operation: 'update' }))).toBeUndefined()
  })
})
