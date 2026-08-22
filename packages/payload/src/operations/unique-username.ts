import type { BasePayload, CollectionSlug } from 'payload'
import { normaliseUsernameSlug } from '@quitecustard/core/format/normalise'

/** Which collection and column hold the usernames being allocated from. */
export type UniqueUsernameOptions = {
  /** Auth collection the usernames live in. Defaults to `users`. */
  collection?: CollectionSlug
  /** Field holding the username. Defaults to `username`. */
  field?: string
  /**
   * Names already handed out in memory, treated as taken. For a bulk caller creating many users
   * concurrently in one run; each candidate this resolves is added to the set.
   */
  reserved?: Set<string>
}

/**
 * A username derived from `base` that nobody currently holds - the base itself where it is free,
 * otherwise a numeric suffix.
 *
 * ```ts
 * const username = await resolveUniqueUsername('ada.lovelace', payload)
 * const handle = await resolveUniqueUsername(name, payload, { collection: 'members', field: 'handle' })
 * ```
 *
 * Each candidate is checked with its own exact-match count rather than prefetching lookalikes with
 * `like`: a prefetch capped at N rows goes blind past N matches and can hand back a name that IS
 * taken, failing the create on the unique constraint. The common case costs one query.
 *
 * `reserved` candidates are claimed SYNCHRONOUSLY, before the DB probe's await yields, so two
 * parallel allocations can never probe the same candidate and both see it free. A candidate the DB
 * then reports taken stays reserved; burning it costs nothing, since handing it to a sibling would
 * only fail their create.
 *
 * Two simultaneous creates in DIFFERENT processes can still reach the same answer. Keep the unique
 * index on the column as the backstop: the loser's create throws, and the caller retries with a
 * fresh resolve.
 *
 * Throws when `base` has no slug-safe characters at all, matching `uniqueSuffixedSlug` - otherwise
 * an emoji-only or purely punctuation name would normalise to '', and every such base would collide
 * on the same empty username.
 */
export const resolveUniqueUsername = async (
  base: string,
  payload: BasePayload,
  { collection = 'users', field = 'username', reserved }: UniqueUsernameOptions = {},
): Promise<string> => {
  const normalised = normaliseUsernameSlug(base)

  if (!normalised) throw new Error(`Cannot derive a username from ${JSON.stringify(base)}`)

  // Claims the i-th candidate unless a parallel allocation already holds it. Synchronous on purpose
  // - no await between the reserved check and the add (see above).
  const claimCandidate = (i: number): string | undefined => {
    const candidate = i === 0 ? normalised : `${normalised}${i}`

    if (reserved?.has(candidate)) return undefined

    reserved?.add(candidate)
    return candidate
  }

  for (let i = 0; ; i++) {
    const candidate = claimCandidate(i)

    if (!candidate) continue

    const { totalDocs } = await payload.count({
      collection,
      where: { [field]: { equals: candidate } },
    })

    if (totalDocs === 0) return candidate
  }
}
