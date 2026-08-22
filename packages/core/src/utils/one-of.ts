/**
 * Type guard for an `as const` literal union - narrows instead of asserting.
 */
export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && values.some((candidate) => candidate === value)
