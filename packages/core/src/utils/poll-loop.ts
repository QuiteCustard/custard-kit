export type PollLoopOptions = {
  intervalMs: number
  /** False skips the poll made as the loop starts. Default true. */
  immediate?: boolean
  /** The slowest a hidden page polls: no faster than this. Default 5 s. */
  hiddenFloorMs?: number
  /** How long a page may stay hidden before the loop stops polling. Default 10 minutes. */
  idleAfterMs?: number
}

/**
 * Calls `poll` every `intervalMs` in a browser page, and returns the function that stops it.
 * `poll` is not awaited, so a slow one does not delay the next.
 *
 * A hidden page (a background tab, a browser source outside the live scene) polls no faster than
 * `hiddenFloorMs`, and stops once it has been hidden for `idleAfterMs`. Becoming visible polls at
 * once and resumes. Needs `document`: call it from browser code, such as an effect.
 */
export const startPollLoop = (
  poll: () => void,
  {
    intervalMs,
    immediate = true,
    hiddenFloorMs = 5000,
    idleAfterMs = 10 * 60_000,
  }: PollLoopOptions,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let hiddenSince: number | null = document.hidden ? Date.now() : null

  const schedule = () => {
    if (hiddenSince !== null && Date.now() - hiddenSince >= idleAfterMs) return

    timer = setTimeout(
      () => {
        poll()
        schedule()
      },
      hiddenSince === null ? intervalMs : Math.max(intervalMs, hiddenFloorMs),
    )
  }

  const onVisibility = () => {
    if (document.hidden) {
      hiddenSince = Date.now()
      return
    }

    hiddenSince = null
    if (timer !== null) clearTimeout(timer)
    poll()
    schedule()
  }

  if (immediate) poll()
  schedule()
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    if (timer !== null) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
