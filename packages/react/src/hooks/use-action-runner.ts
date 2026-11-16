'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation.js'

// Narrowed from `unknown` rather than constrained on the generic: actions return unions like
// `{ error } | { id }`, and a result arm carrying no `error` key at all still has to pass through.
const errorOf = (result: unknown): string | null => {
  if (typeof result !== 'object' || result === null || !('error' in result)) return null

  const { error } = result

  return typeof error === 'string' ? error : null
}

/**
 * Runs a server action from a client component: clears the last error, runs the action inside a
 * transition (so `isPending` can disable the caller's controls), sets `error` when the action
 * answers with a string `error`, and otherwise refreshes the route.
 *
 * `onSuccess` receives the action's own result and runs on the non-error path only, BEFORE the
 * refresh - for local state the refresh would otherwise race (a cleared search box, a closed
 * editor).
 *
 * Needs the `next` peer dependency (it reads the App Router's `useRouter`).
 */
export const useActionRunner = () => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = <T>(action: () => Promise<T>, onSuccess?: (result: T) => void) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
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
