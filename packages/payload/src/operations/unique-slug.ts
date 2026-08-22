import { normaliseSlug } from '@quitecustard/core/format/normalise'

/**
 * A slug derived from `base` that is not already taken, appending an incrementing numeric suffix
 * (from 2) until `isTaken` returns false.
 *
 * `normalise` defaults to `normaliseSlug`; pass `normaliseUsernameSlug` for handles, so the
 * suffixed candidates don't re-strip the dots and underscores it preserves.
 *
 * Throws when `base` has no slug-safe characters at all - an emoji-only or purely punctuation name
 * normalises to `''`, and an empty slug would otherwise be returned as if it were a valid one.
 * The caller owns that fallback, since only it knows what to name the doc.
 */
export const uniqueSuffixedSlug = async (
  base: string,
  isTaken: (slug: string) => boolean | Promise<boolean>,
  normalise: (input?: string) => string = normaliseSlug,
): Promise<string> => {
  const baseSlug = normalise(base)

  if (!baseSlug) throw new Error(`Cannot derive a slug from ${JSON.stringify(base)}`)

  if (!(await isTaken(baseSlug))) return baseSlug

  let suffix = 2

  while (await isTaken(normalise(`${base}-${suffix}`))) suffix++

  return normalise(`${base}-${suffix}`)
}
