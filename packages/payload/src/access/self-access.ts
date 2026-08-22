import type { FieldAccess, FieldAccessArgs, TypedUser } from 'payload'
import { hasRole } from './role-gate.js'

const defaultUserId = (user: TypedUser | null): unknown => user?.id ?? null

/**
 * THE self check - the authenticated caller is the document being addressed. `getUserId` lets a
 * project with more than one auth collection (or an id namespace shared across them) resolve the
 * comparable id itself; it defaults to the plain `user.id`.
 *
 * `String(...)` on both sides: REST carries the id through as a path string while `user.id` comes
 * off the row as a number, so a bare `===` is `5 === '5'` and denies a legitimate self-edit.
 */
export const isSameUser = (
  user: TypedUser | null,
  docId: unknown,
  getUserId: (user: TypedUser | null) => unknown = defaultUserId,
): boolean => {
  const userId = getUserId(user)
  return userId != null && docId != null && String(userId) === String(docId)
}

/**
 * Whether a field-level access request is for the requesting user's own document.
 *
 * Field access runs in three Payload code paths that each populate a DIFFERENT subset of the args
 * with the document id:
 *   - afterRead redaction (REST/Local API reads) passes `doc` (plus `data` and `id`)
 *   - the docAccess permission calc passes `doc`/`data` but not `id`
 *   - buildFormState - which renders the admin edit/account form - passes `id` and `data` but NO `doc`
 * Checking `doc.id` alone silently returns false in the form-state path, so a non-admin viewing
 * their own record in the admin panel loses every self-guarded field. Resolve the id from
 * whichever arg the current path provided.
 *
 * 🔴 `data` is deliberately NOT consulted: it is the incoming request body, so `{"id": <my own
 * id>}` would satisfy the check on someone else's document. Payload leaves BOTH `doc` and `id`
 * undefined on `create`, which is why this returns false there - a document that does not exist
 * yet has no owner to be.
 */
export const isSelfFieldLevel = (
  { req: { user }, id, doc }: FieldAccessArgs,
  getUserId?: (user: TypedUser | null) => unknown,
): boolean => isSameUser(user, doc?.id ?? id, getUserId)

/** `isSelfFieldLevel`, plus any role in `adminRoles` (default `'admin'`). */
export const selfOrAdminFieldLevel =
  (
    adminRoles: string | string[] = 'admin',
    getUserId?: (user: TypedUser | null) => unknown,
  ): FieldAccess =>
  (args) =>
    hasRole(args.req.user, adminRoles) || isSelfFieldLevel(args, getUserId)
