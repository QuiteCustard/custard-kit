import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAfterResponse } from './after-response.js'
import { payloadFixture } from '@quitecustard/payload/payload.fixture.js'

const { after } = await import('next/server')

vi.mock('next/server', () => ({ after: vi.fn() }))

/** Outside a request scope - scripts, seeding - Next's `after` throws rather than deferring. */
const outsideRequestScope = () => {
  vi.mocked(after).mockImplementation(() => {
    throw new Error('`after` was called outside a request scope')
  })
}

/** Inside one, `after` takes the callback and runs it once the response has been sent. */
const insideRequestScope = () => {
  const deferred: (() => Promise<void> | void)[] = []

  vi.mocked(after).mockImplementation((work: unknown) => {
    if (typeof work === 'function') deferred.push(work as () => Promise<void>)
  })

  return { flush: () => Promise.all(deferred.map((work) => work())) }
}

const errors: unknown[] = []
const payload = payloadFixture({ logger: { error: (...args: unknown[]) => errors.push(args) } })

beforeEach(() => {
  errors.length = 0
  vi.mocked(after).mockReset()
})

describe('runAfterResponse', () => {
  it('defers the work inside a request scope, and does not await it', async () => {
    const scope = insideRequestScope()
    let ran = false

    await runAfterResponse(payload, async () => {
      ran = true
    })

    expect(ran).toBe(false)

    await scope.flush()

    expect(ran).toBe(true)
  })

  // The flag is load-bearing for anything reconciling against a DELETE: deferred work runs
  // post-commit and must NOT reuse the triggering req, while inline work runs inside the caller's
  // still-open transaction and must be threaded req to see it.
  it('tells the work it was deferred', async () => {
    const scope = insideRequestScope()
    const seen: boolean[] = []

    await runAfterResponse(payload, async (deferred) => {
      seen.push(deferred)
    })
    await scope.flush()

    expect(seen).toEqual([true])
  })

  it('runs the work inline outside a request scope, and awaits it', async () => {
    outsideRequestScope()
    const seen: boolean[] = []

    await runAfterResponse(payload, async (deferred) => {
      seen.push(deferred)
    })

    expect(seen).toEqual([false])
  })

  // An unhandled rejection inside an `after()` callback has nowhere to surface, so the work is
  // guarded on both paths.
  it('logs rather than throwing when deferred work fails', async () => {
    const scope = insideRequestScope()

    await runAfterResponse(payload, () => Promise.reject(new Error('recompute failed')))
    await expect(scope.flush()).resolves.toBeDefined()

    expect(errors).toHaveLength(1)
  })

  it('logs rather than throwing when inline work fails', async () => {
    outsideRequestScope()

    await expect(
      runAfterResponse(payload, () => Promise.reject(new Error('recompute failed'))),
    ).resolves.toBeUndefined()

    expect(errors).toHaveLength(1)
  })

  it('resolves before the deferred work has finished', async () => {
    const scope = insideRequestScope()
    let finished = false

    await runAfterResponse(payload, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      finished = true
    })

    expect(finished).toBe(false)

    await scope.flush()

    expect(finished).toBe(true)
  })
})
