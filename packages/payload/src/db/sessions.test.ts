import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'
import { appendUserSession } from './sessions.js'
import {
  fakeDrizzle,
  payloadFixture,
  requestFixture,
} from '@quitecustard/payload/payload.fixture.js'

const createdAt = new Date('2026-08-21T10:00:00.000Z')
const expiresAt = new Date('2026-09-21T10:00:00.000Z')

const run = async (
  over: { userId?: number | string; table?: string; req?: PayloadRequest } = {},
) => {
  const fake = fakeDrizzle([{ rows: [] }])
  const sessionHandle = fakeDrizzle([{ rows: [] }])

  const payload = payloadFixture({
    db: { drizzle: fake.drizzle, sessions: { 7: { db: sessionHandle.drizzle } } },
  })

  await appendUserSession({
    payload,
    userId: over.userId ?? 1,
    sid: 'sid-1',
    createdAt,
    expiresAt,
    ...(over.table ? { table: over.table } : {}),
    ...(over.req === undefined ? {} : { req: over.req }),
  })

  return { root: fake, session: sessionHandle }
}

describe('appendUserSession', () => {
  it('issues one statement against the default sessions table', async () => {
    const { root } = await run()

    expect(root.calls()).toBe(1)
    expect(root.statements.join(' ')).toContain('users_sessions')
  })

  // One statement, one round trip: a data-modifying CTE always runs to completion whether or not
  // the outer query reads it, so the prune and the insert share a snapshot.
  it('prunes expired rows and inserts in the same statement', async () => {
    const { root } = await run()
    const sql = root.statements.join(' ')

    expect(sql).toContain('DELETE FROM')
    expect(sql).toContain('INSERT INTO')
    expect(sql).toContain('expires_at <= now()')
  })

  it('targets a custom table for a non-users auth collection', async () => {
    const { root } = await run({ table: 'members_sessions' })

    expect(root.statements.join(' ')).toContain('members_sessions')
    expect(root.statements.join(' ')).not.toContain('users_sessions')
  })

  it('takes a uuid user id as readily as a numeric one', async () => {
    await expect(run({ userId: 'a1b2c3d4' })).resolves.toBeDefined()
  })

  // Without the request the INSERT runs on the pooled root handle - a different connection, which
  // cannot see the uncommitted parent row and can deadlock against the outer transaction.
  it('runs on the transaction’s own handle when a request carries one', async () => {
    const { root, session } = await run({ req: requestFixture({ transactionID: 7 }) })

    expect(session.calls()).toBe(1)
    expect(root.calls()).toBe(0)
  })

  // Payload leaves transactionID as a PROMISE while the transaction is still being opened, so it
  // has to be awaited or the session lookup misses and silently falls back to the root handle.
  it('awaits a transaction id that is still a promise', async () => {
    const { root, session } = await run({
      req: requestFixture({ transactionID: Promise.resolve(7) }),
    })

    expect(session.calls()).toBe(1)
    expect(root.calls()).toBe(0)
  })

  it('uses the root handle when the request has no transaction', async () => {
    const { root, session } = await run({ req: requestFixture({}) })

    expect(root.calls()).toBe(1)
    expect(session.calls()).toBe(0)
  })
})
