// An in-memory cache for one server process: on serverless, each instance holds its own copies.
// It exists so a value read every few seconds is not written to a platform data cache, which
// bills each rewrite.

type Entry<T> = { value: T; until: number }

export type Held<T> = {
  /** The held value for `key` while it is fresh, else what `load` gives, held for `seconds`. */
  read: (key: string, seconds: number, load: () => Promise<T>) => Promise<T>
  /** Loads past any held value and holds the new one. */
  refresh: (key: string, seconds: number, load: () => Promise<T>) => Promise<T>
  /** Holds `value` for `key`, as a write that changed it would. */
  set: (key: string, seconds: number, value: T) => void
}

/**
 * An in-memory hold for values keyed by string, each kept for the seconds its caller asks. Callers
 * that ask for a key while it is loading share that one load. Past `maxEntries` the oldest write
 * is dropped. `keep` returning false leaves a loaded value unheld: a failure, for example, so the
 * next read tries again.
 */
export const createHeld = <T>({
  maxEntries,
  keep = () => true,
}: {
  maxEntries: number
  keep?: (value: T) => boolean
}): Held<T> => {
  const entries = new Map<string, Entry<T>>()
  const loading = new Map<string, Promise<T>>()

  const set = (key: string, seconds: number, value: T) => {
    // Re-inserting moves the key to the end, so the first key is always the oldest write.
    entries.delete(key)
    entries.set(key, { value, until: Date.now() + seconds * 1000 })

    for (const oldest of entries.keys()) {
      if (entries.size <= maxEntries) break

      entries.delete(oldest)
    }
  }

  const refresh = async (key: string, seconds: number, load: () => Promise<T>): Promise<T> => {
    const open = loading.get(key)
    if (open) return open

    const run = (async () => {
      try {
        const value = await load()
        if (keep(value)) set(key, seconds, value)

        return value
      } finally {
        loading.delete(key)
      }
    })()
    loading.set(key, run)

    return run
  }

  const read = async (key: string, seconds: number, load: () => Promise<T>): Promise<T> => {
    const entry = entries.get(key)
    if (entry && entry.until > Date.now()) return entry.value

    return refresh(key, seconds, load)
  }

  return { read, refresh, set }
}
