// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionRunner } from './use-action-runner.js'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

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

  it('lets the caller set and clear the error', async () => {
    const { result } = renderHook(() => useActionRunner())

    act(() => result.current.setError('Pick a file first.'))
    expect(result.current.error).toBe('Pick a file first.')

    act(() => result.current.setError(null))
    expect(result.current.error).toBeNull()
  })
})
