import type {
  Access,
  BasePayload,
  FieldAccess,
  FieldHook,
  PayloadRequest,
  TypedUser,
} from 'payload'

/**
 * Fixtures for exercising this package's rules, hooks and raw-SQL helpers. `.fixture.ts` is
 * excluded from every package's build tsconfig, so nothing here reaches `dist` or becomes a
 * published subpath.
 *
 * Payload's argument types nest the whole `PayloadRequest` and `BasePayload` - hundreds of fields,
 * a handful of which anything in this package reads - and building a real one needs a live
 * instance and a database. So each literal is reshaped to its parameter type at this one place
 * rather than at every call site. Nothing here narrows external data: every object is written a
 * line or two above the reshape.
 */
const asRequest = (user: unknown): PayloadRequest => ({ user }) as unknown as PayloadRequest

/** Collection-level access args for a caller with the given user (null for anonymous). */
export const accessArgs = (user: unknown): Parameters<Access>[0] => ({ req: asRequest(user) })

/**
 * An authenticated user for the id-comparison helpers. `id` is deliberately wider than Payload's
 * own type: a row whose id came back null is exactly the case `isSameUser` has to refuse.
 */
export const userFixture = (id: unknown, extra: Record<string, unknown> = {}): TypedUser =>
  ({ id, collection: 'users', ...extra }) as unknown as TypedUser

/**
 * The context Payload passes an admin `condition` as its third argument. Fields here read `data`
 * and `siblingData` only, so the rest is filled in once.
 */
export const conditionContext = {
  blockData: {},
  operation: 'create' as const,
  path: [],
  user: null,
}

/**
 * Field-level access args. `doc`, `id` and `data` are populated separately because Payload fills a
 * DIFFERENT subset of them in each of the three code paths that run field access, and which one
 * carries the id is the whole question a self-access rule answers.
 */
export const fieldAccessArgs = (
  user: unknown,
  extra: { doc?: unknown; id?: number | string; data?: unknown } = {},
): Parameters<FieldAccess>[0] => ({ req: asRequest(user), ...extra }) as Parameters<FieldAccess>[0]

/** Field-hook args, for the `beforeChange` hooks this package installs on its field factories. */
export const fieldHookArgs = (args: {
  user?: unknown
  operation?: 'create' | 'update'
  value?: unknown
  data?: unknown
  /** Omit `req` entirely, as a Local API call reaching a field hook does. */
  withoutRequest?: boolean
}): Parameters<FieldHook>[0] => {
  const { user, operation, value, data, withoutRequest } = args

  return {
    ...(withoutRequest ? {} : { req: asRequest(user) }),
    operation,
    value,
    data,
  } as Parameters<FieldHook>[0]
}

/** A request carrying only the parts a helper under test reads. */
export const requestFixture = (parts: {
  user?: unknown
  query?: Record<string, unknown>
  payload?: unknown
  transactionID?: number | string | Promise<number | string>
  context?: Record<string, unknown>
}): PayloadRequest => ({ context: {}, ...parts }) as unknown as PayloadRequest

/** A payload instance carrying only the parts a helper under test reads. */
export const payloadFixture = (parts: Record<string, unknown>): BasePayload =>
  parts as unknown as BasePayload

/**
 * A `payload.db.drizzle` stand-in that answers `execute` from a queued list and records the SQL it
 * was handed, so a test can assert both the outcome and the statement that produced it.
 *
 * Drizzle builds a template into `queryChunks`, so the recorded text is the fragments the helper
 * assembled - which is what identifier interpolation has to be checked against.
 */
export const fakeDrizzle = (responses: unknown[]) => {
  const statements: string[] = []
  let call = 0

  const execute = (query: unknown) => {
    const chunks =
      query && typeof query === 'object' && 'queryChunks' in query ? query.queryChunks : query

    statements.push(JSON.stringify(chunks))

    return Promise.resolve(responses[call++])
  }

  // A transaction runs its callback against a handle drawing from the SAME queue, so a test writes
  // one list of responses in the order the statements are actually issued.
  const transaction = <T>(work: (tx: { execute: typeof execute }) => Promise<T>) =>
    work({ execute })

  return { statements, calls: () => call, drizzle: { execute, transaction } }
}
