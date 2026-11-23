// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPollLoop } from './poll-loop.js'

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('startPollLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('polls at once, then every interval, until stopped', () => {
    const poll = vi.fn()
    const stop = startPollLoop(poll, { intervalMs: 1000 })

    expect(poll).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(poll).toHaveBeenCalledTimes(4)

    stop()
    vi.advanceTimersByTime(3000)
    expect(poll).toHaveBeenCalledTimes(4)
  })

  it('skips the first poll when not immediate', () => {
    const poll = vi.fn()
    const stop = startPollLoop(poll, { intervalMs: 1000, immediate: false })

    expect(poll).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(poll).toHaveBeenCalledTimes(1)
    stop()
  })

  it('slows while hidden, and polls at once on becoming visible', () => {
    const poll = vi.fn()
    const stop = startPollLoop(poll, { intervalMs: 1000, immediate: false, hiddenFloorMs: 5000 })

    setHidden(true)
    vi.advanceTimersByTime(1000)
    poll.mockClear()
    vi.advanceTimersByTime(4000)
    expect(poll).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(1000)
    expect(poll).toHaveBeenCalledTimes(1)

    setHidden(false)
    expect(poll).toHaveBeenCalledTimes(2)
    stop()
  })

  // A browser source left out of the live scene would otherwise poll for the whole broadcast.
  it('stops polling once hidden past the idle time', () => {
    const poll = vi.fn()
    const stop = startPollLoop(poll, {
      intervalMs: 1000,
      immediate: false,
      hiddenFloorMs: 1000,
      idleAfterMs: 3000,
    })

    setHidden(true)
    vi.advanceTimersByTime(10_000)
    const polled = poll.mock.calls.length
    vi.advanceTimersByTime(10_000)

    expect(poll).toHaveBeenCalledTimes(polled)
    expect(polled).toBeLessThanOrEqual(4)
    stop()
  })

  // A sync throw used to skip scheduling the next poll, stopping the loop for good.
  it('keeps polling after a poll throws, and logs it', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const poll = vi.fn(() => {
      throw new Error('offline')
    })
    const stop = startPollLoop(poll, { intervalMs: 1000 })

    vi.advanceTimersByTime(2000)

    expect(poll).toHaveBeenCalledTimes(3)
    expect(logged).toHaveBeenCalledWith('[poll-loop] poll failed', expect.any(Error))
    stop()
  })

  // A data poll is async; its rejection would otherwise be unhandled on every tick.
  it('catches an async poll that rejects', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    const stop = startPollLoop(() => Promise.reject(new Error('offline')), { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(logged).toHaveBeenCalledTimes(2)
    expect(unhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', unhandled)
    stop()
  })
})
