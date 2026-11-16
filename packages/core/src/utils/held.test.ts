import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHeld } from './held.js'

describe('createHeld', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reuses a value until its time is up', async () => {
    const held = createHeld<number>({ maxEntries: 10 })
    const load = vi.fn(async () => load.mock.calls.length)

    expect(await held.read('a', 20, load)).toBe(1)
    vi.advanceTimersByTime(19_000)
    expect(await held.read('a', 20, load)).toBe(1)
    vi.advanceTimersByTime(2000)
    expect(await held.read('a', 20, load)).toBe(2)
  })

  it('shares one load between callers that ask together', async () => {
    const held = createHeld<string>({ maxEntries: 10 })
    const load = vi.fn(async () => 'value')

    await Promise.all([held.read('a', 20, load), held.read('a', 20, load)])

    expect(load).toHaveBeenCalledTimes(1)
  })

  // A failure that was held would be served until its time ran out, hiding a recovery.
  it('does not hold a value that keep refuses', async () => {
    const held = createHeld<number>({ maxEntries: 10, keep: (value) => value > 0 })
    const load = vi.fn(async () => 0)

    await held.read('a', 20, load)
    await held.read('a', 20, load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads past a held value on refresh and holds the new one', async () => {
    const held = createHeld<number>({ maxEntries: 10 })

    await held.read('a', 20, async () => 1)

    expect(await held.refresh('a', 20, async () => 2)).toBe(2)
    expect(await held.read('a', 20, async () => 3)).toBe(2)
  })

  it('drops the oldest entries past its size', async () => {
    const held = createHeld<number>({ maxEntries: 2 })

    held.set('a', 20, 1)
    held.set('b', 20, 2)
    held.set('c', 20, 3)

    expect(await held.read('a', 20, async () => 9)).toBe(9)
    expect(await held.read('c', 20, async () => 9)).toBe(3)
  })

  it('frees a key whose load failed, so the next read tries again', async () => {
    const held = createHeld<number>({ maxEntries: 10 })

    await expect(
      held.read('a', 20, async () => {
        throw new Error('down')
      }),
    ).rejects.toThrow('down')
    expect(await held.read('a', 20, async () => 4)).toBe(4)
  })
})
