// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionRunner } from './use-action-runner.js'

const refresh = vi.fn()

// Next marks its own control-flow errors (redirect, notFound) with a `NEXT_` digest; the real
// `unstable_rethrow` throws those back out and ignores everything else.
const nextRedirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/x' })

vi.mock('next/navigation.js', () => ({
  useRouter: () => ({ refresh }),
  unstable_rethrow: (error: unknown) => {
    if (error === nextRedirect) throw error
  },
}))

const runAction = async <T>(
  hook: { current: ReturnType<typeof useActionRunner> },
  action: () => Promise<T>,
  onSuccess?: (result: T) => void,
) => {
  await act(async () => {
    hook.current.run(action, onSuccess)
  })
}

describe('useActionRunner', () => {
  beforeEach(() => {
    refresh.mockClear()
  })

  it('refreshes the route after an action that does not refuse', async () => {
    const { result } = renderHook(() => useActionRunner())

    await runAction(result, async () => ({ id: 7 }))

    expect(result.current.error).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  // The trap: a refresh after a refusal re-renders the form from server data and wipes what the
  // user typed, alongside an error telling them to fix it.
  it('surfaces a refusal and neither refreshes nor calls onSuccess', async () => {
    const { result } = renderHook(() => useActionRunner())
    const onSuccess = vi.fn()

    await runAction(result, async () => ({ error: 'Name is taken.' }), onSuccess)

    expect(result.current.error).toBe('Name is taken.')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('hands onSuccess the result before the refresh', async () => {
    const { result } = renderHook(() => useActionRunner())
    const order: string[] = []

    refresh.mockImplementationOnce(() => order.push('refresh'))

    await runAction(
      result,
      async () => ({ id: 7 }),
      (value) => order.push(`success ${value.id}`),
    )

    expect(order).toEqual(['success 7', 'refresh'])
  })

  it('clears the last error when the next action starts', async () => {
    const { result } = renderHook(() => useActionRunner())

    await runAction(result, async () => ({ error: 'Name is taken.' }))
    await runAction(result, async () => ({}))

    expect(result.current.error).toBeNull()
  })

  it('treats only a string error as a refusal', async () => {
    const { result } = renderHook(() => useActionRunner())

    for (const value of [undefined, null, 'done', { error: undefined }, { error: 404 }])
      await runAction(result, async () => value)

    expect(result.current.error).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(5)
  })

  // The trap: a thrown action escapes the transition to the nearest error boundary, which replaces
  // the whole section instead of showing a message beside the form.
  it('shows the failure message for an action that throws, and neither refreshes nor calls onSuccess', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useActionRunner({ failureMessage: 'Could not save.' }))
    const onSuccess = vi.fn()

    await runAction(
      result,
      async () => {
        throw new Error('fetch failed')
      },
      onSuccess,
    )

    expect(result.current.error).toBe('Could not save.')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('has a plain default failure message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useActionRunner())

    await runAction(result, async () => {
      throw new Error('fetch failed')
    })

    expect(result.current.error).toBe('Something went wrong. Please try again.')
  })

  it('lets Next’s own redirect through instead of showing it as a failure', async () => {
    const { result } = renderHook(() => useActionRunner())

    await expect(
      runAction(result, async () => {
        throw nextRedirect
      }),
    ).rejects.toBe(nextRedirect)
    expect(result.current.error).toBeNull()
  })

  it('lets the caller set and clear the error', async () => {
    const { result } = renderHook(() => useActionRunner())

    act(() => result.current.setError('Pick a file first.'))
    expect(result.current.error).toBe('Pick a file first.')

    act(() => result.current.setError(null))
    expect(result.current.error).toBeNull()
  })
})
