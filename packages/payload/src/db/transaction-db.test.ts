import { describe, expect, it } from 'vitest'
import { transactionDb } from './transaction-db.js'
import { payloadFixture } from '@quitecustard/payload/payload.fixture.js'

const rootHandle = { name: 'root' }
const sessionHandle = { name: 'session' }

const payload = payloadFixture({
  db: { drizzle: rootHandle, sessions: { 42: { db: sessionHandle }, abc: { db: sessionHandle } } },
})

describe('transactionDb', () => {
  // The whole point: a statement on the root handle runs on a DIFFERENT connection from the open
  // transaction, so it cannot see the uncommitted parent row (foreign key violation) and can
  // deadlock against locks the outer transaction already holds.
  it('returns the session handle for an open transaction', () => {
    expect(transactionDb(payload, 42)).toBe(sessionHandle)
    expect(transactionDb(payload, 'abc')).toBe(sessionHandle)
  })

  it('falls back to the pooled root handle with no transaction id', () => {
    expect(transactionDb(payload)).toBe(rootHandle)
    expect(transactionDb(payload, undefined)).toBe(rootHandle)
    expect(transactionDb(payload, null)).toBe(rootHandle)
  })

  // An id that names no open session must not silently return undefined for a caller to call
  // .execute on.
  it('falls back to the root handle for an unknown transaction id', () => {
    expect(transactionDb(payload, 999)).toBe(rootHandle)
    expect(transactionDb(payload, 'nope')).toBe(rootHandle)
  })

  it('falls back to the root handle when the adapter tracks no sessions at all', () => {
    const sessionless = payloadFixture({ db: { drizzle: rootHandle } })

    expect(transactionDb(sessionless, 42)).toBe(rootHandle)
  })
})
