import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncLock } from './sync-lock.js'
import { fakeDrizzle, payloadFixture } from '@quitecustard/payload/payload.fixture.js'

const now = new Date('2026-08-21T12:00:00.000Z')

const claimed = { rowCount: 1 }
const notClaimed = { rowCount: 0 }

const lockPayload = (
  responses: unknown[],
  global: unknown = null,
  onUpdate?: (data: unknown) => void,
) => {
  const fake = fakeDrizzle(responses)

  const payload = payloadFixture({
    db: { drizzle: fake.drizzle },
    findGlobal: () => Promise.resolve(global),
    updateGlobal: ({ data }: { data: unknown }) => {
      onUpdate?.(data)
      return Promise.resolve(data)
    },
  })

  return { fake, payload }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('acquire', () => {
  // A read-then-write cannot do this: two concurrent requests both pass the isRunning check and run
  // overlapping jobs. Only the request whose conditional UPDATE matched gets a row back.
  it('claims the lock with a single conditional UPDATE', async () => {
    const { fake, payload } = lockPayload([claimed])

    await expect(createSyncLock().acquire(payload, 'runner-1')).resolves.toBeNull()

    expect(fake.calls()).toBe(1)
    expect(fake.statements.join(' ')).toContain('UPDATE')
    expect(fake.statements.join(' ')).toContain('is_running')
  })

  // The fallback path issues the advisory lock, then retries the same UPDATE, before falling back
  // to the read-then-write seed.
  const fallback = (retry: unknown) => [notClaimed, { rows: [] }, retry]

  it('reports who holds a lock it could not claim', async () => {
    const { payload } = lockPayload(fallback(notClaimed), {
      isRunning: true,
      startedBy: 'runner-1',
      startedAt: now.toISOString(),
    })

    await expect(createSyncLock().acquire(payload, 'runner-2')).resolves.toEqual({
      startedBy: 'runner-1',
    })
  })

  // A held lock and an unseeded row are indistinguishable from the outer UPDATE alone - both match
  // no row - so the contended path goes through the advisory lock and the retry too. It is not the
  // seeding case only, and losing the race is not free.
  it('pays the advisory lock and a retry when it simply lost the race', async () => {
    const { fake, payload } = lockPayload(fallback(notClaimed), {
      isRunning: true,
      startedBy: 'runner-1',
      startedAt: now.toISOString(),
    })

    await createSyncLock().acquire(payload, 'runner-2')

    expect(fake.statements.join(' ')).toContain('pg_advisory_xact_lock')
    expect(fake.calls()).toBe(3)
  })

  // Payload creates a global's row lazily on first write, so before the first-ever run there is
  // nothing for the UPDATE to hit - that is a free lock, not a held one.
  it('seeds the row when the global does not exist yet', async () => {
    let seeded: unknown = null
    const { payload } = lockPayload(fallback(notClaimed), null, (data) => {
      seeded = data
    })

    await expect(createSyncLock().acquire(payload, 'runner-1')).resolves.toBeNull()
    expect(seeded).toMatchObject({ isRunning: true, startedBy: 'runner-1' })
  })

  // Seeding is a read-then-write, which two concurrent first-ever callers could both pass through.
  // The advisory lock serialises them onto this branch so only one seeds the row.
  it('takes an advisory lock before the read-then-write seed', async () => {
    const { fake, payload } = lockPayload(fallback(notClaimed), null)

    await createSyncLock().acquire(payload, 'runner-1')

    expect(fake.statements.join(' ')).toContain('pg_advisory_xact_lock')
  })

  // Whoever won the advisory lock may have seeded the row already, so the UPDATE is retried inside
  // the transaction rather than seeding a second time.
  it('claims on the in-transaction retry when another caller seeded first', async () => {
    let seeded: unknown = null
    const { payload } = lockPayload(fallback(claimed), null, (data) => {
      seeded = data
    })

    await expect(createSyncLock().acquire(payload, 'runner-2')).resolves.toBeNull()
    expect(seeded).toBeNull()
  })

  // A run killed mid-flight must not block every later one.
  it('reclaims a lock older than staleMs', async () => {
    const stale = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    let seeded: unknown = null

    const { payload } = lockPayload(
      fallback(notClaimed),
      { isRunning: true, startedBy: 'dead-runner', startedAt: stale },
      (data) => {
        seeded = data
      },
    )

    await expect(createSyncLock().acquire(payload, 'runner-2')).resolves.toBeNull()
    expect(seeded).toMatchObject({ startedBy: 'runner-2' })
  })

  it('respects a custom staleMs', async () => {
    const startedAt = new Date(now.getTime() - 90_000).toISOString()

    const held = lockPayload(fallback(notClaimed), { isRunning: true, startedBy: 'a', startedAt })
    await expect(createSyncLock({ staleMs: 120_000 }).acquire(held.payload, 'b')).resolves.toEqual({
      startedBy: 'a',
    })

    const expired = lockPayload(fallback(notClaimed), {
      isRunning: true,
      startedBy: 'a',
      startedAt,
    })
    await expect(
      createSyncLock({ staleMs: 60_000 }).acquire(expired.payload, 'b'),
    ).resolves.toBeNull()
  })

  // A row left is_running with no timestamp has no age to be judged by. Reading that as "not
  // stale" holds the lock forever and no later run can ever claim it, so it reads as reclaimable
  // on both paths: the UPDATE's own `started_at IS NULL` clause, and the staleness check.
  it('claims a row that is running with no startedAt, in SQL', async () => {
    const { fake, payload } = lockPayload([claimed])

    await createSyncLock().acquire(payload, 'runner-1')

    expect(fake.statements.join(' ')).toContain('started_at IS NULL')
  })

  it('reads a lock row with no startedAt as free rather than eternally held', async () => {
    const { payload } = lockPayload(fallback(notClaimed), { isRunning: true, startedBy: 'a' })

    await expect(createSyncLock().acquire(payload, 'b')).resolves.toBeNull()
  })

  it('reports a running lock with no startedAt as free from status too', async () => {
    const { payload } = lockPayload([], { isRunning: true, startedBy: 'a' })

    await expect(createSyncLock().status(payload)).resolves.toEqual({ isRunning: false })
  })

  it('targets a custom table', async () => {
    const { fake, payload } = lockPayload([claimed])

    await createSyncLock({ table: 'job_lock' }).acquire(payload, 'runner-1')

    expect(fake.statements.join(' ')).toContain('job_lock')
    expect(fake.statements.join(' ')).not.toContain('sync_lock')
  })
})

describe('release', () => {
  // A run that outlives staleMs can have its lock reclaimed by another; an unconditional release
  // would then free the SECOND run's lock from under it.
  it('matches on startedBy so a caller can only release its own', async () => {
    const { fake, payload } = lockPayload([claimed])

    await createSyncLock().release(payload, 'runner-1')

    expect(fake.statements.join(' ')).toContain('started_by')
    expect(fake.statements.join(' ')).toContain('runner-1')
  })
})

describe('status', () => {
  it('reports a held lock and who started it', async () => {
    const { payload } = lockPayload([], {
      isRunning: true,
      startedBy: 'runner-1',
      startedAt: now.toISOString(),
    })

    await expect(createSyncLock().status(payload)).resolves.toEqual({
      isRunning: true,
      startedBy: 'runner-1',
    })
  })

  it('reports a stale lock as free', async () => {
    const stale = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    const { payload } = lockPayload([], { isRunning: true, startedBy: 'a', startedAt: stale })

    await expect(createSyncLock().status(payload)).resolves.toEqual({ isRunning: false })
  })

  it('reports an unset or missing global as free', async () => {
    await expect(createSyncLock().status(lockPayload([], null).payload)).resolves.toEqual({
      isRunning: false,
    })
    await expect(
      createSyncLock().status(lockPayload([], { isRunning: false }).payload),
    ).resolves.toEqual({ isRunning: false })
  })

  // The global's fields are narrowed structurally - a consumer's generated types never reach here,
  // so anything could be in them.
  it('survives a global whose fields are the wrong types', async () => {
    const { payload } = lockPayload([], { isRunning: 'yes', startedBy: 42, startedAt: {} })

    await expect(createSyncLock().status(payload)).resolves.toEqual({ isRunning: false })
  })
})
