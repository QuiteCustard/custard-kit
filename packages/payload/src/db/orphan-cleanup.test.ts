import { describe, expect, it } from 'vitest'
import { findDeletableIds } from './orphan-cleanup.js'
import { fakeDrizzle, payloadFixture } from '@quitecustard/payload/payload.fixture.js'

/**
 * `findDeletableIds` issues three statements in order: the pg_constraint reflection, the scan, and
 * the row count. The stub answers them in that order and records the SQL it was given.
 */
const fakePayload = (responses: unknown[]) => {
  const fake = fakeDrizzle(responses)

  return { statements: fake.statements, payload: payloadFixture({ db: { drizzle: fake.drizzle } }) }
}

const refs = (...tables: string[]) => ({ rows: tables.map((tbl) => ({ tbl, col: 'parent_id' })) })
const ids = (...values: (number | string)[]) => ({ rows: values.map((id) => ({ id })) })
const total = (value: number) => ({ rows: [{ total: value }] })

describe('findDeletableIds', () => {
  it('returns the ids nothing outside the row’s own data references', async () => {
    const { payload } = fakePayload([refs('posts', 'authors_socials'), ids(3, 5), total(10)])

    await expect(
      findDeletableIds(payload, 'authors', { ignore: new Set(['authors_socials']) }),
    ).resolves.toEqual([3, 5])
  })

  it('preserves uuid ids rather than coercing them to NaN', async () => {
    const { payload } = fakePayload([refs('posts'), ids('a1b2', 'c3d4'), total(9)])

    await expect(findDeletableIds(payload, 'authors')).resolves.toEqual(['a1b2', 'c3d4'])
  })

  it('drops rows whose id is missing or the wrong type', async () => {
    const { payload } = fakePayload([
      refs('posts'),
      { rows: [{ id: 1 }, {}, { id: null }] },
      total(9),
    ])

    await expect(findDeletableIds(payload, 'authors')).resolves.toEqual([1])
  })

  // An empty reflection means a broken query or the wrong database, not "nothing references this".
  it('refuses when no foreign key references the table at all', async () => {
    const { payload } = fakePayload([refs()])

    await expect(findDeletableIds(payload, 'authors')).rejects.toThrow(/No foreign key references/)
  })

  // With every referrer ignored there are no NOT EXISTS clauses left, so the scan degrades to
  // `WHERE 1 = 1` - and a narrowing `extra` keeps the count under the table total, so the
  // all-rows-deletable guard below would not catch it either.
  it('refuses when `ignore` covers every referring table', async () => {
    const { payload } = fakePayload([refs('posts', 'comments')])

    await expect(
      findDeletableIds(payload, 'authors', { ignore: new Set(['posts', 'comments']) }),
    ).rejects.toThrow(/is in `ignore`/)
  })

  it('refuses when every row in the table came back deletable', async () => {
    const { payload } = fakePayload([refs('posts'), ids(1, 2, 3), total(3)])

    await expect(findDeletableIds(payload, 'authors')).rejects.toThrow(
      /guard rails matched nothing/,
    )
  })

  it('allows an empty result, which is the ordinary "nothing to purge" case', async () => {
    const { payload } = fakePayload([refs('posts'), ids(), total(4)])

    await expect(findDeletableIds(payload, 'authors')).resolves.toEqual([])
  })

  it('qualifies identifiers with the schema it was given', async () => {
    const { payload, statements } = fakePayload([refs('posts'), ids(1), total(9)])

    await findDeletableIds(payload, 'authors', { schema: 'tenant_a' })

    expect(statements.join(' ')).toContain('tenant_a')
    expect(statements.join(' ')).toContain('authors')
  })
})
