/**
 * The rows a raw `db.execute` returned, across driver shapes: node-postgres wraps them in `rows`,
 * other drivers hand back a plain array. Rows come out as `unknown` - narrow each one structurally
 * rather than asserting a shape the driver never promised.
 *
 * ```ts
 * const rows = resultRows(await payload.db.drizzle.execute(sql`SELECT id FROM widgets`))
 * ```
 */
export const resultRows = (result: unknown): unknown[] => {
  if (Array.isArray(result)) return result

  if (typeof result !== 'object' || result === null) return []

  if ('rows' in result && Array.isArray(result.rows)) return result.rows

  return []
}

/**
 * How many rows a raw `db.execute` AFFECTED. Use it where the count decides whether a conditional
 * UPDATE won a race - that answer must not depend on which shape today's adapter returns.
 *
 * An explicit `rowCount` wins over the returned rows, so this is not `resultRows(result).length`:
 * node-postgres answers an UPDATE or DELETE with no RETURNING as `{ rows: [], rowCount: 3 }`, and
 * counting the empty array would report nothing changed for a write that changed three.
 */
export const rowCount = (result: unknown): number => {
  if (Array.isArray(result)) return result.length

  if (typeof result !== 'object' || result === null) return 0

  // `rowCount` first, and this order is load-bearing: node-postgres answers an UPDATE or DELETE
  // with no RETURNING as `{ rows: [], rowCount: 3 }` - the array is present and EMPTY, so reading
  // it first reports 0 affected rows for a write that changed three. Where a driver reports both
  // for a SELECT they agree, so nothing is lost by preferring the explicit count.
  if ('rowCount' in result && typeof result.rowCount === 'number') return result.rowCount

  if ('rows' in result && Array.isArray(result.rows)) return result.rows.length

  return 0
}
