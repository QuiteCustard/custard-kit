import { describe, expect, it, vi } from 'vitest'
import { deleteManyWithVersions } from './delete-many-with-versions.js'
import { payloadFixture, requestFixture } from '@quitecustard/payload/payload.fixture.js'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  initTransaction: vi.fn(() => Promise.resolve(true)),
  commitTransaction: vi.fn(() => Promise.resolve()),
  killTransaction: vi.fn(() => Promise.resolve()),
}))

const { commitTransaction, initTransaction, killTransaction } = await import('payload')

type DeleteCall = { kind: 'versions' | 'rows'; args: Record<string, unknown> }

const fakePayload = ({
  versioned = true,
  failOnRows = false,
}: { versioned?: boolean; failOnRows?: boolean } = {}) => {
  const calls: DeleteCall[] = []

  const payload = payloadFixture({
    collections: { pages: { config: { versions: versioned ? { drafts: true } : false } } },
    db: {
      deleteVersions: (args: Record<string, unknown>) => {
        calls.push({ kind: 'versions', args })
        return Promise.resolve()
      },
      deleteMany: (args: Record<string, unknown>) => {
        calls.push({ kind: 'rows', args })
        return failOnRows ? Promise.reject(new Error('rows failed')) : Promise.resolve()
      },
    },
  })

  return { calls, payload }
}

describe('deleteManyWithVersions', () => {
  it('does nothing at all for an empty id list', async () => {
    const { calls, payload } = fakePayload()

    await deleteManyWithVersions({ payload, collection: 'pages', ids: [] })

    expect(calls).toEqual([])
    expect(initTransaction).not.toHaveBeenCalled()
  })

  // Versions carry an FK to the parent that is ON DELETE SET NULL, so deleting rows first leaves
  // orphaned snapshots behind rather than removing them.
  it('deletes the versions before the rows', async () => {
    const { calls, payload } = fakePayload()

    await deleteManyWithVersions({ payload, collection: 'pages', ids: [1, 2] })

    expect(calls.map((call) => call.kind)).toEqual(['versions', 'rows'])
    expect(calls[0]?.args.where).toEqual({ parent: { in: [1, 2] } })
    expect(calls[1]?.args.where).toEqual({ id: { in: [1, 2] } })
  })

  it('skips the version purge on a collection that has none', async () => {
    const { calls, payload } = fakePayload({ versioned: false })

    await deleteManyWithVersions({ payload, collection: 'pages', ids: [1] })

    expect(calls.map((call) => call.kind)).toEqual(['rows'])
  })

  it('takes uuid ids as readily as numeric ones', async () => {
    const { calls, payload } = fakePayload()

    await deleteManyWithVersions({ payload, collection: 'pages', ids: ['a1b2', 'c3d4'] })

    expect(calls[1]?.args.where).toEqual({ id: { in: ['a1b2', 'c3d4'] } })
  })

  // Both deletes have to land or neither: rows gone with versions left behind is exactly the
  // orphaned state this helper exists to avoid.
  it('opens and commits its own transaction when given no request', async () => {
    vi.mocked(initTransaction).mockClear()
    vi.mocked(commitTransaction).mockClear()

    const { payload } = fakePayload()

    await deleteManyWithVersions({ payload, collection: 'pages', ids: [1] })

    expect(initTransaction).toHaveBeenCalled()
    expect(commitTransaction).toHaveBeenCalled()
  })

  it('rolls its own transaction back and rethrows when a delete fails', async () => {
    vi.mocked(killTransaction).mockClear()
    vi.mocked(commitTransaction).mockClear()

    const { payload } = fakePayload({ failOnRows: true })

    await expect(
      deleteManyWithVersions({ payload, collection: 'pages', ids: [1] }),
    ).rejects.toThrow('rows failed')

    expect(killTransaction).toHaveBeenCalled()
    expect(commitTransaction).not.toHaveBeenCalled()
  })

  // A caller's transaction is the caller's to finish - committing it here would land their earlier
  // writes early, and killing it would discard them.
  it('joins a caller’s transaction without opening or committing one', async () => {
    vi.mocked(initTransaction).mockClear()
    vi.mocked(commitTransaction).mockClear()

    const { calls, payload } = fakePayload()
    const req = requestFixture({ transactionID: 7 })

    await deleteManyWithVersions({ payload, collection: 'pages', ids: [1], req })

    expect(initTransaction).not.toHaveBeenCalled()
    expect(commitTransaction).not.toHaveBeenCalled()
    expect(calls.every((call) => call.args.req === req)).toBe(true)
  })

  it('lets a caller’s transaction survive a failure, for them to roll back', async () => {
    vi.mocked(killTransaction).mockClear()

    const { payload } = fakePayload({ failOnRows: true })

    await expect(
      deleteManyWithVersions({
        payload,
        collection: 'pages',
        ids: [1],
        req: requestFixture({ transactionID: 7 }),
      }),
    ).rejects.toThrow('rows failed')

    expect(killTransaction).not.toHaveBeenCalled()
  })
})
