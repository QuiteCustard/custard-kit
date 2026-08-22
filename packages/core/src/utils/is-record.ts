/**
 * Narrow an `unknown` to an indexable object, so its properties can be read without an assertion.
 *
 * `typeof null === 'object'`, which is why the null check is not optional. Arrays pass: they ARE
 * indexable objects, and the relation narrows rely on that. Use `isPlainObject` where an array
 * must be rejected.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** As `isRecord`, minus arrays - for walkers that recurse into objects and lists differently. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value)
