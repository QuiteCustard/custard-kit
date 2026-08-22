import type { Where } from 'payload'

/**
 * The public row set for a draft-enabled collection. Spread it into a `where` alongside other keys,
 * or drop it into an `and` array:
 *
 * ```ts
 * where: { ...publishedWhere, slug: { equals } }
 * ```
 *
 * State it explicitly on every read that bypasses access control - a cached or unauthenticated read
 * has no user, and a collection that gates anonymous reads to nothing returns ZERO rows under an
 * enforced read. One definition keeps the access rule and the bypassing read from drifting apart.
 * Guard it with `!draft`: previewing the unpublished version is what the draft branch is for.
 *
 * NOT for a query that merely happens to filter on `_status`. A hook asking "which of these are
 * currently published" is expressing its own logic, not this policy, and should say so in full.
 */
export const publishedWhere = { _status: { equals: 'published' } } satisfies Where
