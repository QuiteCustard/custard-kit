import type { Field, FieldAccess, FieldHook, RelationshipField, TypedUser } from 'payload'

type GetUserId = (user: TypedUser) => unknown

const defaultUserId: GetUserId = (user) => user.id

const makeSetOwner = (getUserId: GetUserId): FieldHook => {
  const setOwner: FieldHook = ({ req, operation, value }) => {
    if (operation !== 'create') return value

    const user = req?.user

    // No caller at all: a Local API create (a seed, a migration, an import) carries no user, and
    // discarding an explicitly supplied owner there would leave the row unowned.
    if (!user) return value ?? null

    // A caller who is not an owner-able account (`getUserId` answers null) stamps nobody. The
    // supplied value is NOT a fallback here, or that caller could name any owner it liked.
    return getUserId(user) ?? null
  }

  return setOwner
}

/**
 * A relationship field to the auth collection, auto-stamped to the creating user: forced on create,
 * and refused on update by field-level access, so ownership can't be reassigned through the admin
 * form OR a direct REST/GraphQL write. Pass your own `access.update` to override that.
 *
 * `readAccess` gates who can read the owner back (default: nobody outside admin write access, i.e.
 * whatever the collection's own field defaults would apply - pass your own, e.g. a "staff" field
 * check, to expose it to more than the record itself needs).
 *
 * ```ts
 * ownerField({ relationTo: 'users' }, { readAccess: staffFieldLevel })
 * ```
 *
 * `getUserId` resolves the id to stamp from the caller, defaulting to `user.id`. A project with
 * more than one auth collection passes its own, returning null for a caller that is not an
 * account `relationTo` can point at - an API-key client, say - so that caller's id is never
 * written into a relationship to a different collection.
 */
export const ownerField = (
  {
    relationTo,
    getUserId = defaultUserId,
  }: { relationTo: RelationshipField['relationTo']; getUserId?: GetUserId },
  {
    readAccess,
    ...overrides
  }: Partial<Omit<RelationshipField, 'type' | 'relationTo'>> & {
    readAccess?: FieldAccess
  } = {},
): Field => {
  const { admin, hooks, access, ...rest } = overrides

  return {
    name: 'owner',
    type: 'relationship',
    relationTo,
    access: {
      // Field-level update access is what actually refuses a reassignment. `admin.readOnly` only
      // greys the input out in the admin panel; Payload never consults it on a REST or GraphQL
      // write, and the hook's update branch passes the incoming value straight through.
      update: () => false,
      ...(readAccess && { read: readAccess }),
      ...access,
    },
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'User who created this. Set automatically.',
      ...admin,
    },
    hooks: {
      beforeChange: [makeSetOwner(getUserId)],
      ...hooks,
    },
    ...rest,
    // Payload's `Field` is a discriminated union; spreading `overrides` over a literal widens it
    // past any single branch, so the cast reshapes a literal this function authored rather than
    // narrowing unknown data.
  } as Field
}
