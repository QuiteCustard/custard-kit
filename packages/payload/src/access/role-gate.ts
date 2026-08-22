import type { Access, ClientUser, FieldAccess, TypedUser } from 'payload'

/**
 * Anything a role can be read off: the user shapes Payload hands to access rules, the absent
 * cases, and any other object that may carry roles (some admin-UI surfaces narrow a user to fewer
 * fields than the runtime object actually has). Predicates taking a user should use this rather
 * than restating a shape - the body narrows defensively, where a cast at the call site would not.
 */
export type RoleCaller = TypedUser | ClientUser | Record<string, unknown> | null | undefined

/**
 * The single role-reading idiom - read this off a caller rather than indexing `.roles` directly,
 * so a caller with no roles field, or one that isn't an array, reads as "no role" instead of
 * throwing. Pass an array to test several roles at once - it matches if the caller holds any.
 *
 * ```ts
 * export const admin: Access = ({ req: { user } }) => hasRole(user, 'admin')
 * ```
 */
export const hasRole = <R extends string>(caller: RoleCaller, role: R | R[]): boolean => {
  if (typeof caller !== 'object' || caller === null || !('roles' in caller)) return false

  const held: unknown = caller.roles

  if (!Array.isArray(held)) return false

  return (Array.isArray(role) ? role : [role]).some((wanted) => held.includes(wanted))
}

/** An `Access` rule that passes when the caller holds any of `roles`. */
export const roleGate =
  <R extends string>(roles: R | R[]): Access =>
  ({ req: { user } }) =>
    hasRole(user, roles)

/** The field-level equivalent of `roleGate`. */
export const roleGateFieldLevel =
  <R extends string>(roles: R | R[]): FieldAccess =>
  ({ req: { user } }) =>
    hasRole(user, roles)
