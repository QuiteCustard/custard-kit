import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRecord } from '@quitecustard/core/utils/is-record'
import { advisoryLockSql, holdAdvisoryLock, withAdvisoryLock } from './advisory-lock.js'
import { fakeDrizzle, payloadFixture } from '@quitecustard/payload/payload.fixture.js'

const lockPayload = (responses: unknown[], transactions = true) => {
  const root = fakeDrizzle([])
  const session = fakeDrizzle(responses)
  const ended: string[] = []

  const payload = payloadFixture({
    db: {
      drizzle: root.drizzle,
      sessions: { 7: { db: session.drizzle } },
      beginTransaction: () => Promise.resolve(transactions ? 7 : null),
      commitTransaction: () => Promise.resolve(ended.push('commit')),
      rollbackTransaction: () => Promise.resolve(ended.push('rollback')),
    },
  })

  return { payload, root, session, ended }
}

const free = { rows: [{ acquired: true }] }
const busy = { rows: [{ acquired: false }] }

/** A statement's SQL text, with `$` where a value is bound, and the bound values. */
const statement = (chunks: unknown) => {
  const text: string[] = []
  const params: unknown[] = []

  const walk = (chunk: unknown) => {
    if (isRecord(chunk) && Array.isArray(chunk.queryChunks)) chunk.queryChunks.forEach(walk)
    else if (isRecord(chunk) && Array.isArray(chunk.value)) text.push(chunk.value.join(''))
    else {
      text.push('$')
      params.push(chunk)
    }
  }

  walk({ queryChunks: chunks })

  return { text: text.join(''), params }
}

const blockingLock = 'SELECT pg_advisory_xact_lock(hashtextextended($, 0))'

describe('advisoryLockSql', () => {
  // A key inlined into the text instead of bound would be an injection point.
  it('waits for the lock on a 64-bit hash of the key, bound as a value', () => {
    expect(statement(advisoryLockSql('team-record:12').queryChunks)).toEqual({
      text: blockingLock,
      params: ['team-record:12'],
    })
  })
})

describe('holdAdvisoryLock', () => {
  it('waits for the lock on the transaction’s own connection', async () => {
    const { payload, root, session } = lockPayload([{ rows: [] }])

    await holdAdvisoryLock(payload, 7, 'reward:win:1')

    expect(root.calls()).toBe(0)
    expect(session.statements.map((sent) => statement(JSON.parse(sent)))).toEqual([
      { text: blockingLock, params: ['reward:win:1'] },
    ])
  })

  // On the pooled root handle the statement autocommits, so the lock is gone before the guarded
  // read runs and nothing is serialised.
  it('refuses without a transaction, or with one whose connection is gone', async () => {
    const { payload, root } = lockPayload([])

    await expect(holdAdvisoryLock(payload, null, 'k')).rejects.toThrow(/needs an open transaction/)
    await expect(holdAdvisoryLock(payload, 8, 'k')).rejects.toThrow(/needs an open transaction/)
    expect(root.calls()).toBe(0)
  })
})

describe('withAdvisoryLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The same hash of the same key as holdAdvisoryLock, so the two exclude each other.
  it('tries the lock on its own transaction, then runs and commits when it is free', async () => {
    const { payload, session, ended } = lockPayload([free])

    await expect(withAdvisoryLock(payload, 'k', () => Promise.resolve('done'))).resolves.toBe(
      'done',
    )
    expect(session.statements.map((sent) => statement(JSON.parse(sent)))).toEqual([
      {
        text: 'SELECT pg_try_advisory_xact_lock(hashtextextended($, 0)) AS acquired',
        params: ['k'],
      },
    ])
    expect(ended).toEqual(['commit'])
  })

  // A caller that skipped a busy lock would skip its own write.
  it('waits for a busy lock, releasing its connection between attempts', async () => {
    const { payload, ended } = lockPayload([busy, busy, free])
    const run = vi.fn(() => Promise.resolve('done'))
    const result = withAdvisoryLock(payload, 'k', run)

    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(1)
    expect(ended).toEqual(['rollback', 'rollback', 'commit'])
  })

  it('gives up after two minutes of a held lock', async () => {
    const { payload } = lockPayload(Array.from({ length: 200 }, () => busy))
    const run = vi.fn(() => Promise.resolve('done'))
    const refused = expect(withAdvisoryLock(payload, 'k', run)).rejects.toThrow(/"k" still held/)

    await vi.advanceTimersByTimeAsync(121_000)
    await refused
    expect(run).not.toHaveBeenCalled()
  })

  it('rolls back and rethrows when run throws', async () => {
    const { payload, ended } = lockPayload([free])

    await expect(
      withAdvisoryLock(payload, 'k', () => Promise.reject(new Error('no'))),
    ).rejects.toThrow('no')
    expect(ended).toEqual(['rollback'])
  })

  it('runs unlocked when the adapter has no transactions', async () => {
    const { payload, session } = lockPayload([], false)

    await expect(withAdvisoryLock(payload, 'k', () => Promise.resolve(1))).resolves.toBe(1)
    expect(session.calls()).toBe(0)
  })
})
