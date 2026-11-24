import { describe, expect, it } from 'vitest'
import { requestFixture } from '../payload.fixture.js'
import { claimRedirectPath, upsertRedirect } from './upsert-redirect.js'

type Row = { id: number; from: string; to: unknown }

/** A redirects collection in memory, answering the four calls the module makes. */
const redirectsStore = (rows: Row[] = []) => {
  let nextId = Math.max(0, ...rows.map(({ id }) => id)) + 1
  const collections: string[] = []
  const fromOf = (where: unknown): unknown =>
    typeof where === 'object' && where !== null && 'from' in where ? where.from : undefined
  const equalsOf = (clause: unknown): unknown =>
    typeof clause === 'object' && clause !== null && 'equals' in clause ? clause.equals : undefined

  const payload = {
    find: async ({ collection, where }: { collection: string; where: unknown }) => {
      collections.push(collection)

      return { docs: rows.filter((row) => row.from === equalsOf(fromOf(where))) }
    },
    delete: async ({ collection, id }: { collection: string; id: number }) => {
      collections.push(collection)
      rows.splice(
        rows.findIndex((row) => row.id === id),
        1,
      )
    },
    update: async ({ id, data }: { id: number; data: { from: string; to: unknown } }) => {
      const row = rows.find((r) => r.id === id)

      if (row) Object.assign(row, data)
    },
    create: async ({ data }: { data: { from: string; to: unknown } }) => {
      rows.push({ id: nextId++, ...data })
    },
  }

  return { rows, collections, req: requestFixture({ payload }) }
}

const reference = (relationTo: string, value: unknown) => ({
  type: 'reference',
  reference: { relationTo, value },
})

describe('upsertRedirect', () => {
  it('points the old address at the document by reference', async () => {
    const { rows, req } = redirectsStore()

    await upsertRedirect({
      from: '/teams/old',
      current: '/teams/new',
      to: { relationTo: 'teams', value: 7 },
      req,
    })

    expect(rows).toEqual([{ id: 1, from: '/teams/old', to: reference('teams', 7) }])
  })

  it('repoints a row already at the old address instead of adding another', async () => {
    const { rows, req } = redirectsStore([{ id: 4, from: '/teams/old', to: reference('teams', 2) }])

    await upsertRedirect({
      from: '/teams/old',
      current: '/teams/new',
      to: { relationTo: 'teams', value: 7 },
      req,
    })

    expect(rows).toEqual([{ id: 4, from: '/teams/old', to: reference('teams', 7) }])
  })

  // Renaming back to an earlier slug: the old row still redirects away from the address the page
  // is about to answer on, which would send the page to itself.
  it('clears redirects out of the address the document moves into', async () => {
    const { rows, req } = redirectsStore([
      { id: 1, from: '/teams/new', to: reference('teams', 7) },
      { id: 2, from: '/teams/new', to: { type: 'custom', url: '/elsewhere' } },
    ])

    await upsertRedirect({
      from: '/teams/old',
      current: '/teams/new',
      to: { relationTo: 'teams', value: 7 },
      req,
    })

    expect(rows.map(({ from }) => from)).toEqual(['/teams/old'])
  })

  // An autosave arrives with the slug unchanged: writing a row would redirect the page to itself.
  it('writes nothing when the document has not moved, and clears rows pointing back at it', async () => {
    const { rows, req } = redirectsStore([
      { id: 1, from: '/teams/same', to: reference('teams', 7) },
      { id: 2, from: '/teams/same', to: reference('teams', { id: 7, slug: 'same' }) },
    ])

    await upsertRedirect({
      from: '/teams/same',
      current: '/teams/same',
      to: { relationTo: 'teams', value: 7 },
      req,
    })

    expect(rows).toEqual([])
  })

  // A row from a live address to somewhere else is an editor's override; a routine save keeps it.
  it('keeps a row at an unmoved address that points elsewhere', async () => {
    const kept = [
      { id: 1, from: '/teams/same', to: reference('teams', 8) },
      { id: 2, from: '/teams/same', to: reference('organisations', 7) },
      { id: 3, from: '/teams/same', to: { type: 'custom', url: '/sale' } },
    ]
    const { rows, req } = redirectsStore([...kept])

    await upsertRedirect({
      from: '/teams/same',
      current: '/teams/same',
      to: { relationTo: 'teams', value: 7 },
      req,
    })

    expect(rows).toEqual(kept)
  })

  it('uses the redirects collection it is given', async () => {
    const { collections, req } = redirectsStore()

    await upsertRedirect({
      from: '/a',
      current: '/b',
      to: { relationTo: 'teams', value: 1 },
      req,
      redirects: 'site-redirects',
    })

    expect(new Set(collections)).toEqual(new Set(['site-redirects']))
  })
})

describe('claimRedirectPath', () => {
  it('deletes every redirect out of the path, whatever it points at', async () => {
    const { rows, req } = redirectsStore([
      { id: 1, from: '/live', to: reference('teams', 1) },
      { id: 2, from: '/live', to: { type: 'custom', url: '/x' } },
      { id: 3, from: '/other', to: reference('teams', 1) },
    ])

    await claimRedirectPath('/live', req)

    expect(rows.map(({ id }) => id)).toEqual([3])
  })
})
