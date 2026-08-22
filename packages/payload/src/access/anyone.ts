import type { Access, FieldAccess } from 'payload'

/** Open to every caller, authenticated or not - for public reads. */
export const anyone: Access = () => true

/** The field-level shape of `anyone`, for a field inside an otherwise gated collection. */
export const anyoneFieldLevel: FieldAccess = () => true

/**
 * Sealed: no caller of any role, including admin. For a collection the application writes to only
 * through the Local API (which bypasses access), where every REST/GraphQL operation should refuse.
 */
export const nobody: Access = () => false
