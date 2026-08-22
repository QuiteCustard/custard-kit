import { describe, expect, it } from 'vitest'
import { withSuppressedContext } from './suppress-context.js'
import { requestFixture } from '@quitecustard/payload/payload.fixture.js'

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('withSuppressedContext', () => {
  it('sets the flags for the duration of the work and restores them after', async () => {
    const req = requestFixture({ context: {} })
    const seen: unknown[] = []

    await withSuppressedContext(req, ['skipCascade'], async () => {
      seen.push(req.context.skipCascade)
    })

    expect(seen).toEqual([true])
    expect(req.context.skipCascade).toBeUndefined()
  })

  it('restores a pre-existing value rather than deleting it', async () => {
    const req = requestFixture({ context: { skipCascade: 'original' } })

    await withSuppressedContext(req, ['skipCascade'], async () => {
      expect(req.context.skipCascade).toBe(true)
    })

    expect(req.context.skipCascade).toBe('original')
  })

  it('handles several flags at once', async () => {
    const req = requestFixture({ context: {} })

    await withSuppressedContext(req, ['a', 'b'], async () => {
      expect(req.context.a).toBe(true)
      expect(req.context.b).toBe(true)
    })

    expect(req.context.a).toBeUndefined()
    expect(req.context.b).toBeUndefined()
  })

  it('restores the flags even when the work throws, and rethrows', async () => {
    const req = requestFixture({ context: {} })

    await expect(
      withSuppressedContext(req, ['skipCascade'], () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom')

    expect(req.context.skipCascade).toBeUndefined()
  })

  it('returns whatever the work returned', async () => {
    const req = requestFixture({ context: {} })

    await expect(withSuppressedContext(req, ['x'], async () => 42)).resolves.toBe(42)
  })

  // THE bug this exists to prevent. Payload builds every document's hook chain up front with an
  // eager `docs.map(async …)` and runs them against ONE shared `req.context`. With the naive
  // capture-set-restore, the second chain captures the first's mid-flight `true`, and whichever
  // `finally` lands last restores that `true` PERMANENTLY - silently suppressing every remaining
  // hook in the bulk operation.
  it('survives interleaved chains sharing one context', async () => {
    const req = requestFixture({ context: {} })
    const insideFirst: unknown[] = []

    const first = withSuppressedContext(req, ['skipCascade'], async () => {
      await settle()
      await settle()
      insideFirst.push(req.context.skipCascade)
    })

    const second = withSuppressedContext(req, ['skipCascade'], async () => {
      await settle()
    })

    await Promise.all([first, second])

    // The inner chain saw the flag set, and the outer exit put it back exactly once.
    expect(insideFirst).toEqual([true])
    expect(req.context.skipCascade).toBeUndefined()
  })

  it('restores the ORIGINAL value after interleaved chains, not a mid-flight true', async () => {
    const req = requestFixture({ context: { skipCascade: false } })

    await Promise.all([
      withSuppressedContext(req, ['skipCascade'], () => settle().then(settle)),
      withSuppressedContext(req, ['skipCascade'], () => settle()),
      withSuppressedContext(req, ['skipCascade'], () => settle().then(settle).then(settle)),
    ])

    expect(req.context.skipCascade).toBe(false)
  })

  it('keeps the flag set while any chain is still inside', async () => {
    const req = requestFixture({ context: {} })
    let releaseInner = () => {}
    const innerHeld = new Promise<void>((resolve) => {
      releaseInner = resolve
    })

    const outer = withSuppressedContext(req, ['skipCascade'], () => innerHeld)
    const inner = withSuppressedContext(req, ['skipCascade'], async () => settle())

    await inner

    // The short chain has exited; the long one has not, so the flag must still be set.
    expect(req.context.skipCascade).toBe(true)

    releaseInner()
    await outer

    expect(req.context.skipCascade).toBeUndefined()
  })

  // req.context is open storage keyed by string - anything else in the request could have written
  // the bookkeeping key, so it is read back structurally rather than trusted.
  it('survives a context whose bookkeeping keys hold junk', async () => {
    const req = requestFixture({
      context: { suppressedContextCounts: 'not a bag', suppressedContextBase: 7 },
    })

    await withSuppressedContext(req, ['skipCascade'], async () => {
      expect(req.context.skipCascade).toBe(true)
    })

    expect(req.context.skipCascade).toBeUndefined()
  })

  it('sets no flag for an empty flag list', async () => {
    const req = requestFixture({ context: {} })

    await expect(withSuppressedContext(req, [], async () => 'done')).resolves.toBe('done')

    // The bookkeeping bags are created up front, so only their emptiness says nothing was set.
    expect(req.context.suppressedContextCounts).toEqual({})
    expect(req.context.suppressedContextBase).toEqual({})
  })
})
