import { describe, expect, it, vi } from 'vitest'
import { sleep } from './sleep.js'

describe('sleep', () => {
  it('resolves only once the delay has elapsed', async () => {
    vi.useFakeTimers()

    try {
      const settled = vi.fn()
      const pending = sleep(1000).then(settled)

      await vi.advanceTimersByTimeAsync(999)
      expect(settled).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await pending

      expect(settled).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves on the next tick for a zero delay', async () => {
    await expect(sleep(0)).resolves.toBeUndefined()
  })
})
