'use client'
import { useState, useTransition } from 'react'
import { unstable_rethrow, useRouter } from 'next/navigation.js'

// Narrowed from `unknown` rather than constrained on the generic: actions return unions like
// `{ error } | { id }`, and a result arm carrying no `error` key at all still has to pass through.
const errorOf = (result: unknown): string | null => {
  if (typeof result !== 'object' || result === null || !('error' in result)) return null

  const { error } = result

  return typeof error === 'string' ? error : null
}

/** What `useActionRunner` shows when an action throws instead of answering. */
export type ActionRunnerOptions = {
  /** Set as `error` when the action throws. Defaults to "Something went wrong. Please try again." */
  failureMessage?: string
}

/**
 * Runs a server action from a client component: clears the last error, runs the action inside a
 * transition (so `isPending` can disable the caller's controls), sets `error` when the action
 * answers with a string `error`, and otherwise refreshes the route.
 *
 * An action that throws instead - a dropped connection, a crashed action - sets `error` to
 * `failureMessage` and logs the error, rather than reaching the nearest error boundary and
 * replacing the page. Next's own `redirect()` and `notFound()` still pass through.
 *
 * `onSuccess` receives the action's own result and runs on the non-error path only, BEFORE the
 * refresh - for local state the refresh would otherwise race (a cleared search box, a closed
 * editor).
 *
 * Needs the `next` peer dependency (it reads the App Router's `useRouter`).
 */
export const useActionRunner = ({
  failureMessage = 'Something went wrong. Please try again.',
}: ActionRunnerOptions = {}) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = <T>(action: () => Promise<T>, onSuccess?: (result: T) => void) => {
    setError(null)
    startTransition(async () => {
      let result: T

      try {
        result = await action()
      } catch (thrown) {
        unstable_rethrow(thrown)
        console.error('[action] failed', thrown)
        setError(failureMessage)
        return
      }

      const refused = errorOf(result)

      if (refused != null) {
        setError(refused)
        return
      }

      onSuccess?.(result)
      router.refresh()
    })
  }

  return { run, isPending, error, setError }
}
