import type { Field, FieldAccess, FieldHook, RelationshipField } from 'payload'

const makeSetOwner = (): FieldHook => {
  const setOwner: FieldHook = ({ req, operation, value }) => {
    // `?? value` rather than `?? null`: a Local API create (a seed, a migration, an import) carries
    // no user, and discarding an explicitly supplied owner there would leave the row unowned.
    if (operation === 'create') return req?.user?.id ?? value ?? null

    return value
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
 */
export const ownerField = (
  { relationTo }: { relationTo: RelationshipField['relationTo'] },
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
      beforeChange: [makeSetOwner()],
      ...hooks,
    },
    ...rest,
    // Payload's `Field` is a discriminated union; spreading `overrides` over a literal widens it
    // past any single branch, so the cast reshapes a literal this function authored rather than
    // narrowing unknown data.
  } as Field
}
